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

  // Fetch news immediately on startup
  console.log('Fetching news on startup...');
  try {
    const { fetchAllSources } = await import('./fetcher.js');
    await fetchAllSources();
  } catch (err) {
    console.error('Startup fetch failed:', err.message);
  }

  // Build static site
  await buildStaticSite();

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

  // API endpoint to trigger manual refresh and rebuild
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

  // API endpoint to rebuild static site
  app.get('/api/rebuild', async (req, res) => {
    try {
      await buildStaticSite();
      res.json({ success: true, message: 'Site rebuilt successfully' });
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
