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
    activityBus.emit("rebuild", { message: "Static site rebuilt successfully" });
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
  app.use(express.json());

  // CORS for frontend
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept",
    );
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

  // API: read from cache.json (fast, no MongoDB query)
  app.get("/api/cache", async (req, res) => {
    try {
      const cachePath = path.join(process.cwd(), "data", "cache.json");
      const data = await fs.readFile(cachePath, "utf-8");
      const items = JSON.parse(data);
      const limit = parseInt(req.query.limit) || 200;
      res.json({
        success: true,
        count: Math.min(items.length, limit),
        data: items.slice(0, limit),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: read from MongoDB (slower, used as fallback)
  app.get("/api/news", async (req, res) => {
    try {
      const category = req.query.category || "all";
      const limit = parseInt(req.query.limit) || 100;
      const news = await getNews(category, limit);
      res.json({
        success: true,
        count: news.length,
        data: news,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/refresh", async (req, res) => {
    try {
      await fetchAllSources();
      await updateCache();
      activityBus.emit("news_update");
      res.json({ success: true, message: "News refreshed" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/rebuild", async (req, res) => {
    try {
      await buildStaticSite();
      res.json({ success: true, message: "Site rebuilt successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/recreate-cache", async (req, res) => {
    try {
      await updateCache();
      activityBus.emit("news_update");
      activityBus.emit("admin", { message: "Cache recreated manually" });
      res.json({ success: true, message: "Cache.json recreated successfully" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get single news item by ID
  app.get("/api/news/:id", async (req, res) => {
    try {
      const item = await NewsItem.findById(req.params.id).lean();
      if (!item) {
        return res.status(404).json({ success: false, error: "Not found" });
      }
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Trigger scrape + summarize for a single article
  app.post("/api/news/:id/scrape", async (req, res) => {
    try {
      const result = await scrapeAndSummarize(req.params.id);
      if (!result) {
        return res
          .status(400)
          .json({ success: false, error: "Scraping failed" });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({
      success: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
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
