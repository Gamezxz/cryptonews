import 'dotenv/config';
import express from 'express';
import { connectDB, disconnectDB } from './db/connection.js';
import { startScheduler } from './scheduler.js';
import { getNews } from './fetcher.js';
import { execSync } from 'child_process';
import config from '../config/default.js';

const app = express();
const PORT = config.server.port;

// Build static site function
async function buildStaticSite() {
  console.log('Building Next.js static site...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('Static site built successfully');
  } catch (err) {
    console.error('Build failed:', err.message);
  }
}

async function main() {
  console.log('=== Crypto News Aggregator ===');

  // Connect to MongoDB
  await connectDB();

  // Express middleware (setup FIRST before routes)
  app.use(express.json());
  app.use(express.static('output'));

  // API endpoints
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

  app.get('/api/refresh', async (req, res) => {
    try {
      const { fetchAllSources } = await import('./fetcher.js');
      await fetchAllSources();
      await buildStaticSite();
      res.json({ success: true, message: 'News refreshed and site rebuilt' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/rebuild', async (req, res) => {
    try {
      await buildStaticSite();
      res.json({ success: true, message: 'Site rebuilt successfully' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Start server IMMEDIATELY (before fetching news)
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`📰 API: /api/news, /api/refresh, /api/health`);
    console.log(`⏰ Cron: ${config.scheduler.cronSchedule}\n`);
  });

  // Fetch news in background after server starts
  console.log('Fetching news in background...');
  setImmediate(async () => {
    try {
      const { fetchAllSources } = await import('./fetcher.js');
      await fetchAllSources();
      await buildStaticSite();
    } catch (err) {
      console.error('Background fetch failed:', err.message);
    }
  });

  // Start the scheduler (fetches every 1 minute by default)
  startScheduler();

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
