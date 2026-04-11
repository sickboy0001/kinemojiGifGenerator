import { Request, Response } from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import GIFEncoder from "gif-encoder-2";
import { db } from "../lib/turso/db.ts";
import { kinemojis } from "../db/schema/index.ts";
import { eq } from "drizzle-orm";
import { uploadKinemojiImage } from "../service/kinemoji-upload-service.ts";
import { isDbConfigured } from "../lib/turso/db.ts";

export const gifHandler = async (req: Request, res: Response) => {
  const { id, text, type, action, width, height, foreColor, backColor, shortId } = req.body;
  console.log(`Received GIF generation request for ID: ${id}, text: ${text}`);

  if (!isDbConfigured) {
    return res.status(400).json({ error: "Database (Turso) is not configured. Please set TURSO_DATABASE_URL." });
  }

  if (!process.env.R2_ACCESS_KEY_ID) {
    return res.status(400).json({ error: "Storage (R2) is not configured. Please set R2 environment variables." });
  }

  if (!id || !text) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // Respond immediately to simulate background function behavior
  res.json({ success: true, message: "GIF generation started" });

  // Start background process
  (async () => {
    try {
      // 初期レコード作成（存在しない場合）
      try {
        await db.insert(kinemojis).values({
          id,
          shortId: shortId || id.split('-')[0],
          text,
          parameters: JSON.stringify({ type, action, width, height, foreColor, backColor }),
          status: "pending",
          progress: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (insertError) {
        // Ignore if already exists
        console.log("Record already exists or insert failed:", insertError);
      }

      // ステータス更新
      await db.update(kinemojis)
        .set({ status: "processing", progress: 10, updatedAt: new Date() })
        .where(eq(kinemojis.id, id));

      // Chromium 起動
      console.log("Launching browser...");
      const browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu"
        ],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: true,
      });

      const page = await browser.newPage();
      page.on('console', msg => console.log('PAGE LOG:', msg.text()));
      page.on('error', err => console.error('PAGE ERROR:', err));
      
      await page.setViewport({ width: Number(width), height: Number(height) });

      // レンダリング
      // Use FRONTEND_URL if provided (for Netlify), otherwise fallback to local
      const renderBaseUrl = process.env.FRONTEND_URL || "http://127.0.0.1:3000";
      const renderUrl = `${renderBaseUrl}/kinemoji/render?text=${encodeURIComponent(text)}&type=${type}&action=${action}&width=${width}&height=${height}&foreColor=${encodeURIComponent(foreColor)}&backColor=${encodeURIComponent(backColor)}`;
      
      console.log(`Navigating to: ${renderUrl}`);
      await page.goto(renderUrl, { waitUntil: "networkidle0", timeout: 30000 });

      // Wait for React to be ready
      console.log("Waiting for Kinemoji to be ready...");
      await page.waitForFunction(() => (window as any).isKinemojiReady === true, { timeout: 10000 });

      // GIF 生成
      console.log(`Starting GIF generation...`);
      const isAnimation = action === "typewriter" || action === "animation";
      const frameCount = isAnimation ? 30 : 1;
      
      const encoder = new GIFEncoder(Number(width), Number(height));
      encoder.setRepeat(0);
      encoder.setDelay(100);
      encoder.start();

      for (let i = 0; i < frameCount; i++) {
        // Advance frame in the browser
        await page.evaluate((f) => {
          if ((window as any).advanceFrame) {
            (window as any).advanceFrame(f);
          }
        }, i);

        // Wait a tiny bit for render to settle
        await new Promise(resolve => setTimeout(resolve, 50));

        const pixels = await page.evaluate(() => {
          const canvas = document.querySelector('canvas');
          if (!canvas) return null;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          return Array.from(imageData.data);
        });

        if (pixels && pixels.length > 0) {
          encoder.addFrame(new Uint8ClampedArray(pixels));
        } else {
          console.warn(`Frame ${i}: No pixels captured or empty array`);
        }

        // 進捗更新
        if (i % 5 === 0 || i === frameCount - 1) {
          const progress = 10 + Math.floor((i + 1) / frameCount * 80);
          await db.update(kinemojis)
            .set({ progress, updatedAt: new Date() })
            .where(eq(kinemojis.id, id));
          console.log(`Progress: ${progress}%`);
        }
      }

      console.log("Finishing GIF encoding...");
      encoder.finish();
      const gifBuffer = encoder.out.getData();
      console.log(`GIF generated. Size: ${gifBuffer.length} bytes`);

      if (gifBuffer.length < 100) {
        throw new Error("Generated GIF is too small, something went wrong.");
      }

      // アップロード
      console.log("Uploading to R2...");
      const imageUrl = await uploadKinemojiImage(gifBuffer, `${shortId || id}.gif`);
      console.log(`Uploaded: ${imageUrl}`);

      // 完了更新
      console.log(`Updating DB to completed for ${id} with URL: ${imageUrl}`);
      await db.update(kinemojis)
        .set({ status: "completed", imageUrl, progress: 100, updatedAt: new Date() })
        .where(eq(kinemojis.id, id));

      await browser.close();
      console.log(`GIF generated successfully for ${id}: ${imageUrl}`);
    } catch (error) {
      console.error("GIF Generation Error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      try {
        await db.update(kinemojis)
          .set({ status: "failed", error: errorMessage, progress: 0, updatedAt: new Date() })
          .where(eq(kinemojis.id, id));
      } catch (dbError) {
        console.error("Failed to update DB with error status:", dbError);
      }
    }
  })();
};
