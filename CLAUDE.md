# CryptoNews Aggregator

## Project Overview
Crypto news aggregator that fetches RSS feeds from 20+ sources, stores in MongoDB, generates AI summaries/translations (Thai) via GLM-4.5, and serves a static Next.js dashboard.

## Tech Stack
- **Frontend**: Next.js 16 (App Router, static export), React 19, Tailwind CSS 4
- **Backend**: Node.js (ESM), Express 5, MongoDB/Mongoose 8
- **AI**: GLM-4.5 via Z.ai API (summaries + Thai translation)
- **Data**: RSS feeds via rss-parser, og:image scraping fallback

## Project Structure
```
app/              # Next.js App Router (page.js, layout.js, globals.css)
components/       # React components (Header, NewsFeed, NewsCard, Footer)
config/           # sources.js (RSS feeds), default.js (MongoDB, scheduler)
src/              # Backend
  ├── fetcher.js  # RSS fetcher + AI summarize/translate
  ├── scheduler.js
  ├── index.js    # Express server entry
  ├── db/         # connection.js, models.js (Mongoose)
  └── utils/      # cache.js (JSON cache)
scripts/          # Utility scripts (check-images, clean-reddit, etc.)
```

## Key Commands
- `npm run dev` - Next.js dev server
- `npm run build` - Build static site (output to `output/` dir)
- `npm run start` - Start backend (fetcher + Express on port 13002)
- `npm run fetch` - Run RSS fetcher once
- `node src/fetcher.js backfill [limit]` - Backfill AI summaries
- `node src/fetcher.js translate [limit]` - Backfill Thai translations

## Build Config
- Static export: `output: 'export'` in next.config.js
- Output directory: `output/` (not default `.next/`)
- Images: unoptimized (static export)
- Trailing slash enabled

## Important Notes
- MongoDB URI: env `MONGODB_URI` or `mongodb://localhost:27017/cryptonews`
- AI API key is hardcoded in `src/fetcher.js` (Z.ai)
- Scheduler runs every 1 minute (configurable via `CRON_SCHEDULE`)
- News categories: bitcoin, ethereum, defi, nft, altcoins, exchanges, regulation, mining, general
- `.gitignore` excludes: node_modules, .env, data/, output/, logs/
- Remote: `git@github.com:Gamezxz/cryptonews.git` (branch: main)

## Coding Style
- ESM modules (`import`/`export`, `"type": "module"`)
- React: functional components with hooks, `'use client'` directive
- CSS: Tailwind utility classes + custom CSS in globals.css
- Respond in Thai language for user communication
