import { extract } from "@extractus/article-extractor";
import axios from "axios";
import { connectDB } from "./db/connection.js";
import { NewsItem } from "./db/models.js";
import { activityBus } from "./dashboard.js";

const AI_API_KEY = "REDACTED_API_KEY";
const AI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

// Scrape full article content from URL
async function scrapeArticle(url) {
  try {
    const article = await extract(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!article || !article.content) {
      return null;
    }

    // Clean HTML tags, keep plain text
    const plainText = article.content
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    return {
      content: plainText,
      wordCount: plainText.split(/\s+/).length,
    };
  } catch (error) {
    console.error(`Scrape failed for ${url}: ${error.message}`);
    return null;
  }
}

// AI summarize using GLM-4.5
async function summarizeArticle(fullContent, title) {
  const truncated = fullContent.substring(0, 6000);

  try {
    const response = await axios.post(
      `${AI_BASE_URL}/chat/completions`,
      {
        model: "glm-4.5",
        messages: [
          {
            role: "system",
            content: `You are a crypto news analyst. Summarize the article concisely.
Keep crypto terms (Bitcoin, Ethereum, BTC, ETH, DeFi, NFT) in English.
Provide both English and Thai summaries.

Output ONLY valid JSON:
{
  "summary": "English summary in 2-3 paragraphs",
  "summaryThai": "สรุปภาษาไทย 2-3 ย่อหน้า",
  "keyPoints": ["key point 1", "key point 2", "key point 3"]
}`,
          },
          {
            role: "user",
            content: `Title: ${title}\n\nArticle:\n${truncated}`,
          },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      },
    );

    const responseContent =
      response.data.choices[0]?.message?.content?.trim() || "";

    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || "",
        summaryThai: parsed.summaryThai || "",
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      };
    }

    return null;
  } catch (error) {
    console.error(`Summarize failed: ${error.message}`);
    return null;
  }
}

// Scrape + summarize a single news item and save to DB
export async function scrapeAndSummarize(newsItemId) {
  await connectDB();

  const item = await NewsItem.findById(newsItemId);
  if (!item) {
    console.error(`Item not found: ${newsItemId}`);
    return null;
  }

  if (item.scrapingStatus === "scraped") {
    console.log(`Already scraped: ${item.title.substring(0, 50)}`);
    return item;
  }

  console.log(`Scraping: ${item.title.substring(0, 60)}...`);

  // Step 1: Scrape
  const scraped = await scrapeArticle(item.link);

  if (!scraped || scraped.wordCount < 50) {
    await NewsItem.updateOne(
      { _id: item._id },
      {
        scrapingStatus: "failed",
      },
    );
    console.log(`  Failed: content too short or unavailable`);
    return null;
  }

  // Step 2: Summarize
  console.log(`  Summarizing (${scraped.wordCount} words)...`);
  const summary = await summarizeArticle(scraped.content, item.title);

  // Step 3: Save
  const updateData = {
    fullContent: scraped.content,
    wordCount: scraped.wordCount,
    scrapingStatus: "scraped",
  };

  if (summary) {
    updateData.aiSummary = summary.summary;
    updateData.aiSummaryThai = summary.summaryThai;
    updateData.keyPoints = summary.keyPoints;
    console.log(`  Done: ${summary.keyPoints.length} key points`);
  } else {
    console.log(`  Scraped but summary failed`);
  }

  await NewsItem.updateOne({ _id: item._id }, updateData);

  activityBus.emit("scrape", {
    message: summary ? "Scraped + summarized" : "Scraped (summary failed)",
    title: item.title?.substring(0, 60),
  });

  return { ...item.toObject(), ...updateData };
}

// Batch scrape recent articles that haven't been scraped yet
export async function batchScrapeRecent(limit = 10) {
  await connectDB();

  const items = await NewsItem.find({
    scrapingStatus: { $in: ["", "pending", null] },
    link: { $exists: true, $ne: "" },
  })
    .sort({ pubDate: -1 })
    .limit(limit)
    .lean();

  console.log(`\nBatch scraping ${items.length} articles...`);

  let success = 0;
  let failed = 0;

  for (const item of items) {
    const result = await scrapeAndSummarize(item._id);
    if (result) {
      success++;
    } else {
      failed++;
    }

    // Delay between items
    if (items.indexOf(item) < items.length - 1) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log(`\nBatch complete: ${success} success, ${failed} failed`);
  return { success, failed };
}

// Continuous mode: scrape articles back-to-back without delay
export async function continuousScrape() {
  await connectDB();
  console.log("=== Continuous Scrape Mode ===");
  console.log("Processing articles back-to-back...\n");

  let total = 0;
  let success = 0;
  let failed = 0;

  while (true) {
    try {
      const item = await NewsItem.findOne({
        scrapingStatus: { $in: ["", "pending", null] },
        link: { $exists: true, $ne: "" },
      })
        .sort({ pubDate: -1 })
        .lean();

      if (!item) {
        console.log("No more articles to scrape. Waiting 5 minutes...");
        await new Promise((r) => setTimeout(r, 300000));
        continue;
      }

      total++;
      const remaining = await NewsItem.countDocuments({
        scrapingStatus: { $in: ["", "pending", null] },
        link: { $exists: true, $ne: "" },
      });

      console.log(
        `[${new Date().toLocaleTimeString()}] #${total} (${remaining} remaining)`,
      );

      const result = await scrapeAndSummarize(item._id);
      if (result) {
        success++;
      } else {
        failed++;
      }

      console.log(`  Stats: ${success} ok / ${failed} fail / ${total} total\n`);
    } catch (err) {
      console.error(`Loop error: ${err.message}`);
      failed++;
      // Brief pause on error to avoid tight error loops
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// CLI support — check if this file is the main entry point
const isMain =
  process.argv[1] &&
  (process.argv[1] === new URL(import.meta.url).pathname ||
    process.argv[1].endsWith("scraper.js"));

if (isMain) {
  const command =
    process.argv.includes("continuous") || process.argv.includes("c")
      ? "continuous"
      : process.argv[2];

  if (command === "continuous") {
    continuousScrape().catch((err) => {
      console.error("Continuous scrape failed:", err);
      process.exit(1);
    });
  } else {
    const limit = parseInt(command) || 10;
    batchScrapeRecent(limit)
      .then(() => process.exit(0))
      .catch((err) => {
        console.error("Batch scrape failed:", err);
        process.exit(1);
      });
  }
}

export default { scrapeAndSummarize, batchScrapeRecent, continuousScrape };
