import Parser from "rss-parser";
import { sources } from "../config/sources.js";
import { connectDB } from "./db/connection.js";
import { NewsItem } from "./db/models.js";
import { updateCache } from "./utils/cache.js";
import { activityBus } from "./dashboard.js";
import { createSlug } from "./utils/slug.js";
import config from "../config/default.js";
import axios from "axios";

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: [
      ["media:content", "media"],
      ["enclosure", "enclosure"],
      ["description", "description"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

// Category keywords for auto-categorization
const categoryKeywords = {
  bitcoin: ["bitcoin", "btc", "satoshi", "lightning network", "btc price"],
  ethereum: [
    "ethereum",
    "eth",
    "vitalik",
    "erc",
    "erc20",
    "erc721",
    "layer 2",
    "l2",
  ],
  defi: [
    "defi",
    "yield farming",
    "liquidity",
    "amm",
    "dex",
    "uniswap",
    "aave",
    "compound",
    "curve",
  ],
  nft: ["nft", "non-fungible", "opensea", "digital collectible", "nfts"],
  altcoins: [
    "solana",
    "cardano",
    "ripple",
    "xrp",
    "ada",
    "dogecoin",
    "polygon",
    "bnb",
    "avax",
    "polkadot",
  ],
  regulation: [
    "sec",
    "regulation",
    "law",
    "legal",
    "compliance",
    "ban",
    "etf",
    "approval",
  ],
  mining: [
    "mining",
    "hash rate",
    "miner",
    "proof of work",
    "pool",
    "bitcoin mining",
  ],
};

// AI config
const AI_API_KEY = process.env.AI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL;

// Parse AI JSON response, handling truncated responses
function parseTranslationResponse(responseContent) {
  if (!responseContent) return [];

  // Try to extract JSON array
  let jsonStr = "";
  const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  } else {
    // Try to fix truncated JSON: find the start of array and close it
    const arrayStart = responseContent.indexOf("[");
    if (arrayStart === -1) return [];
    jsonStr = responseContent.substring(arrayStart);
    // Find the last complete object (ends with })
    const lastBrace = jsonStr.lastIndexOf("}");
    if (lastBrace === -1) return [];
    jsonStr = jsonStr.substring(0, lastBrace + 1) + "]";
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return parsed.map((p) => ({
      id: p.id,
      translatedTitle: p.title || "",
      translatedContent: p.content || "",
      sentiment: ["bullish", "bearish", "neutral"].includes(p.sentiment)
        ? p.sentiment
        : "neutral",
    }));
  } catch (e) {
    // Try to salvage partial JSON by closing truncated strings/objects
    try {
      const lastBrace = jsonStr.lastIndexOf("}");
      if (lastBrace > 0) {
        const salvaged = jsonStr.substring(0, lastBrace + 1) + "]";
        const parsed = JSON.parse(salvaged);
        console.log(
          `[Translate] Salvaged ${parsed.length} items from truncated JSON`,
        );
        return parsed.map((p) => ({
          id: p.id,
          translatedTitle: p.title || "",
          translatedContent: p.content || "",
          sentiment: ["bullish", "bearish", "neutral"].includes(p.sentiment)
            ? p.sentiment
            : "neutral",
        }));
      }
    } catch {
      // ignore salvage failure
    }
    console.error(`JSON parse error: ${e.message}`);
    return [];
  }
}

// Call AI API for translation
async function callTranslateAPI(inputText, maxTokens = 4000, timeout = 60000) {
  const response = await axios.post(
    `${AI_BASE_URL}/chat/completions`,
    {
      model: "GLM-4.5-Air",
      messages: [
        {
          role: "system",
          content: `You are a crypto news translator. Translate news items to Thai.
Keep crypto terms (Bitcoin, Ethereum, BTC, ETH, DeFi, NFT, XRP) and company names in English.
Also analyze market sentiment for each.

Output ONLY a valid JSON array:
[{"id": 0, "title": "Thai title", "content": "Thai content", "sentiment": "bullish/bearish/neutral"}, ...]

Sentiment rules:
- bullish: positive (price up, adoption, approval, partnership, growth)
- bearish: negative (price down, hack, ban, lawsuit, crash, loss)
- neutral: informational or mixed`,
        },
        {
          role: "user",
          content: inputText,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    },
    {
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout,
    },
  );

  const message = response.data.choices[0]?.message;
  // glm-4.7 uses reasoning_content which consumes tokens, try content first then reasoning_content
  return message?.content?.trim() || message?.reasoning_content?.trim() || "";
}

// Translate a single item as fallback
async function translateSingle(item, idx) {
  const inputText = `[0] Title: ${item.title}\nContent: ${(item.content || "").substring(0, 300)}`;
  try {
    const responseContent = await callTranslateAPI(inputText, 2000, 45000);
    const results = parseTranslationResponse(responseContent);
    if (results.length > 0) {
      return { ...results[0], id: idx };
    }
  } catch (error) {
    console.error(
      `[Translate] Single item failed (${item.title?.substring(0, 40)}): ${error.message}`,
    );
  }
  return null;
}

// AI Batch Translation + Sentiment Analysis using GLM-4.7 via Z.ai API
export async function translateBatch(items) {
  if (!items || items.length === 0) return [];

  // Prepare batch input (limit content to 300 chars each to reduce token usage)
  const newsItems = items.map((item, idx) => ({
    id: idx,
    title: item.title,
    content: (item.content || "").substring(0, 300),
  }));

  const inputText = newsItems
    .map(
      (n) =>
        `[${n.id}] Title: ${n.title}\nContent: ${n.content || "No content"}`,
    )
    .join("\n\n---\n\n");

  // Try batch translation first
  // GLM models use reasoning tokens (~300-400 per item) + content tokens (~200 per item)
  try {
    const maxTokens = Math.min(items.length * 1500, 10000);
    const responseContent = await callTranslateAPI(inputText, maxTokens, 90000);
    const results = parseTranslationResponse(responseContent);

    if (results.length > 0) {
      return results;
    }
  } catch (error) {
    console.error(
      `[Translate] Batch failed (${items.length} items): ${error.message}`,
    );
  }

  // Fallback: translate items individually
  console.log(
    `[Translate] Falling back to individual translation for ${items.length} items`,
  );
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const result = await translateSingle(items[i], i);
    if (result) {
      results.push(result);
    }
    // Small delay between individual calls
    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}

// Scrape og:image from article HTML as fallback
async function scrapeImageUrl(url) {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CryptoNewsBot/1.0)" },
    });
    const html = response.data;

    // og:image
    const ogMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    );
    if (ogMatch?.[1]) return ogMatch[1];

    // twitter:image
    const twMatch = html.match(
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    );
    if (twMatch?.[1]) return twMatch[1];

    return null;
  } catch {
    return null;
  }
}

