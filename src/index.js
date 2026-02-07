import "dotenv/config";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { createServer } from "http";
import { connectDB, disconnectDB } from "./db/connection.js";
import { startScheduler } from "./scheduler.js";
import { startProcessor, stopProcessor } from "./processor.js";
import { getNews, fetchAllSources } from "./fetcher.js";
import { scrapeAndSummarize } from "./scraper.js";
import { NewsItem } from "./db/models.js";
import { execSync } from "child_process";
import { initDashboard, activityBus } from "./dashboard.js";
import { updateCache } from "./utils/cache.js";
import { handleChat, checkRateLimit } from "./chat.js";
import config from "../config/default.js";

const app = express();
const server = createServer(app);
const PORT = config.server.port;

// Build static site function
async function buildStaticSite() {
  console.log("Building Next.js static site...");
  try {
    execSync("npm run build", { stdio: "inherit" });
    console.log("Static site built successfully");
    activityBus.emit("rebuild", {
      message: "Static site rebuilt successfully",
    });
  } catch (err) {
    console.error("Build failed:", err.message);
    activityBus.emit("error", { message: "Build failed", detail: err.message });
  }
}

async function main() {
  console.log("=== Crypto News Aggregator ===");

  // Connect to MongoDB
  await connectDB();

  // Express middleware
  app.use(express.json({ limit: "1mb" }));

  // Security headers
  app.use((req, res, next) => {
    res.header("X-Content-Type-Options", "nosniff");
    res.header("X-Frame-Options", "DENY");
    res.header("X-XSS-Protection", "1; mode=block");
    res.header("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // CORS — restrict to allowed origins
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept",
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.static("output"));

  // API: read insight.json
  app.get("/api/insight", async (req, res) => {
    try {
      const insightPath = path.join(process.cwd(), "data", "insight.json");
      const data = await fs.readFile(insightPath, "utf-8");
      res.json({ success: true, data: JSON.parse(data) });
    } catch (err) {
      res.json({ success: false, data: null });
    }
  });

  // Helper: get real client IP (trust proxy only from known sources)
  function getClientIP(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      // Take the last IP before our proxy (rightmost is most trustworthy)
      const ips = forwarded.split(",").map((s) => s.trim());
      return ips[0];
    }
    return req.socket.remoteAddress;
  }

  // Helper: validate slug format (only lowercase alphanumeric and hyphens)
  function isValidSlug(slug) {
    return /^[a-z0-9][a-z0-9-]{0,200}$/.test(slug);
  }

  // API: read from cache.json (fast, no MongoDB query)
  app.get("/api/cache", async (req, res) => {
    try {
      const cachePath = path.join(process.cwd(), "data", "cache.json");
      const data = await fs.readFile(cachePath, "utf-8");
      const items = JSON.parse(data);
      const limit = Math.min(
        Math.max(parseInt(req.query.limit, 10) || 200, 1),
        500,
      );
      res.json({
        success: true,
        count: Math.min(items.length, limit),
        data: items.slice(0, limit),
      });
    } catch (err) {
      console.error("[API] Cache error:", err.message);
      res.status(500).json({ success: false, error: "Failed to load cache" });
    }
  });

  // API: read from MongoDB (slower, used as fallback)
  app.get("/api/news", async (req, res) => {
    try {
      const category =
        typeof req.query.category === "string" ? req.query.category : "all";
      if (category !== "all" && !/^[a-zA-Z0-9-]+$/.test(category)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid category" });
      }
      const limit = Math.min(
        Math.max(parseInt(req.query.limit, 10) || 100, 1),
        500,
      );
      const news = await getNews(category, limit);
      res.json({
        success: true,
        count: news.length,
        data: news,
      });
    } catch (err) {
      console.error("[API] News error:", err.message);
      res.status(500).json({ success: false, error: "Failed to fetch news" });
    }
  });

  app.get("/api/refresh", async (req, res) => {
    try {
      await fetchAllSources();
      await updateCache();
      activityBus.emit("news_update");
      res.json({ success: true, message: "News refreshed" });
    } catch (err) {
      console.error("[API] Refresh error:", err.message);
      res.status(500).json({ success: false, error: "Refresh failed" });
    }
  });

  app.get("/api/rebuild", async (req, res) => {
    try {
      await buildStaticSite();
      res.json({ success: true, message: "Site rebuilt successfully" });
    } catch (err) {
      console.error("[API] Rebuild error:", err.message);
      res.status(500).json({ success: false, error: "Rebuild failed" });
    }
  });

  app.get("/api/recreate-cache", async (req, res) => {
    try {
      await updateCache();
      activityBus.emit("news_update");
      activityBus.emit("admin", { message: "Cache recreated manually" });
      res.json({ success: true, message: "Cache.json recreated successfully" });
    } catch (err) {
      console.error("[API] Cache recreate error:", err.message);
      res.status(500).json({ success: false, error: "Cache recreate failed" });
    }
  });

  // Get single news item by slug
  app.get("/api/news/by-slug/:slug", async (req, res) => {
    try {
      if (!isValidSlug(req.params.slug)) {
        return res.status(400).json({ success: false, error: "Invalid slug" });
      }
      const article = await NewsItem.findOne({ slug: req.params.slug }).lean();
      if (!article) {
        return res.status(404).json({ success: false, error: "Not found" });
      }
      const related = await NewsItem.find({
        _id: { $ne: article._id },
        categories: { $in: article.categories || [article.category] },
      })
        .sort({ pubDate: -1 })
        .limit(4)
        .select("title translatedTitle source pubDate slug category")
        .lean();

      res.json({ success: true, data: article, related });
    } catch (err) {
      console.error("[API] Slug lookup error:", err.message);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch article" });
    }
  });

  // Get single news item by ID
  app.get("/api/news/:id", async (req, res) => {
    try {
      if (!/^[a-f0-9]{24}$/.test(req.params.id)) {
        return res.status(400).json({ success: false, error: "Invalid ID" });
      }
      const item = await NewsItem.findById(req.params.id).lean();
      if (!item) {
        return res.status(404).json({ success: false, error: "Not found" });
      }
      res.json({ success: true, data: item });
    } catch (err) {
      console.error("[API] News by ID error:", err.message);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch article" });
    }
  });

  // Trigger scrape + summarize for a single article
  app.post("/api/news/:id/scrape", async (req, res) => {
    try {
      if (!/^[a-f0-9]{24}$/.test(req.params.id)) {
        return res.status(400).json({ success: false, error: "Invalid ID" });
      }
      const result = await scrapeAndSummarize(req.params.id);
      if (!result) {
        return res
          .status(400)
          .json({ success: false, error: "Scraping failed" });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error("[API] Scrape error:", err.message);
      res.status(500).json({ success: false, error: "Scraping failed" });
    }
  });

  // AI Chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const ip = getClientIP(req);
      if (!checkRateLimit(ip)) {
        return res
          .status(429)
          .json({ success: false, error: "Rate limit exceeded" });
      }

      const { message, history } = req.body;
      if (
        !message ||
        typeof message !== "string" ||
        message.trim().length === 0
      ) {
        return res
          .status(400)
          .json({ success: false, error: "Message is required" });
      }
      if (message.length > 500) {
        return res
          .status(400)
          .json({ success: false, error: "Message too long (max 500)" });
      }

      // Validate history array
      const safeHistory = [];
      if (Array.isArray(history)) {
        for (const msg of history.slice(-10)) {
          if (
            msg &&
            typeof msg.role === "string" &&
            typeof msg.content === "string" &&
            ["user", "assistant"].includes(msg.role) &&
            msg.content.length <= 2000
          ) {
            safeHistory.push({ role: msg.role, content: msg.content });
          }
        }
      }

      const result = await handleChat(message.trim(), safeHistory);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[Chat] Error:", err.message);
      res
        .status(500)
        .json({ success: false, error: "Failed to get AI response" });
    }
  });

  // Fear & Greed Index proxy (cache 10 min)
  let fngCache = { data: null, ts: 0 };
  app.get("/api/fear-greed", async (req, res) => {
    try {
      if (fngCache.data && Date.now() - fngCache.ts < 10 * 60 * 1000) {
        return res.json({ success: true, data: fngCache.data });
      }
      const resp = await fetch(
        "https://api.alternative.me/fng/?limit=31&format=json",
      );
      if (!resp.ok) throw new Error("FNG API error");
      const json = await resp.json();
      fngCache = { data: json.data, ts: Date.now() };
      res.json({ success: true, data: json.data });
    } catch (err) {
      console.error("[API] Fear & Greed error:", err.message);
      if (fngCache.data) {
        return res.json({ success: true, data: fngCache.data, stale: true });
      }
      res
        .status(502)
        .json({ success: false, error: "Failed to fetch Fear & Greed Index" });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({
      success: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Fallback for /news/* routes not found as static files
  app.get("/news/:slug", async (req, res) => {
    if (!isValidSlug(req.params.slug)) {
      return res.status(400).send("Invalid slug");
    }
    const staticFile = path.join(
      process.cwd(),
      "output",
      "news",
      req.params.slug,
      "index.html",
    );
    // Verify resolved path stays within output directory
    const outputDir = path.resolve(process.cwd(), "output");
    if (!path.resolve(staticFile).startsWith(outputDir)) {
      return res.status(400).send("Invalid path");
    }
    try {
      await fs.access(staticFile);
      res.sendFile(staticFile);
    } catch {
      const fallbackPath = path.join(
        process.cwd(),
        "public",
        "article-fallback.html",
      );
      res.sendFile(fallbackPath);
    }
  });

  // Initialize Socket.IO dashboard
  initDashboard(server);

  // Start server
  server.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`📰 API: /api/cache, /api/news, /api/refresh`);
    console.log(`📊 Dashboard: /admin`);
    console.log(`⏰ Cron: ${config.scheduler.cronSchedule}`);
    console.log(`🔄 Processor: continuous translate + scrape\n`);
  });

  // Start scheduler (fetch RSS every 5 min)
  startScheduler();

  // Start processor (continuous translate + scrape, one by one)
  startProcessor();

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down gracefully...");
    stopProcessor();
    await disconnectDB();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
