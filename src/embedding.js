import axios from "axios";
import { connectDB } from "./db/connection.js";
import { NewsItem } from "./db/models.js";

const OLLAMA_URL = "http://localhost:11434/api/embed";
const EMBED_MODEL = "nomic-embed-text";
const MAX_TEXT_LENGTH = 500;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// In-memory embedding cache
let embeddingCache = [];
let lastCacheRefresh = 0;

export async function generateEmbedding(text, retries = 2) {
  const truncated = String(text).slice(0, MAX_TEXT_LENGTH);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(
        OLLAMA_URL,
        { model: EMBED_MODEL, input: truncated },
        { timeout: 10000 },
      );
      const emb = res.data?.embeddings?.[0];
      if (emb && emb.length > 0) return emb;
      throw new Error("Empty embedding response");
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

export function cosineSimilarity(a, b) {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

async function refreshCache() {
  await connectDB();
  const articles = await NewsItem.find(
    { embedding: { $exists: true, $not: { $size: 0 } } },
    {
      _id: 1,
      slug: 1,
      title: 1,
      translatedTitle: 1,
      aiSummary: 1,
      sentiment: 1,
      source: 1,
      pubDate: 1,
      embedding: 1,
    },
  )
    .sort({ pubDate: -1 })
    .limit(2000)
    .lean();

  embeddingCache = articles;
  lastCacheRefresh = Date.now();
  console.log(`[Embedding] Cache refreshed: ${articles.length} articles`);
}

export async function findSimilarArticles(queryEmbedding, limit = 6) {
  const now = Date.now();
  if (!embeddingCache.length || now - lastCacheRefresh > CACHE_TTL) {
    await refreshCache();
  }

  if (!embeddingCache.length) return [];

  const scored = embeddingCache.map((article) => ({
    article,
    score: cosineSimilarity(queryEmbedding, article.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => ({
    _id: s.article._id,
    title: s.article.title,
    translatedTitle: s.article.translatedTitle,
    aiSummary: s.article.aiSummary,
    sentiment: s.article.sentiment,
    source: s.article.source,
    pubDate: s.article.pubDate,
    slug: s.article.slug,
    score: s.score,
  }));
}

export async function generateArticleEmbedding(article) {
  const text = [article.title || "", article.aiSummary || ""]
    .filter(Boolean)
    .join(" — ");
  if (!text.trim()) return null;
  return generateEmbedding(text);
}

export default {
  generateEmbedding,
  generateArticleEmbedding,
  cosineSimilarity,
  findSimilarArticles,
};
