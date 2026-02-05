import 'dotenv/config';
import axios from 'axios';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { NewsItem } from '../src/db/models.js';

// Scrape image URL from article HTML
async function scrapeImageUrl(url) {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CryptoNewsBot/1.0)'
      }
    });

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

    // First img in article content
    const articleImgMatch = html.match(/<article[^>]*>.*?<img[^>]+src=["']([^"']+)["']/is);
    if (articleImgMatch && articleImgMatch[1]) {
      return articleImgMatch[1];
    }

    return null;
  } catch (error) {
    console.error(`Error scraping image from ${url}:`, error.message);
    return null;
  }
}

async function updateTheBlockImages() {
  await connectDB();

  const theBlockItems = await NewsItem.find({ source: 'The Block' }).lean();

  console.log(`Found ${theBlockItems.length} The Block items`);

  let updated = 0;
  let failed = 0;

  for (const item of theBlockItems) {
    if (!item.enclosure) {
      console.log(`Scraping: ${item.title.substring(0, 50)}...`);
      const imageUrl = await scrapeImageUrl(item.link);

      if (imageUrl) {
        await NewsItem.updateOne(
          { _id: item._id },
          { $set: { enclosure: imageUrl } }
        );
        console.log(`  ✓ Updated: ${imageUrl.substring(0, 50)}...`);
        updated++;
      } else {
        console.log(`  ✗ No image found`);
        failed++;
      }
    }
  }

  console.log(`\nUpdated: ${updated}, Failed: ${failed}`);

  await disconnectDB();
}

updateTheBlockImages().catch(console.error);
