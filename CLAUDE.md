# Cryptonews Aggregator — Claude Code Instructions

## Project Overview

Crypto news aggregator: RSS feeds → MongoDB → AI translation/summary → Next.js static site.

- **Stack**: Next.js 16 (static export), Express API, MongoDB/Mongoose, PM2
- **Node**: >=18 (ESM modules)
- **Branch**: `feature/bilingual-display`
- **Remote**: `git@github.com:Gamezxz/cryptonews.git`

## Architecture

```
config/sources.js    → RSS source list (17 active)
src/fetcher.js       → Fetch RSS + AI translate (GLM-4.5)
src/scraper.js       → Scrape full articles + AI summarize
src/scheduler.js     → Cron jobs (fetch/translate/scrape every 15 min)
src/index.js         → Express API server (port 13002)
src/db/models.js     → Mongoose NewsItem schema
app/page.js          → Homepage (server component, static)
app/news/[id]/page.js → Article detail page (SSG, 200 pre-generated)
components/          → NewsFeed, NewsCard, ArticleDetail, Header, Footer
```

## PM2 Processes

| Name | Script | Purpose |
|------|--------|---------|
| `cryptonews` | `src/index.js` | Express API + scheduler |
| `cryptonews-scraper` | `src/scraper-continuous.js` | Continuous article scraping (1/min) |

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

## Key Conventions

- **Cron schedule**: `*/15 * * * *` (set in `.env` as `CRON_SCHEDULE`)
- **Static export**: `output: 'export'` — dynamic routes need `generateStaticParams()`
- **AI API**: GLM-4.5 via Z.ai (key in `src/fetcher.js` and `src/scraper.js`)
- **Bilingual**: All content displayed in TH + EN
- **CSS**: Dark brutalist theme, amber accent (`#f59e0b`), monospace (JetBrains Mono)
- **Disabled sources**: Bitcoin Magazine, CoinGape (403), Binance Blog, Coinbase Blog (XML errors)
