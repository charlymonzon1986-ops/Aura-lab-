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
import archiver from 'archiver';
import { Photo, LightingSettings } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize B2 Client
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID || '',
  applicationKey: process.env.B2_APPLICATION_KEY || ''
});

let b2Authorized = false;
let b2DownloadUrl = '';

async function authorizeB2() {
  if (b2Authorized) return;
  try {
    const response = await b2.authorize();
    b2Authorized = true;
    b2DownloadUrl = response.data.downloadUrl;
    console.log("✅ Backblaze B2 Authorized. Download URL:", b2DownloadUrl);
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

    console.log(`✅ B2 upload successful: ${fileName}`);
    // We'll use a proxy route to handle private buckets and CORS
    return `/api/b2-proxy/${encodeURIComponent(fileName)}`;
  } catch (err) {
    console.error("Error uploading to B2:", err);
    throw err;
  }
}

// Helper to download from B2 (for proxy)
async function downloadFromB2(fileName: string) {
  try {
    await authorizeB2();
    const bucketName = process.env.B2_BUCKET_NAME;
    if (!bucketName) throw new Error("B2_BUCKET_NAME not configured");

    const response = await b2.downloadFileByName({
      bucketName,
      fileName,
      responseType: 'arraybuffer'
    });
    return response.data;
  } catch (err) {
    console.error("Error downloading from B2:", err);
    throw err;
  }
}

