# Crypto News Aggregator

Node.js-based cryptocurrency news aggregator that fetches RSS feeds from multiple sources, stores in MongoDB, and generates static HTML pages.

## Features

- Fetches news from 10+ crypto sources (CoinDesk, Cointelegraph, Reddit, etc.)
- Auto-categorizes by topic (Bitcoin, DeFi, NFTs, Altcoins, etc.)
- MongoDB storage with JSON cache backup
- Static HTML generation for fast loading
- Cron job auto-refresh (default: every 1 minute)
- Clean modern responsive design with dark mode support

## Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)

## Installation

1. Clone and navigate to the project:
```bash
cd /Users/game/Project/new_cryptonews
```

2. Install dependencies:
```bash
npm install
```

3. Ensure MongoDB is running:
```bash
# Check if MongoDB is running
brew services list | grep mongodb-community
# Start if not running
brew services start mongodb-community
```

## Usage

### Start the application
```bash
npm start
```
This will:
- Connect to MongoDB
- Start the cron scheduler (fetches every 1 minute)
- Generate static HTML files
- Start the preview server on http://localhost:13002

### Individual commands
```bash
npm run fetch      # One-time RSS fetch + save to MongoDB
npm run generate   # Generate static site from MongoDB
npm run cache      # Rebuild JSON cache from MongoDB
```

## API Endpoints

- `GET /` - Static HTML site
- `GET /api/news` - Get news JSON (optional: ?category=bitcoin&limit=50)
- `GET /api/refresh` - Trigger manual RSS refresh
- `GET /api/regenerate` - Regenerate static site
- `GET /api/health` - Health check

## Configuration

Edit `.env`:
```bash
MONGODB_URI=mongodb://localhost:27017/cryptonews
PORT=13002
CRON_SCHEDULE=* * * * *  # Every 1 minute
```

## Project Structure

```
new_cryptonews/
├── config/          # RSS sources and configuration
├── src/
│   ├── db/         # MongoDB connection and models
│   ├── utils/      # JSON cache utilities
│   ├── fetcher.js  # RSS fetching and categorization
│   ├── generator.js # Static HTML generation
│   ├── scheduler.js # Cron job automation
│   └── index.js    # Main entry point
├── templates/      # HTML/CSS/JS templates
├── data/          # JSON cache (gitignored)
└── output/        # Generated static site (gitignored)
```

## News Sources

- CoinDesk, Cointelegraph, CryptoSlate, Decrypt, The Block
- Binance Blog, Coinbase Blog, Kraken Blog
- r/CryptoCurrency, r/Bitcoin

## Categories

All News, Bitcoin, Ethereum, DeFi, NFTs, Altcoins, Exchanges, Reddit, Regulation, Mining
