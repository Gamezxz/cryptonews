import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { NewsItem } from '../src/db/models.js';

async function checkImages() {
  await connectDB();

  // Count items by source with/without images
  const sources = await NewsItem.distinct('source');

  console.log('Source                | Total | With Image | No Image');
  console.log('------------------------------------------------------');

  for (const source of sources) {
    const total = await NewsItem.countDocuments({ source });
    const withImage = await NewsItem.countDocuments({
      source,
      enclosure: { $ne: null, $exists: true, $ne: '' }
    });
    const noImage = total - withImage;

    console.log(`${source.padEnd(20)} | ${total.toString().padStart(5)} | ${withImage.toString().padStart(10)} | ${noImage.toString().padStart(8)}`);
  }

  await disconnectDB();
}

checkImages().catch(console.error);
