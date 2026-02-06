import mongoose from 'mongoose';

const newsItemSchema = new mongoose.Schema({
  guid: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  link: {
    type: String,
    required: true
  },
  pubDate: {
    type: Date,
    required: true,
    index: true
  },
  content: {
    type: String,
    default: ''
  },
  author: {
    type: String,
    default: ''
  },
  enclosure: {
    type: String,
    default: null
  },
  source: {
    type: String,
    required: true,
    index: true
  },
  sourceCategory: {
    type: String,
    default: 'general'
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  categories: {
    type: [String],
    default: []
  },
  summary: {
    type: String,
    default: ''
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
newsItemSchema.index({ category: 1, pubDate: -1 });
newsItemSchema.index({ categories: 1, pubDate: -1 });
newsItemSchema.index({ source: 1, pubDate: -1 });

// Upsert by guid
newsItemSchema.index({ guid: 1 }, { unique: true });

export const NewsItem = mongoose.model('NewsItem', newsItemSchema);

export default { NewsItem };
