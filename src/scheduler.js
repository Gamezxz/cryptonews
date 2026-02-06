import cron from "node-cron";
import { execSync } from "child_process";
import { fetchAllSources, backfillTranslations } from "./fetcher.js";
import { batchScrapeRecent } from "./scraper.js";
import { updateCache } from "./utils/cache.js";
import { activityBus } from "./dashboard.js";
import config from "../config/default.js";

let scheduledTask = null;

// Fetch news and then translate new items
async function fetchAndTranslate() {
  await fetchAllSources();

  // Translate latest 20 untranslated items after each fetch
  console.log("🌐 Auto-translating new items...");
  const translateResult = await backfillTranslations(20);
  activityBus.emit("translate", {
    count: translateResult.translatedCount,
    errors: translateResult.errorCount,
  });

  // Auto-scrape recent articles
  console.log("📰 Auto-scraping recent articles...");
  const scrapeResult = await batchScrapeRecent(10);
  activityBus.emit("scrape", {
    message: `Batch scrape: ${scrapeResult.success} ok, ${scrapeResult.failed} failed`,
  });

  // Update cache and rebuild static site
  console.log("🔄 Updating cache and rebuilding site...");
  await updateCache();
  try {
    execSync("npm run build", { stdio: "inherit" });
    activityBus.emit("rebuild", { message: "Auto-rebuild after fetch cycle" });
  } catch (err) {
    activityBus.emit("error", { message: "Auto-rebuild failed", detail: err.message });
  }
}

export function startScheduler() {
  if (scheduledTask) {
    console.log("Scheduler already running");
    return scheduledTask;
  }

  console.log(`Starting scheduler with cron: ${config.scheduler.cronSchedule}`);

  // Initial fetch + translate
  fetchAndTranslate().catch((err) => {
    console.error("Initial fetch failed:", err.message);
    activityBus.emit("error", { message: "Initial fetch failed", detail: err.message });
  });

  // Schedule recurring fetches + translations
  scheduledTask = cron.schedule(config.scheduler.cronSchedule, async () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Running scheduled fetch + translate...`);

    try {
      await fetchAndTranslate();
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
