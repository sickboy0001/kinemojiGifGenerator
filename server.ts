import express from "express";
import cors from "cors";
import CryptoJS from "crypto-js";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { gifHandler } from "./src/api/gif-handler.ts";
import { db } from "./src/lib/turso/db.ts";
import { kinemojis } from "./src/db/schema/index.ts";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Dynamic CORS setup
  const isDev = process.env.NODE_ENV === "development";
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
  // Add current Cloud Run URL to allowed origins if it's not there
  const cloudRunUrl = 'https://kinemoji-gif-generator-271122168021.us-west1.run.app';
  if (!allowedOrigins.includes(cloudRunUrl)) {
    allowedOrigins.push(cloudRunUrl);
  }

  app.use(cors({
    origin: (origin, callback) => {
      // Allow all in development
      if (isDev) return callback(null, true);
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  }));

  app.use(express.json());

  // Security Middleware using CryptoJS
  const verifySecurityToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = process.env.FERNET_KEY;
    if (!key) {
      console.warn("FERNET_KEY not set, skipping verification (Development only)");
      return next();
    }

    const token = req.headers['x-security-token'] as string;
    if (!token) {
      return res.status(401).json({ error: "Security token missing" });
    }

    try {
      const bytes = CryptoJS.AES.decrypt(token, key);
      const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedData.startsWith("kinemoji-request:")) {
        return res.status(401).json({ error: "Invalid security token format" });
      }

      const timestamp = parseInt(decryptedData.split(":")[1]);
      const now = Date.now();
      
      // Allow 5 minutes clock skew/validity
      if (isNaN(timestamp) || Math.abs(now - timestamp) > 5 * 60 * 1000) {
        return res.status(401).json({ error: "Security token expired or invalid timestamp" });
      }

      next();
    } catch (e) {
      console.error("Security verification error:", e);
      res.status(401).json({ error: "Security verification failed" });
    }
  };

  // Initialize Database (Non-blocking)
  const initDb = async () => {
    try {
      console.log("Starting database initialization...");
      const sql = `
        CREATE TABLE IF NOT EXISTS kinemojis (
          id TEXT PRIMARY KEY,
          short_id TEXT NOT NULL UNIQUE,
          text TEXT NOT NULL,
          parameters TEXT NOT NULL,
          image_url TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          progress INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          creator_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `;
      // @ts-ignore
      if (db.$client && typeof db.$client.execute === 'function') {
        // @ts-ignore
        await db.$client.execute(sql);
        console.log("Database initialized successfully.");
      } else {
        console.warn("Database client not available for raw execution, skipping table creation.");
      }
    } catch (e) {
      console.error("Database initialization failed (non-fatal):", e);
    }
  };

  // Start DB init but don't await it to prevent blocking server start
  initDb();

  // API Routes
  app.post("/api/kinemoji/gif", verifySecurityToken, gifHandler);
  
  app.get("/api/kinemoji/status/:id", async (req, res) => {
    const { id } = req.params;
    console.log(`Checking status for ID: ${id}`);
    try {
      const result = await db.select().from(kinemojis).where(eq(kinemojis.id, id)).limit(1);
      
      if (result.length === 0) {
        console.log(`Record not found for ID: ${id}`);
        return res.status(404).json({ error: "Not found" });
      }
      
      console.log(`Status for ${id}: ${result[0].status}, Progress: ${result[0].progress}%`);
      console.log(`Full record for ${id}:`, JSON.stringify(result[0]));
      res.json(result[0]);
    } catch (error) {
      console.error("Status check error:", error);
      res.status(500).json({ error: "Database error" });
    }
  });
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (isDev) {
    console.log("Running in DEVELOPMENT mode");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Running in PRODUCTION mode");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: 'index.html' }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`>>> Server is listening on port ${PORT}`);
    console.log(`>>> NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`>>> FERNET_KEY configured: ${!!process.env.FERNET_KEY}`);
  });
}

startServer();
