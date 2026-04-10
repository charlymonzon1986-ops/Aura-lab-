console.log("🚀 Server module loading...");
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import axios from "axios";
// import { exiftool } from "exiftool-vendored";
import { MercadoPagoConfig, Preference } from 'mercadopago';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Firebase Config safely
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (err) {
  console.warn("Could not read firebase-applet-config.json:", err);
}

// Ensure uploads directory exists in /tmp for write access in serverless environments
const UPLOADS_DIR = path.join("/tmp", "aura-uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  // Serve static files from public/uploads BEFORE Vite middleware
  app.use("/uploads", express.static(UPLOADS_DIR));

  // Diagnostic route
  app.get("/api/debug-storage", async (req, res) => {
    res.json({ 
      localUploadsDir: UPLOADS_DIR,
      storageStatus: "Using Local Storage (Firebase Storage is blocked on Spark plan)",
      projectId: firebaseConfig.projectId,
      uploadsCount: fs.readdirSync(UPLOADS_DIR).length
    });
  });

  // Multer configuration for memory storage
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB limit
    },
  });

  // Helper to generate thumbnails
  async function generateThumbnail(filePath: string, fileName: string) {
    const ext = path.extname(fileName).toLowerCase();
    const thumbName = `thumb-${path.parse(fileName).name}.jpg`;
    const thumbPath = path.join(UPLOADS_DIR, thumbName);

    try {
      const isRaw = ['.arw', '.cr2', '.nef', '.dng', '.orf', '.raf'].includes(ext);
      
      if (isRaw) {
        console.log(`RAW preview extraction skipped in production for stability: ${fileName}`);
        // Fallback or skip
        /*
        await exiftool.extractPreview(filePath, thumbPath);
        ...
        */
      } else {
        // Regular image thumbnail
        await sharp(filePath)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(thumbPath);
      }
      
      return `/uploads/${thumbName}`;
    } catch (err) {
      console.error("Error generating thumbnail:", err);
      return null;
    }
  }

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

  // Delete endpoint for local files
  app.post("/api/delete-file", async (req, res) => {
    try {
      const { url, thumbnailUrl } = req.body;
      if (!url) return res.status(400).json({ error: "No URL provided" });

      // Extract filenames
      const fileName = path.basename(url);
      const filePath = path.join(UPLOADS_DIR, fileName);

      // Delete main file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Archivo eliminado: ${filePath}`);
      }

      // Delete thumbnail if exists
      if (thumbnailUrl) {
        const thumbName = path.basename(thumbnailUrl);
        const thumbPath = path.join(UPLOADS_DIR, thumbName);
        if (fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
          console.log(`🗑️ Miniatura eliminada: ${thumbPath}`);
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error al eliminar archivo local:", error);
      res.status(500).json({ error: "Error al eliminar el archivo", details: error.message });
    }
  });

  // Upload endpoint using Local Storage as Primary
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      console.log(`Local upload started: ${file.originalname} (${file.size} bytes)`);

      // Generate a safe filename
      const timestamp = Date.now();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
      const fileName = `${timestamp}-${safeName}`;
      const filePath = path.join(UPLOADS_DIR, fileName);

      // Save file locally
      fs.writeFileSync(filePath, file.buffer);
      
      // Generate thumbnail
      const thumbnailUrl = await generateThumbnail(filePath, fileName);
      
      const finalUrl = `/uploads/${fileName}`;
      console.log(`✅ Archivo guardado localmente: ${finalUrl}`);
      if (thumbnailUrl) console.log(`✅ Miniatura generada: ${thumbnailUrl}`);
      
      return res.json({ 
        url: finalUrl, 
        thumbnailUrl: thumbnailUrl || finalUrl,
        isLocal: true 
      });
    } catch (error: any) {
      console.error("Error en subida local:", error);
      return res.status(500).json({ error: "Error al guardar el archivo localmente", details: error.message });
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
