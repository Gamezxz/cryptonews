import cron from "node-cron";
import { fetchAllSources, backfillTranslations } from "./fetcher.js";
import { batchScrapeRecent } from "./scraper.js";
import config from "../config/default.js";

let scheduledTask = null;

// Fetch news and then translate new items
async function fetchAndTranslate() {
  await fetchAllSources();
  // Translate latest 20 untranslated items after each fetch
  console.log("🌐 Auto-translating new items...");
  await backfillTranslations(20);

  // Auto-scrape recent articles
  console.log("📰 Auto-scraping recent articles...");
  await batchScrapeRecent(10);
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
  });

  // Schedule recurring fetches + translations
  scheduledTask = cron.schedule(config.scheduler.cronSchedule, async () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Running scheduled fetch + translate...`);

    try {
      await fetchAndTranslate();
    } catch (err) {
      console.error("Scheduled fetch failed:", err.message);
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
