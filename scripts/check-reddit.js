import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { NewsItem } from '../src/db/models.js';

async function checkReddit() {
  await connectDB();

  // Check all unique sources
  const sources = await NewsItem.distinct('source');
  console.log('All sources:', sources);

  // Count items by source
  for (const source of sources) {
    const count = await NewsItem.countDocuments({ source: source });
    console.log(`${source}: ${count} items`);
  }

  // Check for reddit category
  const redditCategoryCount = await NewsItem.countDocuments({ category: 'reddit' });
  console.log(`\nCategory 'reddit': ${redditCategoryCount} items`);

  await disconnectDB();
}

checkReddit().catch(console.error);
