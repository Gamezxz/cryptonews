import mongoose from "mongoose";

const newsItemSchema = new mongoose.Schema(
  {
    guid: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
    },
    title: {
      type: String,
      required: true,
    },
    link: {
      type: String,
      required: true,
    },
    pubDate: {
      type: Date,
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: "",
    },
    author: {
      type: String,
      default: "",
    },
    enclosure: {
      type: String,
      default: null,
    },
    source: {
      type: String,
      required: true,
      index: true,
    },
    sourceCategory: {
      type: String,
      default: "general",
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    categories: {
      type: [String],
      default: [],
    },
    summary: {
      type: String,
      default: "",
    },
    translatedTitle: {
      type: String,
      default: "",
    },
    translatedContent: {
      type: String,
      default: "",
    },
    sentiment: {
      type: String,
      enum: ["bullish", "bearish", "neutral", ""],
      default: "",
    },
    fullContent: {
      type: String,
      default: "",
    },
    aiSummary: {
      type: String,
      default: "",
    },
    aiSummaryThai: {
      type: String,
      default: "",
    },
    keyPoints: {
      type: [String],
      default: [],
    },
    translateRetries: {
      type: Number,
      default: 0,
    },
    scrapingStatus: {
      type: String,
      enum: ["pending", "scraped", "failed", ""],
      default: "",
    },
    wordCount: {
      type: Number,
      default: 0,
    },
    embedding: {
      type: [Number],
      default: [],
    },
    fetchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient queries
newsItemSchema.index({ category: 1, pubDate: -1 });
newsItemSchema.index({ categories: 1, pubDate: -1 });
newsItemSchema.index({ source: 1, pubDate: -1 });
newsItemSchema.index({ scrapingStatus: 1, pubDate: -1 });

// Upsert by guid
newsItemSchema.index({ guid: 1 }, { unique: true });
newsItemSchema.index({ slug: 1 }, { unique: true, sparse: true });

export const NewsItem = mongoose.model("NewsItem", newsItemSchema);

export default { NewsItem };
