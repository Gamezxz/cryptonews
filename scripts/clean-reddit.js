import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { NewsItem } from '../src/db/models.js';

async function cleanReddit() {
  await connectDB();

  const redditSources = ['r/CryptoCurrency', 'r/Bitcoin', 'Reddit'];

  for (const source of redditSources) {
    const result = await NewsItem.deleteMany({ source: source });
    console.log(`Deleted ${result.deletedCount} items from ${source}`);
  }

  // Also check if any have reddit category
  const categoryResult = await NewsItem.deleteMany({ category: 'reddit' });
  console.log(`Deleted ${categoryResult.deletedCount} items with reddit category`);

  await disconnectDB();
  console.log('Cleanup complete');
}

cleanReddit().catch(console.error);
