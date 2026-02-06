# Cryptonews Aggregator — Claude Code Instructions

## Project Overview

Crypto news aggregator: RSS feeds → MongoDB → AI translation/summary → Next.js static site.

- **Stack**: Next.js 16 (static export), Express API, MongoDB/Mongoose, PM2
- **Node**: >=18 (ESM modules)
- **Branch**: `feature/bilingual-display`
- **Remote**: `git@github.com:Gamezxz/cryptonews.git`

## Architecture

```
config/sources.js      → RSS source list (17 active)
src/fetcher.js         → Fetch RSS + AI translate (GLM-4.5)
src/scraper.js         → Scrape full articles + AI summarize
src/scheduler.js       → Cron jobs (fetch RSS every 5 min)
src/processor.js       → Continuous translate + scrape (one by one)
src/insight.js         → AI Market Insight generation (sentiment + TLDR)
src/index.js           → Express API server (port 13002)
src/db/models.js       → Mongoose NewsItem schema
app/page.js            → Homepage (server component, static)
app/news/[slug]/page.js → Article detail page (SSG, 1000 pre-generated)
components/            → NewsFeed, NewsCard, ArticleDetail, MarketInsight, Header, Footer
scripts/generate-sitemap.mjs → Post-build sitemap.xml generator
public/robots.txt      → SEO robots file
```

## PM2 Processes

| Name | Script | Purpose |
|------|--------|---------|
| `cryptonews` | `src/index.js` | Express API + scheduler + processor |

## Post-Task Checklist

**IMPORTANT: After every task is complete, always run these steps in order:**

```bash
# 1. Build static site
npm run build

# 2. Commit changes
git add -A && git commit -m "<type>: <concise description>"

# 3. Push to remote
git push
```

### Commit Types
- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructure (no behavior change)
- `chore:` — config, deps, tooling

### If PM2 processes were affected:
```bash
npx pm2 restart cryptonews --update-env
npx pm2 save
```

## SEO

- **Sitemap**: Auto-generated at build time via `scripts/generate-sitemap.mjs`
  - Runs as part of `npm run build` (post-build step)
  - Queries MongoDB for all articles with slugs
  - Output: `output/sitemap.xml`
- **robots.txt**: Static file in `public/robots.txt`, points to `https://cryptonews.in.th/sitemap.xml`

## Market Insight (`src/insight.js`)

- AI-generated market summary from latest 20 translated articles
- Sentiment analysis from last 100 articles (bullish/bearish/neutral %)
- Output: `data/insight.json` → served via `/api/insight`
- Fields: `summary` (TH), `summaryEn` (EN), `tldrTh` (bullet points TH), `tldrEn` (bullet points EN), `keyTopics`, `marketMood`, `sentiment`
- Component: `components/MarketInsight.js` (client-side, Socket.IO real-time updates)

## Key Conventions

- **Cron schedule**: `*/15 * * * *` (set in `.env` as `CRON_SCHEDULE`)
- **Static export**: `output: 'export'` — dynamic routes need `generateStaticParams()`
- **AI API**: GLM-4.7 via Z.ai (key in `src/fetcher.js`, `src/scraper.js`, `src/insight.js`)
- **Bilingual**: All content displayed in TH + EN
- **CSS**: Dark brutalist theme, amber accent (`#f59e0b`), monospace (JetBrains Mono)
- **Disabled sources**: Bitcoin Magazine, CoinGape, CryptoNews.com, Investing.com (Cloudflare 403), Binance Blog, Coinbase Blog (XML errors)