// Extract image URL from various RSS fields
function extractImageUrl(item) {
  // Check enclosure first
  if (item.enclosure?.url) {
    return item.enclosure.url;
  }

  // Try media:content
  if (item.media?.["$"]?.url) {
    return item.media["$"].url;
  }

  // Try content:encoded (HTML content)
  if (item.contentEncoded) {
    const imgMatch = item.contentEncoded.match(
      /<img[^>]+src=["']([^"']+)["']/i,
    );
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }
  }

  // Try content field
  if (item.content) {
    const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }
  }

  return null;
}

// Categorize news item based on keywords — returns all matching tags
function categorizeItem(item) {
  const title = (item.title || "").toLowerCase();
  const content = (item.contentSnippet || item.content || "").toLowerCase();
  const text = `${title} ${content}`;

  const matched = [];
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      matched.push(category);
    }
  }

  return matched.length > 0 ? matched : ["general"];
}

// Fetch single RSS feed
async function fetchFeed(source) {
  const items = [];

  try {
    console.log(`Fetching ${source.name}...`);
    const feed = await parser.parseURL(source.url);

    for (const item of feed.items.slice(0, 50)) {
      const tags = categorizeItem(item);
      let imageUrl = extractImageUrl(item);

      // Fallback: scrape og:image from article page
      if (!imageUrl && item.link) {
        imageUrl = await scrapeImageUrl(item.link);
      }

      items.push({
        guid:
          (typeof item.guid === "string" ? item.guid : item.link) || item.link,
        title: item.title || "Untitled",
        link: item.link,
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        content: item.contentSnippet || item.content || "",
        author: item.author || item.creator || source.name,
        enclosure: imageUrl || item.enclosure?.url || null,
        categories: tags,
        source: source.name,
        sourceCategory: source.category,
        category: tags[0],
      });
    }

    console.log(`Fetched ${items.length} items from ${source.name}`);
  } catch (error) {
    console.error(`Error fetching ${source.name}:`, error.message);
  }

  return items;
}

// Run async tasks with concurrency limit
async function pLimit(tasks, limit) {
  const results = [];
  let index = 0;

  async function runNext() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    runNext(),
  );
  await Promise.all(workers);
  return results;
}

