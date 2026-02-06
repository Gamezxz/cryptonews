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

// AI config
const AI_API_KEY = 'REDACTED_API_KEY';
const AI_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

// AI Summary using GLM-4.5 via Z.ai API
async function summarizeArticle(title, content) {
  const textToSummarize = content || title;

  try {
    const response = await axios.post(
      `${AI_BASE_URL}/chat/completions`,
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
          'Authorization': `Bearer ${AI_API_KEY}`,
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

// AI Batch Translation + Sentiment Analysis using GLM-4.5 via Z.ai API
// Translates up to 10 news items in a single API call
async function translateBatch(items) {
  if (!items || items.length === 0) return [];

  // Prepare batch input
  const newsItems = items.map((item, idx) => ({
    id: idx,
    title: item.title,
    content: (item.content || '').substring(0, 1500)
  }));

  const inputText = newsItems.map(n =>
    `[${n.id}] Title: ${n.title}\nContent: ${n.content || 'No content'}`
  ).join('\n\n---\n\n');

  try {
    const response = await axios.post(
      `${AI_BASE_URL}/chat/completions`,
      {
        model: 'glm-4.5',
        messages: [
          {
            role: 'system',
            content: `You are a crypto news translator. Translate multiple news items to Thai.
Keep crypto terms (Bitcoin, Ethereum, BTC, ETH, DeFi, NFT, XRP) and company names in English.
Also analyze market sentiment for each.

Output ONLY a valid JSON array:
[{"id": 0, "title": "Thai title", "content": "Thai content", "sentiment": "bullish/bearish/neutral"}, ...]

Sentiment rules:
- bullish: positive (price up, adoption, approval, partnership, growth)
- bearish: negative (price down, hack, ban, lawsuit, crash, loss)
- neutral: informational or mixed`
          },
          {
            role: 'user',
            content: inputText
          }
        ],
        max_tokens: 8000,
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    );

    const responseContent = response.data.choices[0]?.message?.content?.trim() || '';

    // Parse JSON array response
    try {
      const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map(p => ({
          id: p.id,
          translatedTitle: p.title || '',
          translatedContent: p.content || '',
          sentiment: ['bullish', 'bearish', 'neutral'].includes(p.sentiment) ? p.sentiment : 'neutral'
        }));
      }
    } catch (parseError) {
      console.error(`JSON parse error: ${parseError.message}`);
    }

    return [];
  } catch (error) {
    console.error(`AI Batch Translation error: ${error.message}`);
    return [];
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

  let translatedCount = 0;

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

      // Only translate items WITHOUT translatedTitle
      let translatedTitle = existing?.translatedTitle || '';
      let translatedContent = existing?.translatedContent || '';
      let sentiment = existing?.sentiment || '';
      if (!translatedTitle && item.title) {
        console.log(`  Translating: ${item.title?.substring(0, 40)}...`);
        const result = await translateAndAnalyze(item.title, item.content);
        translatedTitle = result.translatedTitle;
        translatedContent = result.translatedContent;
        sentiment = result.sentiment;
        if (translatedTitle) {
          translatedCount++;
          console.log(`    Translated: ${translatedTitle.substring(0, 50)}... [${sentiment}]`);
        }
        // Add small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      }

      const dbResult = await NewsItem.findOneAndUpdate(
        { guid: item.guid },
        { ...item, summary, translatedTitle, translatedContent, sentiment },
        { upsert: true, new: false }
      );

      if (dbResult) {
        updatedCount++;
      } else {
        savedCount++;
      }
    } catch (error) {
      console.error(`Error saving item ${item.guid}:`, error.message);
    }
  }

  console.log(`MongoDB: ${savedCount} new, ${updatedCount} updated, ${summarizedCount} summarized, ${translatedCount} translated`);

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

// Backfill translations for existing items that don't have one
export async function backfillTranslations(limit = 100) {
  await connectDB();

  // Find items without translatedTitle, sorted by newest
  const itemsWithoutTranslation = await NewsItem.find({
    translatedTitle: { $in: ['', null, undefined] }
  })
    .sort({ pubDate: -1 })
    .limit(limit)
    .lean();

  console.log(`Found ${itemsWithoutTranslation.length} items without translation`);

  let translatedCount = 0;
  let errorCount = 0;

  for (const item of itemsWithoutTranslation) {
    try {
      console.log(`  [${translatedCount + 1}/${itemsWithoutTranslation.length}] ${item.title?.substring(0, 50)}...`);

      const result = await translateAndAnalyze(item.title, item.content);
      if (result.translatedTitle) {
        await NewsItem.updateOne({ _id: item._id }, {
          translatedTitle: result.translatedTitle,
          translatedContent: result.translatedContent,
          sentiment: result.sentiment
        });
        translatedCount++;
        console.log(`    ✓ ${result.translatedTitle.substring(0, 50)}... [${result.sentiment}]`);
      } else {
        console.log(`    ✗ Empty translation`);
      }

      // Delay to avoid rate limiting (2 seconds)
      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      errorCount++;
      console.error(`    ✗ Error: ${error.message}`);
    }
  }

  console.log(`Translation backfill complete: ${translatedCount} translated, ${errorCount} errors`);

  // Update JSON cache
  await updateCache();

  return { translatedCount, errorCount };
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
        console.log('Summary backfill complete');
        process.exit(0);
      })
      .catch(err => {
        console.error('Backfill failed:', err);
        process.exit(1);
      });
  } else if (command === 'translate') {
    const limit = parseInt(process.argv[3]) || 50;
    backfillTranslations(limit)
      .then(() => {
        console.log('Translation backfill complete');
        process.exit(0);
      })
      .catch(err => {
        console.error('Translation backfill failed:', err);
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

export default { fetchAllSources, getNews, categorizeItem, backfillSummaries, backfillTranslations };
