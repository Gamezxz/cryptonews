import { connectDB } from "./db/connection.js";
import { NewsItem } from "./db/models.js";
import { translateBatch } from "./fetcher.js";
import { scrapeAndSummarize } from "./scraper.js";
import { updateCache } from "./utils/cache.js";
import { activityBus } from "./dashboard.js";

const DELAY_BETWEEN_ITEMS = 2000; // 2 seconds
const IDLE_WAIT = 30000; // 30 seconds when nothing to do

let running = false;

export async function startProcessor() {
  if (running) return;
  running = true;

  await connectDB();
  console.log("[Processor] Started — continuous translate + scrape");

  while (running) {
    try {
      // Find one untranslated item
      const item = await NewsItem.findOne({
        translatedTitle: { $in: ["", null] },
      })
        .sort({ pubDate: -1 })
        .lean();

      if (!item) {
        // Nothing to translate, check for unscrapped items
        const unscrapped = await NewsItem.findOne({
          scrapingStatus: { $in: ["", "pending", null] },
          link: { $exists: true, $ne: "" },
        })
          .sort({ pubDate: -1 })
          .lean();

        if (unscrapped) {
          // Scrape only
          await processItem(null, unscrapped);
        } else {
          // Nothing to do at all
          await new Promise((r) => setTimeout(r, IDLE_WAIT));
        }
        continue;
      }

      // Translate this item
      await processItem(item, item);
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

async function processItem(translateItem, scrapeItem) {
  const title = (translateItem || scrapeItem).title?.substring(0, 60);

  // Step 1: Translate (if needed)
  if (translateItem && !translateItem.translatedTitle) {
    activityBus.emit("translate_log", {
      message: `📝 Translating: ${title}...`,
    });

    try {
      const results = await translateBatch([translateItem]);

      if (results.length > 0 && results[0].translatedTitle) {
        const r = results[0];
        await NewsItem.updateOne(
          { _id: translateItem._id },
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
        activityBus.emit("translate", { count: 1, errors: 0 });
      } else {
        activityBus.emit("translate_log", {
          message: `  ✗ Translation failed: ${title}`,
          status: "error",
        });
      }
    } catch (err) {
      activityBus.emit("translate_log", {
        message: `  ✗ Translation error: ${err.message}`,
        status: "error",
      });
    }
  }

  // Step 2: Scrape + Summarize (if needed)
  if (scrapeItem) {
    const scrapeStatus = (
      await NewsItem.findById(scrapeItem._id).select("scrapingStatus").lean()
    )?.scrapingStatus;

    if (!scrapeStatus || scrapeStatus === "" || scrapeStatus === "pending") {
      activityBus.emit("translate_log", {
        message: `🔍 Scraping: ${title}...`,
      });

      try {
        const result = await scrapeAndSummarize(scrapeItem._id);
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
    }
  }

  // Step 3: Update cache + notify frontend
  await updateCache();
  activityBus.emit("news_update");

  // Rate limit delay
  await new Promise((r) => setTimeout(r, DELAY_BETWEEN_ITEMS));
}

export function stopProcessor() {
  running = false;
  console.log("[Processor] Stopping...");
}

export default { startProcessor, stopProcessor };
