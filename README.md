# Cryptonews.in.th — Crypto Intelligence Feed

Real-time cryptocurrency news aggregator: RSS feeds from 17+ sources → AI translation & summarization → bilingual (TH/EN) static site.

## Features

- **17+ RSS Sources**: CoinDesk, Cointelegraph, CryptoSlate, Decrypt, The Block, Glassnode, DL News, and more
- **AI Translation**: Auto-translate headlines & content to Thai (GLM-4.7 via Z.ai)
- **AI Summarization**: Full article scraping + AI-generated Thai summaries
- **AI Market Insight**: Sentiment analysis, TLDR bullet points, trending topics from latest 100 articles
- **Bilingual Display**: All content shown in Thai + English
- **SEO**: Auto-generated `sitemap.xml` (1000+ URLs) and `robots.txt`
- **Static Export**: Next.js 16 static site for fast loading
- **Real-time Updates**: Socket.IO for live news feed and market insight
- **Auto-categorization**: Bitcoin, Ethereum, DeFi, NFTs, Altcoins, Regulation, etc.
- **Dark Brutalist Theme**: Amber accent, JetBrains Mono, responsive design

## Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)
- PM2 (for production)

## Installation

```bash
git clone git@github.com:Gamezxz/cryptonews.git
cd cryptonews
npm install
```

Configure `.env`:
```bash
MONGODB_URI=mongodb://localhost:27017/cryptonews
PORT=13002
CRON_SCHEDULE=*/15 * * * *
```

## Usage

### Development
```bash
npm run dev          # Next.js dev server
```

### Production
```bash
npm start            # Express API + scheduler + processor
npm run build        # Build static site + generate sitemap
```

### PM2
```bash
npx pm2 start src/index.js --name cryptonews
npx pm2 save
```

## Architecture

```
config/sources.js        → RSS source list (17 active)
src/fetcher.js           → Fetch RSS + AI translate
src/scraper.js           → Scrape full articles + AI summarize
src/insight.js           → AI Market Insight (sentiment + TLDR)
src/scheduler.js         → Cron jobs
src/processor.js         → Continuous translate + scrape pipeline
src/index.js             → Express API server (port 13002)
src/db/models.js         → Mongoose NewsItem schema
app/page.js              → Homepage (static)
app/news/[slug]/page.js  → Article detail (SSG, 1000 pre-generated)
components/              → NewsFeed, NewsCard, ArticleDetail, MarketInsight, Header, Footer
scripts/generate-sitemap.mjs → Post-build sitemap generator
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/news` | News list (optional: `?category=bitcoin&limit=50`) |
| `GET /api/news/:id` | Single article by ID |
| `GET /api/news/by-slug/:slug` | Single article by slug |
| `GET /api/insight` | AI Market Insight data |
| `GET /api/cache` | Cached news (fast, top 500) |
| `GET /api/refresh` | Force RSS re-fetch |
| `GET /api/rebuild` | Trigger Next.js rebuild |
| `GET /api/health` | Health check |

## SEO

- **sitemap.xml**: Auto-generated at build time from MongoDB (all articles with slugs)
- **robots.txt**: Allows all crawlers, references sitemap at `https://cryptonews.in.th/sitemap.xml`
- Both generated as part of `npm run build`

## News Sources

CoinDesk, Cointelegraph, CryptoSlate, Decrypt, The Block, Glassnode Insights, The Defiant, Protos, DL News, BeInCrypto, NewsBTC, Bitcoinist, CryptoPotato, Blockchain.News, r/CryptoCurrency, r/Bitcoin, r/Ethereum

## Categories

All News, Bitcoin, Ethereum, DeFi, NFTs, Altcoins, Exchanges, Regulation, Mining, Reddit
