import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { connectDB } from "./db/connection.js";
import { NewsItem } from "./db/models.js";
import { activityBus } from "./dashboard.js";

const AI_API_KEY = "3439bee081604b91bc8262a5fa8cd315.42NAKBcYGbemMJN2";
const AI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
const INSIGHT_PATH = path.join(process.cwd(), "data", "insight.json");

export async function generateMarketInsight() {
  try {
    await connectDB();

    // Get 20 latest articles with full content (EN)
    const articles = await NewsItem.find({
      translatedTitle: { $exists: true, $nin: ["", null] },
    })
      .sort({ pubDate: -1 })
      .limit(20)
      .select(
        "title translatedTitle sentiment category source pubDate fullContent content",
      )
      .lean();

    if (articles.length < 3) {
      console.log("[Insight] Not enough translated articles yet");
      return null;
    }

    // Count sentiment from ALL recent articles (last 100)
    const sentimentArticles = await NewsItem.find({
      sentiment: { $in: ["bullish", "bearish", "neutral"] },
    })
      .sort({ pubDate: -1 })
      .limit(100)
      .select("sentiment")
      .lean();

    const sentimentCounts = { bullish: 0, bearish: 0, neutral: 0 };
    for (const a of sentimentArticles) {
      if (sentimentCounts[a.sentiment] !== undefined) {
        sentimentCounts[a.sentiment]++;
      }
    }

    const total =
      sentimentCounts.bullish +
      sentimentCounts.bearish +
      sentimentCounts.neutral;
    const sentimentPercent = {
      bullish:
        total > 0 ? Math.round((sentimentCounts.bullish / total) * 100) : 0,
      bearish:
        total > 0 ? Math.round((sentimentCounts.bearish / total) * 100) : 0,
      neutral:
        total > 0 ? Math.round((sentimentCounts.neutral / total) * 100) : 0,
    };

    // Build prompt for AI — send full article content (EN), truncate each to ~500 chars
    const articleList = articles
      .map((a, i) => {
        const body = (a.fullContent || a.content || "").slice(0, 500);
        return `--- Article ${i + 1} [${a.sentiment || "unknown"}] ---\nTitle: ${a.title}\n${body}`;
      })
      .join("\n\n");

    const prompt = `You are a crypto market analyst. Based on the full content of these 20 latest crypto news articles, provide a detailed market insight summary.

${articleList}

Sentiment stats (last 100 articles): Bullish ${sentimentPercent.bullish}%, Bearish ${sentimentPercent.bearish}%, Neutral ${sentimentPercent.neutral}%

Respond in JSON format only:
{
  "summary": "สรุปภาพรวมตลาด crypto ภาษาไทย 4-6 ประโยค วิเคราะห์เชิงลึก ครอบคลุมประเด็นสำคัญ ระบุเหรียญ/ตัวเลขที่เกี่ยวข้อง",
  "summaryEn": "English market summary 4-6 sentences, in-depth analysis covering key developments with specific coins/numbers mentioned",
  "tldrTh": ["ประเด็นสำคัญ 1 ภาษาไทย สั้นกระชับ", "ประเด็นสำคัญ 2", "ประเด็นสำคัญ 3", "ประเด็นสำคัญ 4"],
  "tldrEn": ["Key point 1 in English, concise", "Key point 2", "Key point 3", "Key point 4"],
  "keyTopics": ["Topic1", "Topic2", "Topic3", "Topic4", "Topic5"],
  "marketMood": "bullish or bearish or neutral"
}

Rules:
- summary/summaryEn: 4-6 sentences each, detailed analysis with specific data points (prices, percentages, coin names)
- tldrTh: 4-6 bullet points in Thai, each point covers one key development
- tldrEn: 4-6 bullet points in English, matching tldrTh content
- keyTopics: 3-5 trending topics/keywords from the news
- marketMood: overall market mood based on all data
- JSON only, no markdown, no explanation`;

    activityBus.emit("translate_log", {
      message: "🧠 Generating market insight...",
    });

    const response = await axios.post(
      `${AI_BASE_URL}/chat/completions`,
      {
        model: "GLM-4.5-Air",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 8000,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_API_KEY}`,
        },
        timeout: 90000,
      },
    );

    const message = response.data.choices?.[0]?.message;
    const content =
      message?.content?.trim() || message?.reasoning_content?.trim();
    if (!content) {
      throw new Error("Empty AI response");
    }

    // Parse JSON from response (handle possible markdown wrapping)
    let parsed;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in AI response");
    }

    // Build insight data
    const insight = {
      summary: parsed.summary || "",
      summaryEn: parsed.summaryEn || "",
      tldrTh: parsed.tldrTh || [],
      tldrEn: parsed.tldrEn || [],
      keyTopics: parsed.keyTopics || [],
      marketMood: parsed.marketMood || "neutral",
      sentiment: sentimentPercent,
      sentimentTotal: total,
      articleCount: articles.length,
      updatedAt: new Date().toISOString(),
    };

    // Write to file
    await fs.mkdir(path.dirname(INSIGHT_PATH), { recursive: true });
    await fs.writeFile(INSIGHT_PATH, JSON.stringify(insight, null, 2));

    activityBus.emit("translate_log", {
      message: `  ✓ Market insight updated: ${parsed.marketMood} mood, ${parsed.keyTopics?.length || 0} topics`,
      status: "ok",
    });

    activityBus.emit("insight_update");

    console.log("[Insight] Market insight generated successfully");
    return insight;
  } catch (err) {
    console.error("[Insight] Error:", err.message);
    activityBus.emit("translate_log", {
      message: `  ✗ Insight error: ${err.message}`,
      status: "error",
    });
    return null;
  }
}

export default { generateMarketInsight };
