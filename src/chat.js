import axios from "axios";
import { loadCache } from "./utils/cache.js";

const AI_API_KEY = "REDACTED_API_KEY";
const AI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

// In-memory article index
let cachedArticles = null;
let lastCacheLoad = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// Rate limit: 20 req/min/IP
const rateLimitMap = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 1000;

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "about", "between",
  "through", "after", "before", "above", "below", "and", "but", "or",
  "not", "no", "nor", "so", "yet", "both", "either", "neither", "each",
  "every", "all", "any", "few", "more", "most", "other", "some", "such",
  "than", "too", "very", "just", "also", "how", "what", "which", "who",
  "whom", "this", "that", "these", "those", "i", "me", "my", "we", "our",
  "you", "your", "he", "him", "his", "she", "her", "it", "its", "they",
  "them", "their", "ไหม", "อะไร", "เท่าไหร่", "ยังไง", "ทำไม", "เมื่อไหร่",
  "ครับ", "ค่ะ", "นะ", "จ้า", "ที่", "และ", "หรือ", "แต่", "ของ", "ใน",
  "จาก", "กับ", "ให้", "ได้", "มี", "เป็น", "ว่า", "ไป", "มา", "จะ",
]);

async function getArticles() {
  const now = Date.now();
  if (cachedArticles && now - lastCacheLoad < CACHE_TTL) {
    return cachedArticles;
  }

  const raw = await loadCache();
  cachedArticles = raw.map((a) => ({
    title: a.title || "",
    translatedTitle: a.translatedTitle || "",
    aiSummary: a.aiSummary || "",
    keyPoints: a.keyPoints || [],
    sentiment: a.sentiment || "",
    source: a.source || "",
    category: a.category || "",
    pubDate: a.pubDate || "",
    slug: a.slug || "",
    // Pre-compute searchable blob
    _blob: [
      a.title, a.translatedTitle, a.aiSummary,
      ...(a.keyPoints || []),
    ].join(" ").toLowerCase(),
  }));
  lastCacheLoad = now;
  return cachedArticles;
}

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\sก-๙]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function findRelevantArticles(articles, keywords, limit = 12) {
  if (!keywords.length) {
    return articles.slice(0, 10);
  }

  const scored = articles.map((a) => {
    let score = 0;
    const titleLower = a.title.toLowerCase();
    const summaryLower = a.aiSummary.toLowerCase();

    for (const kw of keywords) {
      if (titleLower.includes(kw)) score += 3;
      if (summaryLower.includes(kw)) score += 2;
      if (a._blob.includes(kw)) score += 1;
    }
    return { article: a, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // If no matches, return most recent
  if (scored[0].score === 0) {
    return articles.slice(0, 10);
  }

  return scored
    .filter((s) => s.score > 0)
    .slice(0, limit)
    .map((s) => s.article);
}

function buildContext(articles) {
  return articles
    .map((a, i) => {
      const date = a.pubDate ? new Date(a.pubDate).toLocaleDateString("en-US") : "N/A";
      const points = a.keyPoints.length ? `\nKey Points: ${a.keyPoints.join("; ")}` : "";
      return `[${i + 1}] ${a.title} (${a.translatedTitle})\nSentiment: ${a.sentiment} | Source: ${a.source} | ${date}\nSummary: ${a.aiSummary}${points}`;
    })
    .join("\n\n");
}

export function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.start > RATE_WINDOW) {
      rateLimitMap.delete(ip);
    }
  }
}, 60 * 1000);

export async function handleChat(message, history = []) {
  const articles = await getArticles();
  const keywords = extractKeywords(message);
  const relevant = findRelevantArticles(articles, keywords);
  const context = buildContext(relevant);

  const systemPrompt = `You are CryptoNews AI Assistant — a helpful crypto news analyst for cryptonews.in.th.
You answer questions about cryptocurrency news, market trends, and specific coins/tokens based on the latest articles from our database.

Here are the most relevant recent articles:

${context}

Rules:
- Answer in the same language as the user's question (Thai or English)
- Base your answers on the provided articles — cite specific data, prices, and events
- If the question is not related to the articles or crypto, politely redirect to crypto topics
- Keep answers concise but informative (2-4 paragraphs max)
- When referencing an article, mention its number like [1], [2] etc.
- Be conversational and helpful`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const response = await axios.post(
    `${AI_BASE_URL}/chat/completions`,
    {
      model: "GLM-4.5-Air",
      messages,
      temperature: 0.5,
      max_tokens: 2000,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      timeout: 60000,
    },
  );

  const answer = response.data.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error("Empty AI response");
  }

  // Return sources (articles referenced)
  const sources = relevant.slice(0, 5).map((a) => ({
    title: a.title,
    translatedTitle: a.translatedTitle,
    slug: a.slug,
    source: a.source,
  }));

  return { answer, sources };
}

export default { handleChat, checkRateLimit };
