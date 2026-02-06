import cron from "node-cron";
import { fetchAllSources } from "./fetcher.js";
import { updateCache } from "./utils/cache.js";
import { activityBus } from "./dashboard.js";
import config from "../config/default.js";

let scheduledTask = null;

// Fetch news from RSS feeds and update cache
async function fetchAndUpdate() {
  await fetchAllSources();
  await updateCache();
  activityBus.emit("news_update");
}

export function startScheduler() {
  if (scheduledTask) {
    console.log("Scheduler already running");
    return scheduledTask;
  }

  console.log(`Starting scheduler with cron: ${config.scheduler.cronSchedule}`);

  // Initial fetch
  fetchAndUpdate().catch((err) => {
    console.error("Initial fetch failed:", err.message);
    activityBus.emit("error", { message: "Initial fetch failed", detail: err.message });
  });

  // Recurring fetches
  scheduledTask = cron.schedule(config.scheduler.cronSchedule, async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled fetch...`);
    try {
      await fetchAndUpdate();
    } catch (err) {
      console.error("Scheduled fetch failed:", err.message);
      activityBus.emit("error", { message: "Scheduled fetch failed", detail: err.message });
    }
  });

  console.log("Scheduler started successfully");
  return scheduledTask;
}

export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("Scheduler stopped");
  }
}

export function isSchedulerRunning() {
  return scheduledTask !== null;
}

export default { startScheduler, stopScheduler, isSchedulerRunning };
