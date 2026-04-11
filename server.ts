import express from "express";
import cors from "cors";
import fernet from "fernet";
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
  const PORT = 3000;

  // Dynamic CORS setup
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  }));

  app.use(express.json());

  // Fernet Security Middleware
  const verifyFernetToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = process.env.FERNET_KEY;
    if (!key) {
      console.warn("FERNET_KEY not set, skipping verification (Development only)");
      return next();
    }

    const token = req.headers['x-fernet-token'] as string;
    if (!token) {
      return res.status(401).json({ error: "Security token missing" });
    }

    try {
      const secret = new fernet.Secret(key);
      const fernetToken = new fernet.Token({
        secret: secret,
        token: token,
        ttl: 60 // 1 minute TTL for security
      });
      const message = fernetToken.decode();
      if (message) {
        next();
      } else {
        res.status(401).json({ error: "Invalid security token" });
      }
    } catch (e) {
      res.status(401).json({ error: "Security verification failed" });
    }
  };

  // Initialize Database
  try {
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
    // Use the raw client to execute SQL
    // @ts-ignore
    await db.$client.execute(sql);
    console.log("Database initialized successfully.");
  } catch (e) {
    console.error("Database initialization failed:", e);
  }

  // API Routes
  app.post("/api/kinemoji/gif", verifyFernetToken, gifHandler);
  
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
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
