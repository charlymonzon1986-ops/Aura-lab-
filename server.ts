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
import { GoogleGenAI } from "@google/genai";

// Optimize sharp for Cloud Run (reduce memory usage)
sharp.cache(false);
if (process.env.K_SERVICE) {
  sharp.concurrency(1);
}

import { exiftool } from "exiftool-vendored";
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { Resend } from 'resend';
import B2Package from 'backblaze-b2';
// Handle ESM/CJS import differences
const B2 = (B2Package as any).default || B2Package;
import archiver from 'archiver';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import os from 'os';

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

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

async function startServer() {
  const app = express();

  // Basic health check
  app.get("/health", (req, res) => res.status(200).send("OK"));

  // Middlewares
  app.use(express.json({ limit: '50mb' }));
  
  // Restricted CORS
  const allowedOrigins = [
    process.env.APP_URL,
    'http://localhost:3000',
    'https://ais-dev-dzoo7j464lydyn4jz4bkge-351091137310.us-east1.run.app',
    'https://ais-pre-dzoo7j464lydyn4jz4bkge-351091137310.us-east1.run.app'
  ].filter(Boolean) as string[];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.run.app')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));

  // Firebase Auth Middleware
  const authenticate = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (error) {
      console.error('Error verifying token:', error);
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  };

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
      const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(process.cwd(), 'service-account.json');
      const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      
      if (saJson) {
        console.log("🔐 Initializing Firebase with JSON string from environment...");
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(saJson)),
          projectId: fbConfig.projectId
        });
      } else if (fs.existsSync(saPath)) {
        console.log(`🔐 Initializing Firebase with file: ${saPath}`);
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(fs.readFileSync(saPath, 'utf-8'))),
          projectId: fbConfig.projectId
        });
      } else {
        console.log("🛡️ Initializing Firebase with default credentials...");
        admin.initializeApp({ projectId: fbConfig.projectId });
      }
    }
    fsDb = getFirestore(admin.app(), fbConfig.firestoreDatabaseId);
    console.log(`✅ Firebase initialized for project: ${fbConfig.projectId}, DB: ${fbConfig.firestoreDatabaseId || '(default)'}`);
  } catch (err) {
    console.error("⚠️ Firebase Fallback:", err);
    fsDb = { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }), update: () => Promise.resolve(), set: () => Promise.resolve() }) }) } as any;
  }

  const b2 = new B2({
    applicationKeyId: process.env.B2_KEY_ID || 'dummy',
    applicationKey: process.env.B2_APPLICATION_KEY || 'dummy'
  });

  let b2Authorized = false;
  let b2AuthTimer: NodeJS.Timeout | null = null;

  async function authorizeB2() {
    if (b2Authorized) return;
    if (!process.env.B2_KEY_ID || process.env.B2_KEY_ID === 'dummy' || !process.env.B2_APPLICATION_KEY || process.env.B2_APPLICATION_KEY === 'dummy') {
      throw new Error("Backblaze B2 credentials (B2_KEY_ID and B2_APPLICATION_KEY) are missing or set to 'dummy'. Please configure them in the settings.");
    }
    try {
      await b2.authorize();
      console.log("✅ B2 Authorized successfully");
      b2Authorized = true;
      
      if (b2AuthTimer) clearTimeout(b2AuthTimer);
      // Refresh every 12h
      b2AuthTimer = setTimeout(() => { 
        b2Authorized = false; 
        b2AuthTimer = null;
      }, 12 * 60 * 60 * 1000);
    } catch (err) {
      console.error("❌ B2 Authorization failed:", err);
      // Don't set b2Authorized=true so it can retry
    }
  }

  // Helpers
  async function uploadToB2(buffer: Buffer, fileName: string, contentType: string) {
    try {
      await authorizeB2();
      const bucketName = process.env.B2_BUCKET_NAME;
      if (!bucketName) throw new Error("B2_BUCKET_NAME environment variable is missing.");
      
      const bucketResponse = await b2.getBucket({ bucketName });
      if (!bucketResponse.data.buckets || bucketResponse.data.buckets.length === 0) {
        throw new Error(`B2 Bucket "${bucketName}" not found. Verify your B2 configuration.`);
      }
      
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
        const tempDir = path.join(os.tmpdir(), 'aura-lab-uploads');
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
          console.error("RAW Extraction error:", e);
        } finally {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          if (fs.existsSync(thumbTempPath)) fs.unlinkSync(thumbTempPath);
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
      res.setHeader('Access-Control-Allow-Origin', '*');
      const ext = path.extname(req.params.fileName).toLowerCase();
      const mimes: any = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      if (mimes[ext]) res.setHeader('Content-Type', mimes[ext]);
      res.send(Buffer.from(data));
    } catch { res.status(404).send("Not found"); }
  });

  let mpClient: MercadoPagoConfig | null = null;
  function getMP() {
    if (!mpClient) {
      mpClient = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST' });
    }
    return mpClient;
  }

  let resendClient: Resend | null = null;
  function getResend() {
    if (!resendClient) {
      const key = process.env.RESEND_API_KEY;
      if (!key) {
        console.warn("⚠️ RESEND_API_KEY is not defined. Email features will fail.");
        return null;
      }
      resendClient = new Resend(key);
    }
    return resendClient;
  }

  app.get("/api/admin/config-check", authenticate, async (req: any, res) => {
    try {
      const userDoc = await fsDb.collection("users").doc(req.user.uid).get();
      if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: Admins only" });
      }
      
      res.json({ 
        gemini_ai: !!process.env.GEMINI_API_KEY, 
        mercadopago: !!process.env.MERCADOPAGO_ACCESS_TOKEN, 
        resend: !!process.env.RESEND_API_KEY, 
        b2: !!process.env.B2_APPLICATION_KEY, 
        prod: isProd 
      });
    } catch (err) {
      res.status(500).json({ error: "Check failed" });
    }
  });

  // REMOVED INSECURE ENDPOINT /api/config/gemini

  app.post("/api/create-preference", authenticate, async (req: any, res) => {
    try {
      const { planName, price } = req.body;
      const userId = req.user.uid;
      const pref = new Preference(getMP());
      const hostUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

      const result = await pref.create({
        body: {
          items: [{ 
            id: planName, 
            title: `Aura Plan ${planName}`, 
            quantity: 1, 
            unit_price: Number(price), 
            currency_id: 'ARS' 
          }],
          back_urls: { 
            success: `${hostUrl}/payment-success`, 
            failure: `${hostUrl}/payment-failure`, 
            pending: `${hostUrl}/payment-pending` 
          },
          auto_return: 'approved', 
          external_reference: userId, 
          notification_url: `${hostUrl}/api/webhook/mercadopago`
        }
      });
      res.json({ id: result.id, init_point: result.init_point });
    } catch (e) { 
      console.error("MP Preference Error:", e);
      res.status(500).json({ error: "MP Error" }); 
    }
  });

  app.post("/api/webhook/mercadopago", async (req, res) => {
    try {
      const { action, data } = req.body;
      
      // Note: Real signature verification would require a secret key (MERCADOPAGO_WEB_HOOK_SECRET)
      // and checking the x-signature header using crypto.
      
      if (action === "payment.created" || req.query.topic === "payment") {
        const paymentId = data?.id || req.query.id;
        const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, { 
          headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } 
        });
        const p = response.data;
        if (p.status === "approved") {
          const userId = p.external_reference;
          const plan = (p.additional_info?.items?.[0]?.id || p.description?.split('Plan ')[1] || 'free').toLowerCase();
          
          // Verify that the payment actually matches what we expect (amount etc)
          // ...
          
          await fsDb.collection("users").doc(userId).update({ 
            plan, 
            lastPaymentId: paymentId, 
            updatedAt: new Date().toISOString() 
          });
        }
      }
      res.sendStatus(200);
    } catch (e) { 
      console.error("Webhook Error:", e);
      res.sendStatus(500); 
    }
  });

  // REMOVED DEAD GITHUB OAUTH CODE

  app.post("/api/export/batch", authenticate, async (req: any, res) => {
    const { photos, quality = 90 } = req.body;
    const arc = archiver('zip', { zlib: { level: 9 } });
    res.attachment(`aura-export-${Date.now()}.zip`);
    arc.pipe(res);
    for (const ph of photos) {
      try {
        // Ownership check
        if (ph.userId !== req.user.uid) continue;

        let b: Buffer;
        if (ph.url && typeof ph.url === 'string' && ph.url.startsWith('/api/b2-proxy/')) {
          b = await downloadFromB2(decodeURIComponent(ph.url.split('/api/b2-proxy/')[1]));
        } else if (ph.url.includes('firebasestorage.googleapis.com')) {
          // Allow Firebase Storage
          b = (await axios.get(ph.url, { responseType: 'arraybuffer' })).data;
        } else {
          // Reject other sources to prevent proxy abuse
          console.warn(`Blocked batch export from unauthorized source: ${ph.url}`);
          continue;
        }
        const s = ph.settings;
        
        // Comprehensive adjustment pipeline using sharp
        let pipe = sharp(b);
        
        // 1. Exposure / Brightness / Contrast
        const brightness = (s.brightness || 100) / 100;
        const exposureAdjustment = s.exposure || 0; // rough mapping
        const saturation = (s.saturation || 100) / 100;
        
        // Modulate handles brightness, saturation
        pipe = pipe.modulate({ 
          brightness: brightness + (exposureAdjustment * 0.1), 
          saturation: saturation 
        });

        // 2. Highlights / Shadows (Approximated with gamma and linear)
        // Fix for inconsistent logic: defaults are 100
        if (s.highlights < 100) {
          pipe = pipe.gamma(1.0 + (100 - s.highlights) / 100);
        } else if (s.highlights > 100) {
          pipe = pipe.gamma(1.0 - (s.highlights - 100) / 200);
        }

        if (s.shadows < 100) {
          pipe = pipe.gamma(1.0 + (100 - s.shadows) / 200);
        } else if (s.shadows > 100) {
          pipe = pipe.gamma(1.0 - (s.shadows - 100) / 100);
        }

        // 3. Contrast
        if (s.contrast !== 100) {
          pipe = pipe.linear((s.contrast || 100) / 100, -(s.contrast || 100) + 100);
        }

        // 4. Warmth / Tint (Approximated with tinting)
        if (Math.abs(s.warmth || 0) > 2) {
          const w = (s.warmth || 0) / 100;
          // Shifting towards Yellow/Warm (reduce Blue) or Blue/Cool (reduce Red/Green)
          if (w > 0) pipe = pipe.tint({ r: 255, g: 255 - (w * 20), b: 255 - (w * 120) });
          else pipe = pipe.tint({ r: 255 + (w * 100), g: 255 + (w * 20), b: 255 });
        }
        if (Math.abs(s.tint || 0) > 2) {
          const t = (s.tint || 0) / 100;
          // Shifting towards Magenta (reduce Green) or Green (reduce Red/Blue)
          if (t > 0) pipe = pipe.tint({ r: 255, g: 255 - (t * 120), b: 255 });
          else pipe = pipe.tint({ r: 255 + (t * 60), g: 255, b: 255 + (t * 60) });
        }

        // 5. Sharpening / Noise
        if (s.sharpening > 0) pipe = pipe.sharpen({ sigma: s.sharpening / 20 });
        if (s.noiseReduction > 0) pipe = pipe.blur((s.noiseReduction / 10) + 0.1);

        // 6. Sepia / Vignette (Limited support in sharp but can do basic overlay)
        if (s.sepia > 0) pipe = pipe.modulate({ saturation: 0 }).tint('#704214');

        arc.append(await pipe.jpeg({ quality }).toBuffer(), { name: `${ph.title || 'photo'}-${ph.id.slice(0, 5)}.jpg` });
      } catch {}
    }
    arc.finalize();
  });

  app.get("/api/gallery/download/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const gallerySnap = await fsDb.collection("galleries").where("slug", "==", slug).limit(1).get();
      if (gallerySnap.empty) return res.status(404).send("Gallery not found");
      
      const gallery = gallerySnap.docs[0].data();
      const photoIds = gallery.photoIds || [];
      if (photoIds.length === 0) return res.status(400).send("Gallery is empty");

      const arc = archiver('zip', { zlib: { level: 6 } });
      res.attachment(`gallery-${slug}.zip`);
      arc.pipe(res);

      for (const pid of photoIds) {
        try {
          const photoDoc = await fsDb.collection("photos").doc(pid).get();
          if (photoDoc.exists) {
            const ph = photoDoc.data();
            let b: Buffer;
            if (ph.url && typeof ph.url === 'string' && ph.url.startsWith('/api/b2-proxy/')) b = await downloadFromB2(decodeURIComponent(ph.url.split('/api/b2-proxy/')[1]));
            else b = (await axios.get(ph.url, { responseType: 'arraybuffer' })).data;
            arc.append(b, { name: `${ph.title || 'photo'}-${pid.slice(0, 5)}.jpg` });
          }
        } catch (e) {}
      }
      arc.finalize();
    } catch (err) {
      res.status(500).send("Error generating download");
    }
  });

  // Storage Debug Route
  app.get("/api/storage-test", authenticate, async (req: any, res) => {
    try {
      if (!process.env.B2_KEY_ID || process.env.B2_KEY_ID === 'dummy') {
        return res.json({ status: "error", message: "B2_KEY_ID missing or dummy" });
      }
      
      console.log("Testing B2 Authorization...");
      const testB2 = new B2({
        applicationKeyId: process.env.B2_KEY_ID,
        applicationKey: process.env.B2_APPLICATION_KEY
      });
      
      const authResponse = await testB2.authorize();
      console.log("B2 Auth Success:", authResponse.data.allowed.bucketName);
      
      const bucketName = process.env.B2_BUCKET_NAME;
      const bucketResponse = await testB2.getBucket({ bucketName });
      
      res.json({ 
        status: "ok", 
        message: "B2 connection successful",
        bucket: bucketName,
        apiUrl: authResponse.data.apiUrl,
        downloadUrl: authResponse.data.downloadUrl
      });
    } catch (err: any) {
      console.error("Storage Test Failed:", err);
      res.status(500).json({ 
        status: "error", 
        message: err.message,
        details: err.response?.data || "No extra details"
      });
    }
  });

  app.get("/api/version", (req, res) => {
    res.json({ latest: "1.3.1" });
  });

  app.post("/api/delete-file", authenticate, async (req: any, res) => {
    try {
      const { url, thumbnailUrl, userId } = req.body;
      if (userId !== req.user.uid) return res.status(403).send("Forbidden");
      if (url) await deleteFromB2(url);
      if (thumbnailUrl && thumbnailUrl !== url) await deleteFromB2(thumbnailUrl);
      res.json({ success: true });
    } catch (err: any) { 
      console.error("Delete Route Error:", err);
      res.status(500).json({ error: err.message || "Delete Error" }); 
    }
  });

  app.post("/api/upload", authenticate, upload.single("file"), async (req: any, res) => {
    try {
      const { file } = req;
      const userId = req.user.uid;
      if (!file || !userId) return res.status(400).send("Missing info");
      const ts = Date.now();
      const name = `${ts}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const url = await uploadToB2(file.buffer, name, file.mimetype);
      let thumb = url;
      const tb = await generateThumbnail(file.buffer, file.originalname);
      if (tb) thumb = await uploadToB2(tb, `thumb-${ts}-${path.parse(name).name}.jpg`, 'image/jpeg');
      // Profile update (Use set with merge: true to avoid PERMISSION_DENIED/NOT_FOUND if doc is missing)
      try {
        await fsDb.collection("users").doc(userId).set({ 
          storageUsed: admin.firestore.FieldValue.increment(file.size), 
          lastUploadAt: new Date().toISOString() 
        }, { merge: true });
      } catch (dbErr: any) {
        console.error("⚠️ Firestore Profile Update Failed:", dbErr.message);
        // We don't fail the whole upload if just the metadata update fails, 
        // but we log it clearly for debugging permissions.
      }
      
      res.json({ url, thumbnailUrl: thumb });
    } catch (err: any) { 
      console.error("Upload Route Error:", err);
      const message = err.message || "Upload Error";
      res.status(500).json({ error: message }); 
    }
  });

  // AI Proxy Routes
  app.post("/api/ai/smart-enhance", authenticate, async (req: any, res) => {
    try {
      if (!genAI) {
        return res.status(500).json({ error: "Gemini API key not configured on server" });
      }

      const { prompt, imageData, mimeType } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: "No image data provided" });
      }

      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: imageData,
                  mimeType: mimeType || "image/jpeg"
                }
              }
            ]
          }
        ]
      });

      let text = response.text || "";
      
      // Clean up markdown code blocks if AI returns them
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();

      res.json({ result: text });
    } catch (error: any) {
      console.error("Gemini AI Error:", error);
      res.status(500).json({ error: error.message || "Error processing AI request" });
    }
  });

  app.post("/api/ai/analyze-photo", authenticate, async (req: any, res) => {
    try {
      if (!genAI) {
        return res.status(500).json({ error: "Gemini API key not configured on server" });
      }

      const { prompt, imageData, mimeType } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: "No image data provided" });
      }

      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: imageData,
                  mimeType: mimeType || "image/jpeg"
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text || "";
      res.json({ result: text });
    } catch (error: any) {
      console.error("Gemini Analyze Error:", error);
      res.status(500).json({ error: error.message || "Error analyzing photo" });
    }
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
        // GEMINI_API_KEY injection REMOVED for security
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
