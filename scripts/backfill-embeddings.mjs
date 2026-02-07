import mongoose from "mongoose";
import axios from "axios";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/cryptonews";
const OLLAMA_URL = "http://localhost:11434/api/embed";
const EMBED_MODEL = "nomic-embed-text";
const MAX_TEXT_LENGTH = 500;
const BATCH_LOG_INTERVAL = 50;

async function generateEmbedding(text) {
  const truncated = String(text).slice(0, MAX_TEXT_LENGTH);
  const res = await axios.post(
    OLLAMA_URL,
    { model: EMBED_MODEL, input: truncated },
    { timeout: 15000 },
  );
  return res.data?.embeddings?.[0] || null;
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const collection = mongoose.connection.db.collection("newsitems");

  const total = await collection.countDocuments({
    aiSummary: { $ne: "" },
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
    ],
  });

  console.log(`Found ${total} articles to backfill`);
  if (total === 0) {
    console.log("Nothing to do");
    await mongoose.disconnect();
    return;
  }

  const cursor = collection.find(
    {
      aiSummary: { $ne: "" },
      $or: [
        { embedding: { $exists: false } },
        { embedding: { $size: 0 } },
      ],
    },
    { projection: { _id: 1, title: 1, aiSummary: 1 } },
  ).sort({ pubDate: -1 });

  let processed = 0;
  let errors = 0;

  for await (const doc of cursor) {
    const text = [doc.title || "", doc.aiSummary || ""].filter(Boolean).join(" — ");
    if (!text.trim()) {
      processed++;
      continue;
    }

    try {
      const embedding = await generateEmbedding(text);
      if (embedding && embedding.length > 0) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { embedding } },
        );
      }
    } catch (err) {
      errors++;
      console.error(`Error embedding ${doc._id}: ${err.message}`);
    }

    processed++;
    if (processed % BATCH_LOG_INTERVAL === 0) {
      console.log(`Progress: ${processed}/${total} (${errors} errors)`);
    }
  }

  console.log(`\nDone! Processed: ${processed}, Errors: ${errors}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
