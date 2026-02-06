import Parser from 'rss-parser';
import { sources } from '../config/sources.js';
import { connectDB } from './db/connection.js';
import { NewsItem } from './db/models.js';
import { updateCache } from './utils/cache.js';
import config from '../config/default.js';
import axios from 'axios';

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: [
      ['media:content', 'media'],
      ['enclosure', 'enclosure'],
      ['description', 'description'],
      ['content:encoded', 'contentEncoded']
    ]
  }
});

// Category keywords for auto-categorization
const categoryKeywords = {
  bitcoin: ['bitcoin', 'btc', 'satoshi', 'lightning network', 'btc price'],
  ethereum: ['ethereum', 'eth', 'vitalik', 'erc', 'erc20', 'erc721', 'layer 2', 'l2'],
  defi: ['defi', 'yield farming', 'liquidity', 'amm', 'dex', 'uniswap', 'aave', 'compound', 'curve'],
  nft: ['nft', 'non-fungible', 'opensea', 'digital collectible', 'nfts'],
  altcoins: ['solana', 'cardano', 'ripple', 'xrp', 'ada', 'dogecoin', 'polygon', 'bnb', 'avax', 'polkadot'],
  regulation: ['sec', 'regulation', 'law', 'legal', 'compliance', 'ban', 'etf', 'approval'],
  mining: ['mining', 'hash rate', 'miner', 'proof of work', 'pool', 'bitcoin mining']
};

// AI Summary using GLM-4.5 via Z.ai API
async function summarizeArticle(title, content) {
  const apiKey = 'REDACTED_API_KEY';
  const baseURL = 'https://api.z.ai/api/coding/paas/v4';

  const textToSummarize = content || title;

  try {
    const response = await axios.post(
      `${baseURL}/chat/completions`,
      {
        model: 'glm-4.5',
        messages: [
          {
            role: 'system',
            content: 'You are a crypto news summarizer. Provide concise, informative summaries in 1-2 sentences (max 50 words). Focus on key facts and implications. Use Thai language.'
          },
          {
            role: 'user',
            content: `สรุปข่าว crypto นี้:\n\nหัวข้อ: ${title}\n\nเนื้อหา: ${textToSummarize.substring(0, 2000)}`
          }
        ],
        max_tokens: 150,
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error(`AI Summary error: ${error.message}`);
    return '';
  }
}

// Scrape og:image from article HTML as fallback
async function scrapeImageUrl(url) {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CryptoNewsBot/1.0)' }
    });
    const html = response.data;

    // og:image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogMatch?.[1]) return ogMatch[1];

    // twitter:image
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
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
  if (item.media?.['$']?.url) {
    return item.media['$'].url;
  }

  // Try content:encoded (HTML content)
  if (item.contentEncoded) {
    const imgMatch = item.contentEncoded.match(/<img[^>]+src=["']([^"']+)["']/i);
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
  const title = (item.title || '').toLowerCase();
  const content = (item.contentSnippet || item.content || '').toLowerCase();
  const text = `${title} ${content}`;

  const matched = [];
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      matched.push(category);
    }
  }

  return matched.length > 0 ? matched : ['general'];
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
        guid: item.guid || item.link,
        title: item.title || 'Untitled',
        link: item.link,
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        content: item.contentSnippet || item.content || '',
        author: item.author || item.creator || source.name,
        enclosure: imageUrl || item.enclosure?.url || null,
        categories: tags,
        source: source.name,
        sourceCategory: source.category,
        category: tags[0]
      });
    }

    console.log(`Fetched ${items.length} items from ${source.name}`);
  } catch (error) {
    console.error(`Error fetching ${source.name}:`, error.message);
  }

  return items;
}

// Fetch all enabled sources and save to MongoDB
export async function fetchAllSources() {
  await connectDB();

  const enabledSources = sources.filter(s => s.enabled);
  const allItems = [];

  console.log(`Fetching from ${enabledSources.length} sources...`);

  for (const source of enabledSources) {
    const items = await fetchFeed(source);
    allItems.push(...items);
  }

  if (allItems.length === 0) {
    console.log('No items fetched');
    return [];
  }

  // Save to MongoDB with upsert
  let savedCount = 0;
  let updatedCount = 0;
  let summarizedCount = 0;

  for (const item of allItems) {
    try {
      const existing = await NewsItem.findOne({ guid: item.guid });

      // Only summarize items WITHOUT summary (both new and existing)
      let summary = existing?.summary || '';
      if (!summary && item.title) {
        console.log(`  Summarizing: ${item.title?.substring(0, 40)}...`);
        summary = await summarizeArticle(item.title, item.content);
        if (summary) {
          summarizedCount++;
          console.log(`    Summary: ${summary.substring(0, 60)}...`);
        }
        // Add small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      }

      const result = await NewsItem.findOneAndUpdate(
        { guid: item.guid },
        { ...item, summary },
        { upsert: true, new: false }
      );

      if (result) {
        updatedCount++;
      } else {
        savedCount++;
      }
    } catch (error) {
      console.error(`Error saving item ${item.guid}:`, error.message);
    }
  }

  console.log(`MongoDB: ${savedCount} new, ${updatedCount} updated, ${summarizedCount} summarized`);

  // Update JSON cache
  await updateCache();

  return allItems;
}

// Backfill summaries for existing items that don't have one
export async function backfillSummaries(limit = 100) {
  await connectDB();

  // Find items without summary, sorted by newest
  const itemsWithoutSummary = await NewsItem.find({
    summary: { $in: ['', null, undefined] }
  })
    .sort({ pubDate: -1 })
    .limit(limit)
    .lean();

  console.log(`Found ${itemsWithoutSummary.length} items without summary`);

  let summarizedCount = 0;
  let errorCount = 0;

  for (const item of itemsWithoutSummary) {
    try {
      console.log(`  [${summarizedCount + 1}/${itemsWithoutSummary.length}] ${item.title?.substring(0, 50)}...`);

      const summary = await summarizeArticle(item.title, item.content);
      if (summary) {
        await NewsItem.updateOne({ _id: item._id }, { summary });
        summarizedCount++;
        console.log(`    ✓ ${summary.substring(0, 60)}...`);
      } else {
        console.log(`    ✗ Empty summary`);
      }

      // Delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 800));
    } catch (error) {
      errorCount++;
      console.error(`    ✗ Error: ${error.message}`);
    }
  }

  console.log(`Backfill complete: ${summarizedCount} summarized, ${errorCount} errors`);

  // Update JSON cache
  await updateCache();

  return { summarizedCount, errorCount };
}

// Get news from MongoDB with optional category filter (searches tags array)
export async function getNews(category = null, limit = 200) {
  await connectDB();

  const query = category && category !== 'all' ? { categories: category } : {};
  const items = await NewsItem.find(query)
    .sort({ pubDate: -1 })
    .limit(limit)
    .lean();

  return items;
}

// Run fetcher when executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const command = process.argv[2];

  if (command === 'backfill') {
    const limit = parseInt(process.argv[3]) || 50;
    backfillSummaries(limit)
      .then(() => {
        console.log('Backfill complete');
        process.exit(0);
      })
      .catch(err => {
        console.error('Backfill failed:', err);
        process.exit(1);
      });
  } else {
    fetchAllSources()
      .then(() => {
        console.log('Fetch complete');
        process.exit(0);
      })
      .catch(err => {
        console.error('Fetch failed:', err);
        process.exit(1);
      });
  }
}

export default { fetchAllSources, getNews, categorizeItem, backfillSummaries };
