import { connectDB } from "./db/connection.js";
import { NewsItem } from "./db/models.js";
import { translateBatch } from "./fetcher.js";
import { scrapeAndSummarize } from "./scraper.js";
import { updateCache } from "./utils/cache.js";
import { activityBus } from "./dashboard.js";
import { generateMarketInsight } from "./insight.js";

const TRANSLATE_BATCH_SIZE = 5; // Translate 5 items per API call
const DELAY_BETWEEN_BATCHES = 1000; // 1 second between batches
const DELAY_BETWEEN_SCRAPES = 2000; // 2 seconds between scrapes
const IDLE_WAIT = 15000; // 15 seconds when nothing to do
const INSIGHT_INTERVAL = 10; // Generate insight every N translations

let running = false;
let translateCounter = 0;

export async function startProcessor() {
  if (running) return;
  running = true;

  await connectDB();
  console.log("[Processor] Started — batch translate, then scrape");

  // Generate initial market insight on startup
  generateMarketInsight().catch(() => {});

  while (running) {
    try {
      // Phase 1: Batch translate all untranslated items (priority)
      const translated = await translatePhase();

      // Phase 2: Scrape one item (lower priority, don't block translations)
      if (!translated) {
        const scraped = await scrapePhase();

        if (!scraped) {
          // Nothing to do at all
          await new Promise((r) => setTimeout(r, IDLE_WAIT));
        }
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

      // Update cache after batch
      await updateCache();
      activityBus.emit("news_update");
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

// Scrape one unscrapped item
async function scrapePhase() {
  const unscrapped = await NewsItem.findOne({
    scrapingStatus: { $in: ["", "pending", null] },
    link: { $exists: true, $ne: "" },
  })
    .sort({ pubDate: -1 })
    .lean();

  if (!unscrapped) return false;

  const title = unscrapped.title?.substring(0, 60);
  activityBus.emit("translate_log", {
    message: `🔍 Scraping: ${title}...`,
  });

  try {
    const result = await scrapeAndSummarize(unscrapped._id);
    if (result) {
      activityBus.emit("translate_log", {
        message: `  ✓ Scraped + summarized`,
        status: "ok",
      });
    } else {
      activityBus.emit("translate_log", {
        message: `  ✗ Scrape failed`,
        status: "error",
      });
    }
  } catch (err) {
    activityBus.emit("translate_log", {
      message: `  ✗ Scrape error: ${err.message}`,
      status: "error",
    });
  }

  await updateCache();
  activityBus.emit("news_update");

  await new Promise((r) => setTimeout(r, DELAY_BETWEEN_SCRAPES));
  return true;
}

export function stopProcessor() {
  running = false;
  console.log("[Processor] Stopping...");
}

export default { startProcessor, stopProcessor };
