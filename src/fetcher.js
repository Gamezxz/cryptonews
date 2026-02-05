import Parser from 'rss-parser';
import { sources } from '../config/sources.js';
import { connectDB } from './db/connection.js';
import { NewsItem } from './db/models.js';
import { updateCache } from './utils/cache.js';
import config from '../config/default.js';

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: [
      ['media:content', 'media'],
      ['enclosure', 'enclosure'],
      ['description', 'description']
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

// Categorize news item based on keywords
function categorizeItem(item) {
  const title = (item.title || '').toLowerCase();
  const content = (item.contentSnippet || item.content || '').toLowerCase();
  const text = `${title} ${content}`;

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }

  return 'general';
}

// Fetch single RSS feed
async function fetchFeed(source) {
  const items = [];

  try {
    console.log(`Fetching ${source.name}...`);
    const feed = await parser.parseURL(source.url);

    for (const item of feed.items.slice(0, 50)) {
      const category = categorizeItem(item);
      items.push({
        guid: item.guid || item.link,
        title: item.title || 'Untitled',
        link: item.link,
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        content: item.contentSnippet || item.content || '',
        author: item.author || item.creator || source.name,
        enclosure: item.enclosure?.url || null,
        categories: item.categories || [],
        source: source.name,
        sourceCategory: source.category,
        category: category
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

  for (const item of allItems) {
    try {
      const result = await NewsItem.findOneAndUpdate(
        { guid: item.guid },
        item,
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

  console.log(`MongoDB: ${savedCount} new, ${updatedCount} updated`);

  // Update JSON cache
  await updateCache();

  return allItems;
}

// Get news from MongoDB with optional category filter
export async function getNews(category = null, limit = 200) {
  await connectDB();

  const query = category && category !== 'all' ? { category } : {};
  const items = await NewsItem.find(query)
    .sort({ pubDate: -1 })
    .limit(limit)
    .lean();

  return items;
}

// Run fetcher when executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
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

export default { fetchAllSources, getNews, categorizeItem };
