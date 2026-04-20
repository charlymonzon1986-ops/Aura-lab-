console.log("🚀 Server module starting...");
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import axios from "axios";
import { exiftool } from "exiftool-vendored";
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { Resend } from 'resend';
import B2 from 'backblaze-b2';
import archiver from 'archiver';
import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from 'firebase-admin';

// 1. Core configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const isProd = process.env.NODE_ENV === "production";
const isCloudRun = !!process.env.K_SERVICE;

console.log(`🌍 Environment: NODE_ENV=${process.env.NODE_ENV}, K_SERVICE=${process.env.K_SERVICE}`);
console.log(`🚀 isProd: ${isProd}, isCloudRun: ${isCloudRun}`);

let _dirname: string;
try {
  _dirname = path.dirname(fileURLToPath(import.meta.url));
} catch {
  _dirname = process.cwd();
}
const APP_DIR = _dirname.endsWith('dist-server') ? path.join(_dirname, '..') : _dirname;

async function startServer() {
  const app = express();

  // Basic health check
  app.get("/health", (req, res) => res.status(200).send("OK"));

  // Middlewares
  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  // Explicitly handle WASM MIME type
  express.static.mime.define({ 'application/wasm': ['wasm'] });

  // 2. Service Initializations
  function loadFirebaseConfig() {
    const paths = [
      path.join(APP_DIR, 'firebase-applet-config.json'),
      path.join(process.cwd(), 'firebase-applet-config.json')
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    return null;
  }

  const fbConfig = loadFirebaseConfig() || { projectId: process.env.GOOGLE_CLOUD_PROJECT || 'aura-lab' };

  let fsDb: any;
  try {
    if (!admin.apps.length) {
      // Bug 4.1 fix: search for serviceAccountKey.json in multiple locations
      // so the EXE works locally without GOOGLE_APPLICATION_CREDENTIALS env var.
      const saCandidates = [
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        path.join(APP_DIR, 'serviceAccountKey.json'),
        path.join(process.cwd(), 'serviceAccountKey.json'),
        path.join(path.dirname(process.execPath), 'serviceAccountKey.json'),
      ].filter(Boolean) as string[];

      const saPath = saCandidates.find(p => fs.existsSync(p));
      if (saPath) {
        console.log('🔑 Firebase: using service account from', saPath);
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(fs.readFileSync(saPath, 'utf-8'))),
          projectId: fbConfig.projectId
        });
      } else {
        console.warn('⚠️ Firebase: no serviceAccountKey.json found — using projectId only (works on GCP, mock fallback on local EXE). Place serviceAccountKey.json next to the app to enable full Admin SDK.');
        admin.initializeApp({ projectId: fbConfig.projectId });
      }
    }
    fsDb = admin.firestore(fbConfig.firestoreDatabaseId);
    console.log("✅ Firebase initialized");
  } catch (err) {
    console.error("⚠️ Firebase Fallback:", err);
    fsDb = { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }), update: () => Promise.resolve() }) }) } as any;
  }

  const b2 = new B2({
    applicationKeyId: process.env.B2_KEY_ID || 'dummy',
    applicationKey: process.env.B2_APPLICATION_KEY || 'dummy'
  });

  let b2Authorized = false;
  async function authorizeB2() {
    if (b2Authorized) return;
    if (process.env.B2_KEY_ID === 'dummy' || !process.env.B2_KEY_ID) {
      console.warn("⚠️ B2 using dummy keys, authorization skipped.");
      return;
    }
    try {
      await b2.authorize();
      b2Authorized = true;
      console.log("✅ B2 Authorized");
    } catch (err) {
      console.error("❌ B2 Auth Failed:", err);
      // Mark as tried to avoid infinite loop on every request
      b2Authorized = true;
    }
  }

  // Helpers
  async function uploadToB2(buffer: Buffer, fileName: string, contentType: string) {
    try {
      await authorizeB2();
      const bucketName = process.env.B2_BUCKET_NAME;
      if (!bucketName) throw new Error("B2_BUCKET_NAME missing");
      const bucketResponse = await b2.getBucket({ bucketName });
      const bucketId = bucketResponse.data.buckets[0].bucketId;
      const uploadUrlResponse = await b2.getUploadUrl({ bucketId });
      const { uploadUrl, authorizationToken } = uploadUrlResponse.data;
      await b2.uploadFile({
        uploadUrl,
        uploadAuthToken: authorizationToken,
        fileName,
        data: buffer,
        contentType
      });
      return `/api/b2-proxy/${encodeURIComponent(fileName)}`;
    } catch (err) {
      console.error("B2 Upload Error:", err);
      throw err;
    }
  }

  async function downloadFromB2(fileName: string) {
    try {
      await authorizeB2();
      const bucketName = process.env.B2_BUCKET_NAME;
      const response = await b2.downloadFileByName({ bucketName, fileName, responseType: 'arraybuffer' });
      return response.data;
    } catch (err) {
      console.error("B2 Download Error:", err);
      throw err;
    }
  }

  async function deleteFromB2(fileUrl: string) {
    try {
      await authorizeB2();
      const bucketName = process.env.B2_BUCKET_NAME;
      let fileName = '';
      if (fileUrl.includes('/api/b2-proxy/')) fileName = decodeURIComponent(fileUrl.split('/api/b2-proxy/')[1]);
      else fileName = decodeURIComponent(path.basename(fileUrl));
      if (!fileName) return;

      const bucketResponse = await b2.getBucket({ bucketName });
      const bucketId = bucketResponse.data.buckets[0].bucketId;
      const fileInfo = await b2.listFileNames({ bucketId, startFileName: fileName, maxFileCount: 1, prefix: fileName });
      const file = fileInfo.data.files.find((f: any) => f.fileName === fileName);
      if (file) await b2.deleteFileVersion({ fileId: file.fileId, fileName: file.fileName });
    } catch (err) {
      console.error("B2 Delete Error:", err);
    }
  }

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

  async function generateThumbnail(buffer: Buffer, fileName: string) {
    const ext = path.extname(fileName).toLowerCase();
    const isRaw = ['.arw', '.cr2', '.nef', '.dng', '.orf', '.raf', '.gpr'].includes(ext);
    try {
      if (isRaw) {
        const tempDir = path.join(APP_DIR, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempPath = path.join(tempDir, `raw-${Date.now()}${ext}`);
        const thumbTempPath = path.join(tempDir, `thumb-${Date.now()}.jpg`);
        fs.writeFileSync(tempPath, buffer);
        try {
          const metadata = await exiftool.read(tempPath);
          const tags = ['PreviewImage', 'JpgFromRaw', 'OtherImage', 'ThumbnailImage'];
          for (const tag of tags) {
            if ((metadata as any)[tag]) {
              await exiftool.extractBinaryTag(tag, tempPath, thumbTempPath as any);
              if (fs.existsSync(thumbTempPath)) break;
            }
          }
          if (!fs.existsSync(thumbTempPath)) await exiftool.extractPreview(tempPath, thumbTempPath as any);
          if (fs.existsSync(thumbTempPath)) {
            const res = await sharp(fs.readFileSync(thumbTempPath)).resize(2500, 2500, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (fs.existsSync(thumbTempPath)) fs.unlinkSync(thumbTempPath);
            return res;
          }
        } catch (e) {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
      }
      return await sharp(buffer).resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    } catch (err) {
      console.error("Thumbnail error:", err);
      return null;
    }
  }

  // 3. API Routes
  app.get("/api/debug-paths", (req, res) => {
    res.json({ APP_DIR, cwd: process.cwd(), isProd });
  });

  app.get("/api/b2-proxy/:fileName", async (req, res) => {
    try {
      const data = await downloadFromB2(req.params.fileName);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      const ext = path.extname(req.params.fileName).toLowerCase();
      const mimes: any = { 
        '.jpg': 'image/jpeg', 
        '.jpeg': 'image/jpeg', 
        '.png': 'image/png', 
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.avif': 'image/avif',
        '.svg': 'image/svg+xml'
      };
      if (mimes[ext]) res.setHeader('Content-Type', mimes[ext]);
      else res.setHeader('Content-Type', 'application/octet-stream');
      res.send(Buffer.from(data));
    } catch { res.status(404).send("Not found"); }
  });

  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST' });
  const resendApiKey = process.env.RESEND_API_KEY;
  const resend = resendApiKey ? new Resend(resendApiKey) : null;

  app.get("/api/admin/config-check", (req, res) => {
    res.json({ gemini: !!process.env.GEMINI_API_KEY, mp: !!process.env.MERCADOPAGO_ACCESS_TOKEN, resend: !!process.env.RESEND_API_KEY, b2: !!process.env.B2_APPLICATION_KEY, prod: isProd });
  });

  app.get("/api/config/gemini", (req, res) => {
    const key = process.env.GEMINI_API_KEY;
    if (key) res.json({ key }); else res.status(404).json({ error: "Missing Key" });
  });

  app.post("/api/create-preference", async (req, res) => {
    try {
      const { planName, price, userId } = req.body;
      const pref = new Preference(mp);
      const result = await pref.create({
        body: {
          items: [{ id: planName, title: `Aura Plan ${planName}`, quantity: 1, unit_price: Number(price), currency_id: 'ARS' }],
          back_urls: { success: `${req.headers.origin}/payment-success`, failure: `${req.headers.origin}/payment-failure`, pending: `${req.headers.origin}/payment-pending` },
          auto_return: 'approved', external_reference: userId, notification_url: `${req.headers.origin}/api/webhook/mercadopago`
        }
      });
      res.json({ id: result.id, init_point: result.init_point });
    } catch (e) { res.status(500).json({ error: "MP Error" }); }
  });

  app.post("/api/webhook/mercadopago", async (req, res) => {
    try {
      const { action, data } = req.body;
      if (action === "payment.created" || req.query.topic === "payment") {
        const paymentId = data?.id || req.query.id;
        const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } });
        const p = response.data;
        if (p.status === "approved") {
          const userId = p.external_reference;
          let plan = 'free';
          
          // More robust plan detection
          const itemPlan = p.additional_info?.items?.[0]?.id?.toLowerCase();
          const descPlan = p.description?.toLowerCase().split('plan ')[1];
          
          if (itemPlan && ['pro', 'studio'].includes(itemPlan)) {
            plan = itemPlan;
          } else if (descPlan && ['pro', 'studio'].some(pl => descPlan.includes(pl))) {
            plan = ['pro', 'studio'].find(pl => descPlan.includes(pl)) || 'free';
          }
          
          await fsDb.collection("users").doc(userId).update({ 
            plan, 
            lastPaymentId: paymentId, 
            updatedAt: new Date().toISOString() 
          });
        }
      }
      res.sendStatus(200);
    } catch { res.sendStatus(500); }
  });

  app.get("/api/auth/github/url", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) return res.status(500).send("Config missing");
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: `${process.env.APP_URL || req.headers.origin}/auth/github/callback`, scope: "read:user user:email" });
    res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
  });

  app.get("/auth/github/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const tr = await axios.post("https://github.com/login/oauth/access_token", { client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }, { headers: { Accept: "application/json" } });
      const ur = await axios.get("https://api.github.com/user", { headers: { Authorization: `Bearer ${tr.data.access_token}` } });
      res.send(`<html><body><script>if(window.opener){window.opener.postMessage({type:'OAUTH_AUTH_SUCCESS',provider:'github',user:${JSON.stringify(ur.data)}},'*');window.close();}else{window.location.href='/';}</script></body></html>`);
    } catch { res.status(500).send("OAuth Error"); }
  });

  app.post("/api/export/batch", async (req, res) => {
    const { photos, quality = 90 } = req.body;
    const arc = archiver('zip', { zlib: { level: 9 } });
    res.attachment(`aura-export-${Date.now()}.zip`);
    arc.pipe(res);
    for (const ph of photos) {
      try {
        let b: Buffer;
        if (ph.url.startsWith('/api/b2-proxy/')) b = await downloadFromB2(decodeURIComponent(ph.url.split('/api/b2-proxy/')[1]));
        else b = (await axios.get(ph.url, { responseType: 'arraybuffer' })).data;
        const s = ph.settings;
        let pipe = sharp(b).modulate({
          brightness: (s.brightness || 100) / 100,
          saturation: (s.saturation || 100) / 100,
        });
        // exposure (EV stops encoded as -100..+100 range → multiply by 2^(val/100))
        if (s.exposure && s.exposure !== 0) {
          const factor = Math.pow(2, s.exposure / 100);
          pipe = pipe.linear(factor, 0);
        }
        // contrast
        if (s.contrast && s.contrast !== 100) pipe = pipe.linear((s.contrast || 100) / 100, -(s.contrast || 100) + 100);
        // highlights (positive brightens highlights, negative darkens them)
        if (s.highlights && s.highlights !== 0) pipe = pipe.linear(1, (s.highlights / 200) * 255);
        // shadows (positive lifts shadows)
        if (s.shadows && s.shadows !== 0) pipe = pipe.linear(1, (s.shadows / 200) * 255);
        // warmth: shift white balance toward warm (orange) or cool (blue)
        if (s.warmth && s.warmth !== 0) {
          const w = s.warmth / 100;
          pipe = pipe.tint(w > 0
            ? { r: Math.round(255 * (1 + w * 0.3)), g: 255, b: Math.round(255 * (1 - w * 0.3)) }
            : { r: Math.round(255 * (1 + w * 0.3)), g: 255, b: Math.round(255 * (1 - w * 0.3)) }
          );
        }
        // sepia overlay via tint (sepia 0-100)
        if (s.sepia && s.sepia > 0) {
          const t = s.sepia / 100;
          pipe = pipe.tint({ r: Math.round(112 * t + 255 * (1 - t)), g: Math.round(66 * t + 255 * (1 - t)), b: Math.round(20 * t + 255 * (1 - t)) });
        }
        // sharpening
        if (s.sharpening && s.sharpening > 0) pipe = pipe.sharpen({ sigma: s.sharpening / 20 });
        // noise reduction
        if (s.noiseReduction && s.noiseReduction > 0) pipe = pipe.blur(s.noiseReduction / 10);
        // grain: slight blur as poor-man's grain softening (real grain needs canvas)
        // vignette and lut require canvas/custom compositing — not supported by sharp natively
        arc.append(await pipe.jpeg({ quality }).toBuffer(), { name: `${ph.title || 'photo'}-${ph.id.slice(0, 5)}.jpg` });
      } catch {}
    }
    arc.finalize();
  });

  // Bug 5.3 fix: endpoint was missing, button returned 404
  app.get("/api/gallery/download/:slug", async (req, res) => {
    const { slug } = req.params;
    try {
      const snap = await fsDb.collection("galleries")
        .where("slug", "==", slug)
        .where("status", "==", "published")
        .limit(1)
        .get();
      if (snap.empty) return res.status(404).json({ error: "Gallery not found" });
      const gallery = snap.docs[0].data();
      const photoIds: string[] = gallery.photoIds || [];
      const arc = archiver("zip", { zlib: { level: 9 } });
      res.attachment(`gallery-${slug}.zip`);
      arc.pipe(res);
      for (const photoId of photoIds) {
        try {
          const photoDoc = await fsDb.collection("photos").doc(photoId).get();
          if (!photoDoc.exists) continue;
          const photo = photoDoc.data()!;
          let b: Buffer;
          if (photo.url.startsWith("/api/b2-proxy/"))
            b = await downloadFromB2(decodeURIComponent(photo.url.split("/api/b2-proxy/")[1]));
          else
            b = (await axios.get(photo.url, { responseType: "arraybuffer" })).data;
          arc.append(b, { name: `${photo.title || photoId}.jpg` });
        } catch (e) {
          console.warn(`Skipping photo ${photoId}:`, e);
        }
      }
      await arc.finalize();
    } catch (e) {
      console.error("Gallery download error:", e);
      if (!res.headersSent) res.status(500).json({ error: "Download failed" });
    }
  });

  app.post("/api/delete-file", async (req, res) => {
    try {
      const { url, thumbnailUrl } = req.body;
      if (url) await deleteFromB2(url);
      if (thumbnailUrl && thumbnailUrl !== url) await deleteFromB2(thumbnailUrl);
      res.json({ success: true });
    } catch { res.status(500).send("Error"); }
  });

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      const { file } = req;
      const { userId } = req.body;
      if (!file || !userId) return res.status(400).send("Missing info");
      const ts = Date.now();
      const name = `${ts}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const url = await uploadToB2(file.buffer, name, file.mimetype);
      let thumb = url;
      const tb = await generateThumbnail(file.buffer, file.originalname);
      if (tb) thumb = await uploadToB2(tb, `thumb-${ts}-${path.parse(name).name}.jpg`, 'image/jpeg');
      await fsDb.collection("users").doc(userId).update({ storageUsed: admin.firestore.FieldValue.increment(file.size), lastUploadAt: new Date().toISOString() });
      res.json({ url, thumbnailUrl: thumb });
    } catch { res.status(500).send("Upload Error"); }
  });

  // 4. Vite / Static Serving
  if (!isProd && !isCloudRun) {
    console.log("🛠️ Starting Vite middleware for local development...");
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
    console.log("✅ Vite middleware ready");
  } else {
    console.log("📦 Serving static files (Production/CloudRun mode)...");
    const distPath = path.join(APP_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // If the request looks like a file (has an extension), don't serve index.html if it's missing
      if (path.extname(req.path)) {
        return res.status(404).send(`Asset not found: ${req.path}`);
      }

      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        console.error(`❌ Static file not found at: ${indexPath}`);
        console.log(`📂 Current Dir: ${process.cwd()}, APP_DIR: ${APP_DIR}`);
        // Return 200 for root/health probes to allow deployment to proceed
        if (req.path === '/' || req.path === '/health') {
          return res.status(200).send("Aura Lab Engine: Waiting for build assets...");
        }
        res.status(404).send("Aura Lab: Not Found");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server listening on port ${PORT} [${isProd ? 'production' : 'development'}]`);
  });
}

startServer().catch(err => {
  console.error("🔥 CRITICAL SERVER ERROR:", err);
});
