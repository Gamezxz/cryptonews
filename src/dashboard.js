import { Server } from "socket.io";
import { EventEmitter } from "events";
import { execSync } from "child_process";
import { connectDB } from "./db/connection.js";
import { NewsItem } from "./db/models.js";
import { fetchAllSources } from "./fetcher.js";
import { updateCache } from "./utils/cache.js";
import config from "../config/default.js";

// Global event bus for activity logging
export const activityBus = new EventEmitter();

let io = null;
let statsInterval = null;
const authenticatedSockets = new Set();
const activityLog = [];
const MAX_LOG_SIZE = 50;

function addActivity(type, message, detail = "") {
  const entry = {
    time: new Date().toISOString(),
    type,
    message,
    detail,
  };
  activityLog.unshift(entry);
  if (activityLog.length > MAX_LOG_SIZE) activityLog.pop();

  // Broadcast to authenticated clients
  if (io) {
    for (const socketId of authenticatedSockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) socket.emit("activity", entry);
    }
  }
}

// Listen to activity bus events
activityBus.on("fetch", (data) => {
  addActivity("fetch", `Fetched ${data.saved} new, ${data.updated} updated articles`, data.source || "");
});

activityBus.on("translate", (data) => {
  addActivity("translate", `Translated ${data.count} articles`, data.errors ? `${data.errors} errors` : "");
});

activityBus.on("scrape", (data) => {
  addActivity("scrape", data.message, data.title || "");
});

activityBus.on("rebuild", (data) => {
  addActivity("rebuild", data.message || "Static site rebuilt");
});

activityBus.on("error", (data) => {
  addActivity("error", data.message, data.detail || "");
});

activityBus.on("translate_log", (data) => {
  if (io) {
    for (const socketId of authenticatedSockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) socket.emit("translate_log", data);
    }
  }
});

// Broadcast news_update to ALL connected clients (not just admin)
activityBus.on("news_update", () => {
  if (io) {
    io.emit("news_update");
  }
});

// Collect stats from MongoDB
async function collectStats() {
  try {
    await connectDB();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalArticles,
      todayArticles,
      scrapePending,
      scrapeScraped,
      scrapeFailed,
      translatedCount,
      untranslatedCount,
      sentimentAgg,
      sourceAgg,
      categoryAgg,
      recentArticles,
    ] = await Promise.all([
      NewsItem.countDocuments({}),
      NewsItem.countDocuments({ createdAt: { $gte: todayStart } }),
      NewsItem.countDocuments({ scrapingStatus: { $in: ["", "pending", null] } }),
      NewsItem.countDocuments({ scrapingStatus: "scraped" }),
      NewsItem.countDocuments({ scrapingStatus: "failed" }),
      NewsItem.countDocuments({ translatedTitle: { $exists: true, $nin: ["", null] } }),
      NewsItem.countDocuments({ $or: [{ translatedTitle: "" }, { translatedTitle: null }, { translatedTitle: { $exists: false } }] }),
      NewsItem.aggregate([{ $group: { _id: "$sentiment", count: { $sum: 1 } } }]),
      NewsItem.aggregate([
        { $group: { _id: "$source", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      NewsItem.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      NewsItem.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title source createdAt scrapingStatus sentiment")
        .lean(),
    ]);

    const sentiment = {};
    for (const s of sentimentAgg) {
      sentiment[s._id || "unknown"] = s.count;
    }

    const sources = {};
    for (const s of sourceAgg) {
      sources[s._id || "unknown"] = s.count;
    }

    const categories = {};
    for (const c of categoryAgg) {
      categories[c._id || "unknown"] = c.count;
    }

    return {
      overview: {
        totalArticles,
        todayArticles,
        sourcesCount: Object.keys(sources).length,
      },
      scraping: {
        pending: scrapePending,
        scraped: scrapeScraped,
        failed: scrapeFailed,
        successRate: scrapeScraped + scrapeFailed > 0
          ? ((scrapeScraped / (scrapeScraped + scrapeFailed)) * 100).toFixed(1)
          : 0,
      },
      translation: {
        translated: translatedCount,
        untranslated: untranslatedCount,
        progress: totalArticles > 0
          ? ((translatedCount / totalArticles) * 100).toFixed(1)
          : 0,
      },
      sentiment,
      sources,
      categories,
      recentArticles,
      activityLog: activityLog.slice(0, 20),
      timestamp: now.toISOString(),
    };
  } catch (error) {
    console.error("Dashboard stats error:", error.message);
    return null;
  }
}

export function initDashboard(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    console.log(`[Dashboard] Client connected: ${socket.id}`);

    socket.on("auth", async (key) => {
      if (key === config.admin.key) {
        authenticatedSockets.add(socket.id);
        socket.emit("auth_success");
        console.log(`[Dashboard] Client authenticated: ${socket.id}`);

        // Send initial stats immediately
        const stats = await collectStats();
        if (stats) socket.emit("stats", stats);
      } else {
        socket.emit("auth_error", "Invalid admin key");
        console.log(`[Dashboard] Auth failed: ${socket.id}`);
      }
    });

    socket.on("action", async (action) => {
      if (!authenticatedSockets.has(socket.id)) {
        socket.emit("action_error", "Not authenticated");
        return;
      }

      socket.emit("action_ack", { action, status: "started" });

      try {
        if (action === "refresh") {
          addActivity("admin", "Admin triggered force refresh");
          await fetchAllSources();
          execSync("npm run build", { stdio: "inherit" });
          addActivity("rebuild", "Static site rebuilt successfully");
        } else if (action === "rebuild") {
          addActivity("admin", "Admin triggered force rebuild");
          execSync("npm run build", { stdio: "inherit" });
          addActivity("rebuild", "Static site rebuilt successfully");
        } else if (action === "recreate-cache") {
          addActivity("admin", "Admin triggered cache recreate");
          await updateCache();
          addActivity("admin", "Cache recreated successfully");
        } else if (action === "translate") {
          addActivity("admin", "Processor handles translation continuously");
        }
        socket.emit("action_ack", { action, status: "done" });
      } catch (err) {
        addActivity("error", `Action '${action}' failed`, err.message);
        socket.emit("action_ack", { action, status: "error", error: err.message });
      }
    });

    socket.on("disconnect", () => {
      authenticatedSockets.delete(socket.id);
      console.log(`[Dashboard] Client disconnected: ${socket.id}`);
    });
  });

  // Periodic stats broadcast
  statsInterval = setInterval(async () => {
    if (authenticatedSockets.size === 0) return;

    const stats = await collectStats();
    if (!stats) return;

    for (const socketId of authenticatedSockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) socket.emit("stats", stats);
    }
  }, config.admin.statsInterval);

  console.log("[Dashboard] Socket.IO initialized");
  return io;
}

export function getDashboardIO() {
  return io;
}

export default { initDashboard, getDashboardIO, activityBus };
