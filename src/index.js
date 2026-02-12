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

// Technical indicator helpers
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calculateSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}

function calculateEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateEMASeries(data, period) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const series = [ema];
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    series.push(ema);
  }
  return series;
}

function calculateMACD(closes, fast = 8, slow = 21, signal = 5) {
  const emaFast = calculateEMASeries(closes, fast);
  const emaSlow = calculateEMASeries(closes, slow);
  if (emaFast.length === 0 || emaSlow.length === 0) return null;
  // Align series — emaSlow starts later
  const offset = slow - fast;
  const macdLine = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }
  if (macdLine.length < signal) return null;
  const signalLine = calculateEMASeries(macdLine, signal);
  const lastMACD = macdLine[macdLine.length - 1];
  const prevMACD = macdLine[macdLine.length - 2];
  const lastSignal = signalLine[signalLine.length - 1];
  const prevSignal = signalLine[signalLine.length - 2];
  // Cross detection: MACD crosses above signal = bullish
  const crossUp = prevMACD <= prevSignal && lastMACD > lastSignal;
  const crossDown = prevMACD >= prevSignal && lastMACD < lastSignal;
  return {
    macd: lastMACD,
    signal: lastSignal,
    histogram: lastMACD - lastSignal,
    crossUp,
    crossDown,
    bullish: lastMACD > lastSignal,
  };
}

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

  // Klines + RSI/MA proxy (cache 5 min)
  let klinesCache = { data: null, ts: 0 };
  app.get("/api/klines", async (req, res) => {
    try {
      if (klinesCache.data && Date.now() - klinesCache.ts < 5 * 60 * 1000) {
        return res.json({ success: true, data: klinesCache.data });
      }
      const symbols = ["BTCUSDT", "ETHUSDT", "PAXGUSDT", "BNBUSDT"];
      const results = {};
      await Promise.all(
        symbols.map(async (symbol) => {
          const resp = await fetch(
            `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=100`,
          );
          if (!resp.ok) throw new Error(`Klines error: ${symbol}`);
          const klines = await resp.json();
          const closes = klines.map((k) => parseFloat(k[4]));
          const macdResult = calculateMACD(closes, 8, 21, 5);
          results[symbol] = {
            rsi: parseFloat((calculateRSI(closes, 14) ?? 0).toFixed(2)),
            rsi5: parseFloat((calculateRSI(closes, 5) ?? 0).toFixed(2)),
            ma7: parseFloat((calculateSMA(closes, 7) ?? 0).toFixed(2)),
            ma25: parseFloat((calculateSMA(closes, 25) ?? 0).toFixed(2)),
            ema13: parseFloat((calculateEMA(closes, 13) ?? 0).toFixed(2)),
            macd: macdResult
              ? {
                  bullish: macdResult.bullish,
                  histogram: parseFloat(macdResult.histogram.toFixed(4)),
                }
              : null,
            lastClose: closes[closes.length - 1],
          };
        }),
      );
      klinesCache = { data: results, ts: Date.now() };
      res.json({ success: true, data: results });
    } catch (err) {
      console.error("[API] Klines error:", err.message);
      if (klinesCache.data) {
        return res.json({ success: true, data: klinesCache.data, stale: true });
      }
      res
        .status(502)
        .json({ success: false, error: "Failed to fetch kline data" });
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
