import { connectDB } from "./db/connection.js";
import { NewsItem } from "./db/models.js";
import { translateBatch } from "./fetcher.js";
import { scrapeAndSummarize } from "./scraper.js";
import { updateCache } from "./utils/cache.js";
import { activityBus } from "./dashboard.js";
import { generateMarketInsight } from "./insight.js";

const TRANSLATE_BATCH_SIZE = 10; // Translate 10 items per API call
const DELAY_BETWEEN_BATCHES = 500; // 0.5 second between batches
const DELAY_BETWEEN_SCRAPES = 500; // 0.5 seconds between scrapes
const SCRAPE_CONCURRENCY = 3; // Scrape 3 articles at a time
const IDLE_WAIT = 5000; // 5 seconds when nothing to do
const INSIGHT_INTERVAL = 10; // Generate insight every N translations
const CACHE_UPDATE_INTERVAL = 5; // Update cache every N operations

let running = false;
let translateCounter = 0;
let operationCounter = 0;

export async function startProcessor() {
  if (running) return;
  running = true;

  await connectDB();
  console.log("[Processor] Started — batch translate, then scrape");

  // Generate initial market insight on startup
  generateMarketInsight().catch(() => {});

  while (running) {
    try {
      // Run translate and scrape concurrently
      const [translated, scraped] = await Promise.all([
        translatePhase().catch(err => { console.error("[Processor] Translate error:", err.message); return false; }),
        scrapePhase().catch(err => { console.error("[Processor] Scrape error:", err.message); return false; }),
      ]);

      if (!translated && !scraped) {
        await new Promise((r) => setTimeout(r, IDLE_WAIT));
      }
    } catch (err) {
      console.error("[Processor] Error:", err.message);
      activityBus.emit("error", {
        message: "Processor error",
        detail: err.message,
      });
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Batch translate up to TRANSLATE_BATCH_SIZE items in one API call
async function translatePhase() {
  const items = await NewsItem.find({
    translatedTitle: { $in: ["", null] },
  })
    .sort({ pubDate: -1 })
    .limit(TRANSLATE_BATCH_SIZE)
    .lean();

  if (items.length === 0) return false;

  activityBus.emit("translate_log", {
    message: `📝 Batch translating ${items.length} items...`,
  });

  try {
    const results = await translateBatch(items);

    let successCount = 0;
    for (const r of results) {
      const item = items[r.id];
      if (item && r.translatedTitle) {
        await NewsItem.updateOne(
          { _id: item._id },
          {
            translatedTitle: r.translatedTitle,
            translatedContent: r.translatedContent,
            sentiment: r.sentiment,
          },
        );
        activityBus.emit("translate_log", {
          message: `  ✓ ${r.translatedTitle.substring(0, 50)}... [${r.sentiment}]`,
          status: "ok",
        });
        successCount++;
        translateCounter++;
      }
    }

    if (successCount > 0) {
      activityBus.emit("translate", { count: successCount, errors: items.length - successCount });

      // Generate market insight every N translations
      if (translateCounter % INSIGHT_INTERVAL < successCount) {
        generateMarketInsight().catch(() => {});
      }

      // Update cache periodically, not every batch
      operationCounter++;
      if (operationCounter % CACHE_UPDATE_INTERVAL === 0) {
        await updateCache();
        activityBus.emit("news_update");
      }
    } else {
      activityBus.emit("translate_log", {
        message: `  ✗ Batch translation failed`,
        status: "error",
      });
    }
  } catch (err) {
    activityBus.emit("translate_log", {
      message: `  ✗ Translation error: ${err.message}`,
      status: "error",
    });
  }

  await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES));
  return true;
}

// Scrape multiple unscrapped items concurrently
async function scrapePhase() {
  const unscrapped = await NewsItem.find({
    scrapingStatus: { $in: ["", "pending", null] },
    link: { $exists: true, $ne: "" },
  })
    .sort({ pubDate: -1 })
    .limit(SCRAPE_CONCURRENCY)
    .lean();

  if (unscrapped.length === 0) return false;

  activityBus.emit("translate_log", {
    message: `🔍 Scraping ${unscrapped.length} articles concurrently...`,
  });

  // Scrape all items concurrently
  const results = await Promise.allSettled(
    unscrapped.map(async (item) => {
      const title = item.title?.substring(0, 60);
      try {
        const result = await scrapeAndSummarize(item._id);
        if (result) {
          activityBus.emit("translate_log", {
            message: `  ✓ ${title}`,
            status: "ok",
          });
          return true;
        } else {
          activityBus.emit("translate_log", {
            message: `  ✗ ${title}`,
            status: "error",
          });
          return false;
        }
      } catch (err) {
        activityBus.emit("translate_log", {
          message: `  ✗ ${title}: ${err.message}`,
          status: "error",
        });
        return false;
      }
    })
  );

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
  if (successCount > 0) {
    operationCounter++;
    if (operationCounter % CACHE_UPDATE_INTERVAL === 0) {
      await updateCache();
      activityBus.emit("news_update");
    }
  }

  await new Promise((r) => setTimeout(r, DELAY_BETWEEN_SCRAPES));
  return true;
}

export function stopProcessor() {
  running = false;
  console.log("[Processor] Stopping...");
}

export default { startProcessor, stopProcessor };