// Helper to delete from B2
async function deleteFromB2(fileUrl: string) {
  try {
    await authorizeB2();
    const bucketName = process.env.B2_BUCKET_NAME;
    if (!bucketName) return;

    let fileName = '';
    if (fileUrl.includes('/api/b2-proxy/')) {
      fileName = decodeURIComponent(fileUrl.split('/api/b2-proxy/')[1]);
    } else if (fileUrl.includes(`/file/${bucketName}/`)) {
      fileName = decodeURIComponent(fileUrl.split(`/file/${bucketName}/`)[1]);
    } else {
      // Try to extract from the end of the URL if it's a direct B2 URL but format is different
      fileName = decodeURIComponent(path.basename(fileUrl));
    }

    if (!fileName) return;
    console.log(`🗑️ Attempting to delete from B2: ${fileName}`);

    const bucketResponse = await b2.getBucket({ bucketName });
    const bucketId = bucketResponse.data.buckets[0].bucketId;

    // B2 delete requires fileId, so we need to find it first
    const fileInfo = await b2.listFileNames({
      bucketId,
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
      console.log(`✅ B2 file deleted: ${fileName}`);
    } else {
      console.warn(`⚠️ B2 file not found for deletion: ${fileName}`);
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
      console.log(`[RAW] Processing high-quality extraction for: ${fileName}`);
      // For RAW, we need a temp file for exiftool
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      
      const tempPath = path.join(tempDir, `raw-${Date.now()}${ext}`);
      const thumbTempPath = path.join(tempDir, `thumb-${Date.now()}.jpg`);
      fs.writeFileSync(tempPath, buffer);
      
      try {
        // Try to extract the largest possible preview
        const metadata = await exiftool.read(tempPath);
        
        // Priority list of preview tags (from largest to smallest usually)
        const previewTags = ['PreviewImage', 'JpgFromRaw', 'OtherImage', 'ThumbnailImage'];
        let bestTag = '';
        
        for (const tag of previewTags) {
          if ((metadata as any)[tag]) {
            bestTag = tag;
            break;
          }
        }

        console.log(`[RAW] Best preview tag found: ${bestTag || 'Default'}`);

        if (bestTag && bestTag !== 'ThumbnailImage') {
          // Use extractBinaryTag to extract specific high-res tag
          try {
            await exiftool.extractBinaryTag(bestTag, tempPath, thumbTempPath);
            console.log(`[RAW] Successfully extracted ${bestTag}`);
          } catch (e) {
            console.warn(`[RAW] Failed to extract ${bestTag}, falling back...`);
          }
        }
        
        // Fallback to standard extractPreview if custom failed or not found
        if (!fs.existsSync(thumbTempPath)) {
          await exiftool.extractPreview(tempPath, thumbTempPath);
        }
        
        let thumbBuffer: Buffer;
        if (fs.existsSync(thumbTempPath)) {
          thumbBuffer = fs.readFileSync(thumbTempPath);
          
          // If the extracted preview is too small (e.g. < 100KB), it might be just a thumbnail
          // In that case, we might need a more aggressive approach in a real Electron environment
          console.log(`[RAW] Extracted preview size: ${thumbBuffer.length} bytes`);
        } else {
          console.log(`[RAW] extractPreview failed, trying sharp direct...`);
          thumbBuffer = buffer;
        }

        const processedThumb = await sharp(thumbBuffer)
          .resize(2500, 2500, { // Increased size for better quality in editor
            fit: 'inside', 
            withoutEnlargement: true 
          })
          .jpeg({ 
            quality: 90, // Higher quality
            chromaSubsampling: '4:4:4' 
          })
          .toBuffer();
        
        // Cleanup temp files
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        if (fs.existsSync(thumbTempPath)) fs.unlinkSync(thumbTempPath);
        
        return processedThumb;
      } catch (err) {
        console.error("[RAW] Error in extraction chain:", err);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        if (fs.existsSync(thumbTempPath)) fs.unlinkSync(thumbTempPath);
        
        // Final fallback: try sharp on original buffer
        return await sharp(buffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer()
          .catch(() => null);
      }
    } else {
      return await sharp(buffer)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
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

  // Serve WASM files from sql.js
  const sqlJsDist = path.join(__dirname, 'node_modules', 'sql.js', 'dist');
  if (fs.existsSync(sqlJsDist)) {
    console.log("✅ Serving sql.js WASM from:", sqlJsDist);
    app.use('/sqljs', express.static(sqlJsDist, {
      setHeaders: (res) => {
        res.set('Content-Type', 'application/wasm');
      }
    }));
  }

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

  // B2 Proxy Route
  app.get("/api/b2-proxy/:fileName", async (req, res) => {
    try {
      const { fileName } = req.params;
      console.log(`[Proxy] Requesting: ${fileName}`);
      
      const data = await downloadFromB2(fileName);
      console.log(`[Proxy] Downloaded ${data.byteLength} bytes for ${fileName}`);
      
      // Set cache headers
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      
      // Try to determine content type
      const ext = path.extname(fileName).toLowerCase();
      const mimeTypes: { [key: string]: string } = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.arw': 'image/x-sony-arw',
        '.cr2': 'image/x-canon-cr2',
        '.nef': 'image/x-nikon-nef',
        '.dng': 'image/x-adobe-dng'
      };
      
      if (mimeTypes[ext]) {
        res.setHeader('Content-Type', mimeTypes[ext]);
      }
      
      res.send(Buffer.from(data));
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(404).send("Not found");
    }
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

  // Batch Export Endpoint
  app.post("/api/export/batch", express.json({ limit: '50mb' }), async (req, res) => {
    const { photos, format = 'jpg', quality = 90 } = req.body as { photos: Photo[], format: string, quality: number };
    
    if (!photos || !Array.isArray(photos)) {
      return res.status(400).json({ error: "No photos provided" });
    }

    console.log(`[Batch Export] Starting export for ${photos.length} photos...`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment(`aura-export-${Date.now()}.zip`);
    archive.pipe(res);

    for (const photo of photos) {
      try {
        let buffer: Buffer;
        if (photo.url.startsWith('/api/b2-proxy/')) {
          const fileName = decodeURIComponent(photo.url.split('/api/b2-proxy/')[1]);
          buffer = await downloadFromB2(fileName);
        } else {
          const response = await axios.get(photo.url, { responseType: 'arraybuffer' });
          buffer = Buffer.from(response.data);
        }

        // Apply basic adjustments with sharp (replicating core logic)
        const s = photo.settings;
        let pipeline = sharp(buffer);

        // Basic adjustments
        pipeline = pipeline.modulate({
          brightness: (s.brightness || 100) / 100,
          saturation: (s.saturation || 100) / 100,
        });

        // Contrast
        if (s.contrast !== 100) {
          // Sharp doesn't have a direct contrast modulation like brightness, 
          // but we can use linear or gamma. For simplicity in batch:
          pipeline = pipeline.linear((s.contrast || 100) / 100, -(s.contrast || 100) + 100);
        }

        // Sharpening
        if (s.sharpening > 0) {
          pipeline = pipeline.sharpen({ sigma: s.sharpening / 20 });
        }

        // Blur (Noise Reduction approximation)
        if (s.noiseReduction > 0) {
          pipeline = pipeline.blur(s.noiseReduction / 10);
        }

        const processedBuffer = await pipeline
          .jpeg({ quality })
          .toBuffer();

        const fileName = `${photo.title || 'photo'}-${photo.id.slice(0, 5)}.jpg`;
        archive.append(processedBuffer, { name: fileName });
        console.log(`[Batch Export] Added ${fileName} to archive`);
      } catch (err) {
        console.error(`[Batch Export] Failed to process photo ${photo.id}:`, err);
      }
    }

    archive.finalize();
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
  const distPath = process.env.FE_DIST_PATH || path.join(process.cwd(), 'dist');

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
      // If the request looks like a file (has an extension) and it's not .html, return 404
      // instead of index.html to avoid confusing WASM/JS loaders.
      if (req.path.includes('.') && !req.path.endsWith('.html')) {
        return res.status(404).send('Not Found');
      }
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
