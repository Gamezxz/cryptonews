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

// Scrape image URL from article HTML (for sources without images in RSS)
async function scrapeImageUrl(url, source) {
  // Only scrape for specific sources that don't include images in RSS
  if (!['The Block'].includes(source)) {
    return null;
  }

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CryptoNewsBot/1.0)'
      }
    });

    // Try to find featured image in various patterns
    const html = response.data;

    // Open Graph image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1]) {
      return ogMatch[1];
    }

    // Twitter image
    const twitterMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (twitterMatch && twitterMatch[1]) {
      return twitterMatch[1];
    }

    // First img in article content (The Block specific)
    const articleImgMatch = html.match(/<article[^>]*>.*?<img[^>]+src=["']([^"']+)["']/is);
    if (articleImgMatch && articleImgMatch[1]) {
      return articleImgMatch[1];
    }

    // Featured image div
    const featuredMatch = html.match(/class=["']featured-image[^"']*["'][^>]*>.*?<img[^>]+src=["']([^"']+)["']/is);
    if (featuredMatch && featuredMatch[1]) {
      return featuredMatch[1];
    }

    // Hero image
    const heroMatch = html.match(/class=["']hero[^"']*["'][^>]*>.*?<img[^>]+src=["']([^"']+)["']/is);
    if (heroMatch && heroMatch[1]) {
      return heroMatch[1];
    }

    return null;
  } catch (error) {
    console.error(`Error scraping image from ${url}:`, error.message);
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
      let imageUrl = extractImageUrl(item);

      // For The Block, scrape the article page if no image found in RSS
      if (!imageUrl && source.name === 'The Block' && item.link) {
        console.log(`  Scraping image for: ${item.title?.substring(0, 50)}...`);
        imageUrl = await scrapeImageUrl(item.link, source.name);
        if (imageUrl) {
          console.log(`    Found: ${imageUrl.substring(0, 60)}...`);
        }
      }

      items.push({
        guid: item.guid || item.link,
        title: item.title || 'Untitled',
        link: item.link,
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        content: item.contentSnippet || item.content || '',
        author: item.author || item.creator || source.name,
        enclosure: imageUrl || item.enclosure?.url || null,
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