// Fetch all enabled sources and save to MongoDB
export async function fetchAllSources() {
  await connectDB();

  const enabledSources = sources.filter((s) => s.enabled);

  console.log(`Fetching from ${enabledSources.length} sources (parallel)...`);
  const startTime = Date.now();

  // Parallel fetch with concurrency limit of 5
  const feedResults = await pLimit(
    enabledSources.map((source) => () => fetchFeed(source)),
    5,
  );

  const allItems = feedResults.flat();

  if (allItems.length === 0) {
    console.log("No items fetched");
    return [];
  }

  // Generate slugs for all new items first
  const existingGuids = new Set(
    (
      await NewsItem.find({ guid: { $in: allItems.map((i) => i.guid) } })
        .select("guid")
        .lean()
    ).map((i) => i.guid),
  );

  for (const item of allItems) {
    if (!existingGuids.has(item.guid)) {
      item.slug = await createSlug(item.title);
    }
  }

  // Bulk upsert using bulkWrite
  const bulkOps = allItems.map((item) => ({
    updateOne: {
      filter: { guid: item.guid },
      update: { $set: item, $setOnInsert: { fetchedAt: new Date() } },
      upsert: true,
    },
  }));

  let savedCount = 0;
  let updatedCount = 0;

  try {
    // Process in chunks of 100 to avoid oversized bulkWrite
    for (let i = 0; i < bulkOps.length; i += 100) {
      const chunk = bulkOps.slice(i, i + 100);
      const result = await NewsItem.bulkWrite(chunk, { ordered: false });
      savedCount += result.upsertedCount || 0;
      updatedCount += result.modifiedCount || 0;
    }
  } catch (error) {
    console.error(`BulkWrite error: ${error.message}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `MongoDB: ${savedCount} new, ${updatedCount} updated (${elapsed}s)`,
  );

  activityBus.emit("fetch", { saved: savedCount, updated: updatedCount });

  // Update JSON cache
  await updateCache();

  return allItems;
}

// Backfill translations for existing items that don't have one
// Processes in batches of 10 items per API call
export async function backfillTranslations(limit = 100) {
  await connectDB();

  // Find items without translatedTitle, sorted by newest
  const itemsWithoutTranslation = await NewsItem.find({
    translatedTitle: { $in: ["", null, undefined] },
  })
    .sort({ pubDate: -1 })
    .limit(limit)
    .lean();

  console.log(
    `Found ${itemsWithoutTranslation.length} items without translation`,
  );
  activityBus.emit("translate_log", {
    message: `Starting translation: ${itemsWithoutTranslation.length} items pending`,
  });

  if (itemsWithoutTranslation.length === 0) {
    activityBus.emit("translate_log", { message: "No items to translate" });
    return { translatedCount: 0, errorCount: 0 };
  }

  let translatedCount = 0;
  let errorCount = 0;
  const batchSize = 5;
  const totalBatches = Math.ceil(itemsWithoutTranslation.length / batchSize);

  for (let i = 0; i < itemsWithoutTranslation.length; i += batchSize) {
    const batch = itemsWithoutTranslation.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    console.log(
      `\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} items)`,
    );
    activityBus.emit("translate_log", {
      message: `📦 Batch ${batchNum}/${totalBatches} (${batch.length} items)`,
    });

    batch.forEach((item, idx) => {
      const title = item.title?.substring(0, 60) || "Untitled";
      console.log(`  [${i + idx + 1}] ${title}...`);
      activityBus.emit("translate_log", {
        message: `  [${i + idx + 1}] ${title}...`,
      });
    });

    const results = await translateBatch(batch);

    if (results.length > 0) {
      for (const result of results) {
        const item = batch[result.id];
        if (item && result.translatedTitle) {
          await NewsItem.updateOne(
            { _id: item._id },
            {
              translatedTitle: result.translatedTitle,
              translatedContent: result.translatedContent,
              sentiment: result.sentiment,
            },
          );
          translatedCount++;
          const msg = `  ✓ ${result.translatedTitle.substring(0, 50)}... [${result.sentiment}]`;
          console.log(msg);
          activityBus.emit("translate_log", { message: msg, status: "ok" });
        }
      }
    } else {
      errorCount += batch.length;
      console.log(`    ✗ Batch translation failed`);
      activityBus.emit("translate_log", {
        message: `  ✗ Batch ${batchNum} failed`,
        status: "error",
      });
    }

    activityBus.emit("translate_log", {
      message: `  Progress: ${translatedCount} done, ${errorCount} errors (${batchNum}/${totalBatches})`,
      progress: {
        translated: translatedCount,
        errors: errorCount,
        batch: batchNum,
        totalBatches,
      },
    });

    // Delay between batches to avoid rate limiting
    if (i + batchSize < itemsWithoutTranslation.length) {
      console.log(`  ⏳ Waiting 3s before next batch...`);
      activityBus.emit("translate_log", { message: `  ⏳ Waiting 3s...` });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log(
    `\n✅ Translation complete: ${translatedCount} translated, ${errorCount} errors`,
  );
  activityBus.emit("translate_log", {
    message: `✅ Complete: ${translatedCount} translated, ${errorCount} errors`,
    status: "done",
  });

  // Update JSON cache
  await updateCache();

  return { translatedCount, errorCount };
}

// Get news from MongoDB with optional category filter (searches tags array)
export async function getNews(category = null, limit = 200) {
  await connectDB();

  const query = category && category !== "all" ? { categories: category } : {};
  const items = await NewsItem.find(query)
    .sort({ pubDate: -1 })
    .limit(limit)
    .lean();

  return items;
}

// Run fetcher when executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const command = process.argv[2];

  if (command === "translate") {
    const limit = parseInt(process.argv[3]) || 50;
    backfillTranslations(limit)
      .then(() => {
        console.log("Translation backfill complete");
        process.exit(0);
      })
      .catch((err) => {
        console.error("Translation backfill failed:", err);
        process.exit(1);
      });
  } else {
    fetchAllSources()
      .then(() => {
        console.log("Fetch complete");
        process.exit(0);
      })
      .catch((err) => {
        console.error("Fetch failed:", err);
        process.exit(1);
      });
  }
}

export default {
  fetchAllSources,
  getNews,
  categorizeItem,
  backfillTranslations,
};
