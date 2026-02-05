import 'dotenv/config';
import express from 'express';
import { connectDB, disconnectDB } from './db/connection.js';
import { startScheduler } from './scheduler.js';
import { generateSite } from './generator.js';
import { getNews } from './fetcher.js';
import config from '../config/default.js';

const app = express();
const PORT = config.server.port;

async function main() {
  console.log('=== Crypto News Aggregator ===');

  // Connect to MongoDB
  await connectDB();

  // Fetch news immediately on startup
  console.log('Fetching news on startup...');
  try {
    const { fetchAllSources } = await import('./fetcher.js');
    await fetchAllSources();
  } catch (err) {
    console.error('Startup fetch failed:', err.message);
  }

  // Start the scheduler (fetches every 1 minute by default)
  startScheduler();

  // Express middleware
  app.use(express.json());
  app.use(express.static('output'));

  // API endpoint to get news
  app.get('/api/news', async (req, res) => {
    try {
      const category = req.query.category || 'all';
      const limit = parseInt(req.query.limit) || 100;
      const news = await getNews(category, limit);
      res.json({
        success: true,
        count: news.length,
        data: news
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API endpoint to trigger manual refresh
  app.get('/api/refresh', async (req, res) => {
    try {
      const { fetchAllSources } = await import('./fetcher.js');
      await fetchAllSources();
      await generateSite();
      res.json({ success: true, message: 'News refreshed successfully' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API endpoint to regenerate static site
  app.get('/api/regenerate', async (req, res) => {
    try {
      await generateSite();
      res.json({ success: true, message: 'Site regenerated successfully' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Cron schedule: ${config.scheduler.cronSchedule}`);
  });

  // Initial site generation
  try {
    await generateSite();
    console.log('Initial site generation complete');
  } catch (err) {
    console.error('Initial generation failed:', err.message);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await disconnectDB();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
