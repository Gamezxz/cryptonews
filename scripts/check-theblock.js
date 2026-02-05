import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { NewsItem } from '../src/db/models.js';

async function checkTheBlock() {
  await connectDB();

  const theBlockItems = await NewsItem.find({ source: 'The Block' })
    .sort({ pubDate: -1 })
    .limit(10)
    .lean();

  console.log('The Block recent items:');
  console.log('---------------------');

  for (const item of theBlockItems) {
    const hasImage = item.enclosure ? '✓' : '✗';
    const imageUrl = item.enclosure ? item.enclosure.substring(0, 60) + '...' : 'NO IMAGE';
    console.log(`${hasImage} ${item.title.substring(0, 50)}...`);
    console.log(`   ${imageUrl}\n`);
  }

  await disconnectDB();
}

checkTheBlock().catch(console.error);
