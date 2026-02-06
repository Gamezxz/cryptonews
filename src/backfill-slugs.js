import "dotenv/config";
import { connectDB, disconnectDB } from "./db/connection.js";
import { NewsItem } from "./db/models.js";
import { createSlug } from "./utils/slug.js";

async function backfillSlugs() {
  await connectDB();

  const items = await NewsItem.find({
    $or: [{ slug: null }, { slug: { $exists: false } }, { slug: "" }],
  })
    .sort({ pubDate: -1 })
    .select("_id title")
    .lean();

  console.log(`Found ${items.length} articles without slugs`);

  let updated = 0;
  let errors = 0;

  for (const item of items) {
    try {
      const slug = await createSlug(item.title);
      if (slug) {
        await NewsItem.updateOne({ _id: item._id }, { slug });
        updated++;
        if (updated % 100 === 0) {
          console.log(`  Progress: ${updated}/${items.length}`);
        }
      }
    } catch (err) {
      errors++;
      console.error(`  Error for "${item.title?.substring(0, 40)}": ${err.message}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${errors} errors`);
  await disconnectDB();
  process.exit(0);
}

backfillSlugs().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
