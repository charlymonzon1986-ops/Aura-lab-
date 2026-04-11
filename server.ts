console.log("🚀 Server module loading...");
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
import B2 from 'backblaze-b2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize B2 Client
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID || '',
  applicationKey: process.env.B2_APPLICATION_KEY || ''
});

let b2Authorized = false;
async function authorizeB2() {
  if (b2Authorized) return;
  try {
    await b2.authorize();
    b2Authorized = true;
    console.log("✅ Backblaze B2 Authorized");
  } catch (err) {
    console.error("❌ Failed to authorize Backblaze B2:", err);
  }
}

// Helper to upload to B2
async function uploadToB2(buffer: Buffer, fileName: string, contentType: string) {
  try {
    await authorizeB2();
    const bucketName = process.env.B2_BUCKET_NAME;
    if (!bucketName) throw new Error("B2_BUCKET_NAME not configured");

    const bucketResponse = await b2.getBucket({ bucketName });
    const bucketId = bucketResponse.data.buckets[0].bucketId;

    const uploadUrlResponse = await b2.getUploadUrl({ bucketId });
    const { uploadUrl, authorizationToken } = uploadUrlResponse.data;

    const uploadResponse = await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName,
      data: buffer,
      contentType
    });

    const endpoint = process.env.B2_ENDPOINT || 'f000.backblazeb2.com';
    return `https://${endpoint}/file/${bucketName}/${fileName}`;
  } catch (err) {
    console.error("Error uploading to B2:", err);
    throw err;
  }
}

// Helper to delete from B2
async function deleteFromB2(fileUrl: string) {
  try {
    await authorizeB2();
    const bucketName = process.env.B2_BUCKET_NAME;
    if (!bucketName) return;

    // Extract fileName from URL: https://endpoint/file/bucketName/fileName
    const urlParts = fileUrl.split(`/file/${bucketName}/`);
    if (urlParts.length < 2) return;
    const fileName = decodeURIComponent(urlParts[1]);

    // B2 delete requires fileId, so we need to find it first
    const fileInfo = await b2.listFileNames({
      bucketId: (await b2.getBucket({ bucketName })).data.buckets[0].bucketId,
      startFileName: fileName,
      maxFileCount: 1,
      prefix: fileName
    });

    const file = fileInfo.data.files.find((f: any) => f.fileName === fileName);
    if (file) {
      await b2.deleteFileVersion({
        fileId: file.fileId,
        fileName: file.fileName
      });
      console.log(`🗑️ B2 file deleted: ${fileName}`);
    }
  } catch (err) {
    console.error("Error deleting from B2:", err);
  }
}

// Multer configuration for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
});

