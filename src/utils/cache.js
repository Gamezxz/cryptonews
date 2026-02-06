import fs from 'fs/promises';
import path from 'path';
import { connectDB } from '../db/connection.js';
import { NewsItem } from '../db/models.js';
import config from '../../config/default.js';

const CACHE_DIR = path.join(process.cwd(), 'data');

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }
}

// Update JSON cache from MongoDB
export async function updateCache() {
  await connectDB();
  await ensureCacheDir();

  try {
    const items = await NewsItem.find({})
      .sort({ pubDate: -1 })
      .limit(500)
      .lean();

    const cachePath = path.join(CACHE_DIR, 'cache.json');
    await fs.writeFile(cachePath, JSON.stringify(items, null, 2));
    console.log(`Cache updated: ${items.length} items`);
  } catch (error) {
    console.error('Error updating cache:', error.message);
  }
}

// Load from JSON cache - auto-create if not exists
export async function loadCache() {
  await ensureCacheDir();

  const cachePath = path.join(CACHE_DIR, 'cache.json');

  try {
    const data = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    // File doesn't exist - create it now
    console.log('No cache found, creating new cache...');
    await updateCache();

    // Try reading again
    try {
      const data = await fs.readFile(cachePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
}

// Run cache update when executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  updateCache()
    .then(() => {
      console.log('Cache update complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Cache update failed:', err);
      process.exit(1);
    });
}

export default { updateCache, loadCache };
