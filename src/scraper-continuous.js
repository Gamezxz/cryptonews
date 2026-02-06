import { continuousScrape } from './scraper.js';

continuousScrape().catch((err) => {
  console.error('Continuous scrape failed:', err);
  process.exit(1);
});