// Helper to generate thumbnails
async function generateThumbnail(buffer: Buffer, fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  const isRaw = ['.arw', '.cr2', '.nef', '.dng', '.orf', '.raf'].includes(ext);
  
  try {
    if (isRaw) {
      // For RAW, we need a temp file for exiftool
      const tempPath = path.join('/tmp', `raw-${Date.now()}${ext}`);
      const thumbTempPath = path.join('/tmp', `thumb-${Date.now()}.jpg`);
      fs.writeFileSync(tempPath, buffer);
      
      try {
        await exiftool.extractPreview(tempPath, thumbTempPath);
        const thumbBuffer = fs.readFileSync(thumbTempPath);
        const processedThumb = await sharp(thumbBuffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        
        // Cleanup temp files
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        if (fs.existsSync(thumbTempPath)) fs.unlinkSync(thumbTempPath);
        
        return processedThumb;
      } catch (err) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        if (fs.existsSync(thumbTempPath)) fs.unlinkSync(thumbTempPath);
        throw err;
      }
    } else {
      return await sharp(buffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    }
  } catch (err) {
    console.error("Error generating thumbnail:", err);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  // Diagnostic route
  app.get("/api/debug-storage", async (req, res) => {
    res.json({ 
      storageStatus: "Using Backblaze B2",
      bucketName: process.env.B2_BUCKET_NAME
    });
  });

  app.post("/api/ping-post", (req, res) => {
    res.json({ status: "ok", receivedBody: req.body });
  });

  // Mercado Pago Configuration
  const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-YOUR-ACCESS-TOKEN' 
  });

  // API Routes
  app.post("/api/create-preference", async (req, res) => {
    try {
      const { planName, price, userId } = req.body;

      const preference = new Preference(client);
      const result = await preference.create({
        body: {
          items: [
            {
              id: planName,
              title: `Aura Lab - Plan ${planName}`,
              quantity: 1,
              unit_price: Number(price),
              currency_id: 'ARS'
            }
          ],
          back_urls: {
            success: `${req.headers.origin}/payment-success`,
            failure: `${req.headers.origin}/payment-failure`,
            pending: `${req.headers.origin}/payment-pending`,
          },
          auto_return: 'approved',
          external_reference: userId,
          notification_url: `${req.headers.origin}/api/webhook/mercadopago`
        }
      });

      res.json({ id: result.id, init_point: result.init_point });
    } catch (error) {
      console.error("Error creating MP preference:", error);
      res.status(500).json({ error: "Error al crear la preferencia de pago" });
    }
  });

  app.post("/api/webhook/mercadopago", async (req, res) => {
    // Here you would handle the payment notification and update the user plan in Firestore
    console.log("MP Webhook received:", req.body);
    res.sendStatus(200);
  });

  // GitHub OAuth Routes
  app.get("/api/auth/github/url", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "GITHUB_CLIENT_ID no configurado" });
    }

    const baseUrl = process.env.APP_URL || req.headers.origin;
    const redirectUri = `${baseUrl}/auth/github/callback`;
    console.log("🚀 GitHub Auth Attempt - Redirect URI:", redirectUri);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "read:user user:email",
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  app.get("/auth/github/callback", async (req, res) => {
    const { code } = req.query;
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!code) {
      return res.status(400).send("Código de autorización faltante");
    }

    try {
      // Exchange code for access token
      const tokenResponse = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: clientId,
          client_secret: clientSecret,
          code,
        },
        {
          headers: { Accept: "application/json" },
        }
      );

      const accessToken = tokenResponse.data.access_token;

      if (!accessToken) {
        throw new Error("No se pudo obtener el token de acceso");
      }

      // Get user info
      const userResponse = await axios.get("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Send success message and close popup
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  provider: 'github',
                  user: ${JSON.stringify(userResponse.data)}
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Autenticación exitosa. Esta ventana se cerrará automáticamente.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Error en GitHub OAuth Callback:", error.response?.data || error.message);
      res.status(500).send("Error durante la autenticación con GitHub");
    }
  });

  // Delete endpoint for B2 files
  app.post("/api/delete-file", async (req, res) => {
    try {
      const { url, thumbnailUrl } = req.body;
      if (!url) return res.status(400).json({ error: "No URL provided" });

      await deleteFromB2(url);
      if (thumbnailUrl && thumbnailUrl !== url) {
        await deleteFromB2(thumbnailUrl);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error al eliminar archivo en B2:", error);
      res.status(500).json({ error: "Error al eliminar el archivo", details: error.message });
    }
  });

  // Upload endpoint using Backblaze B2
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      console.log(`B2 upload started: ${file.originalname} (${file.size} bytes)`);

      const timestamp = Date.now();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
      const fileName = `${timestamp}-${safeName}`;

      // 1. Upload main file to B2
      const finalUrl = await uploadToB2(file.buffer, fileName, file.mimetype);
      console.log(`✅ Archivo subido a B2: ${finalUrl}`);

      // 2. Generate and upload thumbnail
      let thumbnailUrl = finalUrl;
      const thumbBuffer = await generateThumbnail(file.buffer, file.originalname);
      
      if (thumbBuffer) {
        const thumbName = `thumb-${timestamp}-${path.parse(safeName).name}.jpg`;
        thumbnailUrl = await uploadToB2(thumbBuffer, thumbName, 'image/jpeg');
        console.log(`✅ Miniatura subida a B2: ${thumbnailUrl}`);
      }
      
      return res.json({ 
        url: finalUrl, 
        thumbnailUrl: thumbnailUrl,
        isLocal: false 
      });
    } catch (error: any) {
      console.error("Error en subida a B2:", error);
      return res.status(500).json({ error: "Error al guardar el archivo en B2", details: error.message });
    }
  });

  // Route to process RAW thumbnail (legacy support if needed, but /api/upload handles it now)
  app.post("/api/process-raw-thumb", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const thumbBuffer = await generateThumbnail(file.buffer, file.originalname);
      if (!thumbBuffer) throw new Error("Could not generate thumbnail");

      const timestamp = Date.now();
      const thumbName = `thumb-${timestamp}-${path.parse(file.originalname).name}.jpg`;
      const thumbnailUrl = await uploadToB2(thumbBuffer, thumbName, 'image/jpeg');

      return res.json({ 
        thumbnailUrl: thumbnailUrl
      });
    } catch (error: any) {
      console.error("Error processing RAW thumbnail:", error);
      return res.status(500).json({ error: "Error processing RAW thumbnail", details: error.message });
    }
  });

  // Vite middleware for development
  const isProd = process.env.NODE_ENV === "production";
  const distPath = path.join(process.cwd(), 'dist');

  if (!isProd) {
    console.log("Starting in DEVELOPMENT mode with Vite middleware");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log(`Starting in PRODUCTION mode serving from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  try {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on http://0.0.0.0:${PORT} [${process.env.NODE_ENV || 'development'}]`);
    }).on('error', (err: any) => {
      console.error("❌ Server listen error:", err);
    });
  } catch (err) {
    console.error("❌ Failed to call app.listen:", err);
  }

  return app;
}

export const appPromise = startServer().catch((err) => {
  console.error("CRITICAL: Failed to start server:", err);
});

export default appPromise;
