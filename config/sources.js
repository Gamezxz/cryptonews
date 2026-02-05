export const sources = [
  // Popular Crypto Media
  {
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: 'general',
    priority: 1,
    enabled: true
  },
  {
    name: 'Cointelegraph',
    url: 'https://cointelegraph.com/rss',
    category: 'general',
    priority: 1,
    enabled: true
  },
  {
    name: 'CryptoSlate',
    url: 'https://cryptoslate.com/feed/',
    category: 'general',
    priority: 1,
    enabled: true
  },
  {
    name: 'Decrypt',
    url: 'https://decrypt.co/feed',
    category: 'general',
    priority: 1,
    enabled: true
  },
  // Exchange Blogs
  {
    name: 'Binance Blog',
    url: 'https://www.binance.com/en/blog/rss',
    category: 'exchanges',
    priority: 2,
    enabled: true
  },
  {
    name: 'Coinbase Blog',
    url: 'https://blog.coinbase.com/rss',
    category: 'exchanges',
    priority: 2,
    enabled: true
  },
  {
    name: 'Kraken Blog',
    url: 'https://blog.kraken.com/feed/',
    category: 'exchanges',
    priority: 2,
    enabled: true
  }
];

export const categories = [
  { id: 'all', name: 'All News', icon: '📰' },
  { id: 'bitcoin', name: 'Bitcoin', icon: '₿' },
  { id: 'ethereum', name: 'Ethereum', icon: 'Ξ' },
  { id: 'defi', name: 'DeFi', icon: '💰' },
  { id: 'nft', name: 'NFTs', icon: '🖼️' },
  { id: 'altcoins', name: 'Altcoins', icon: '🪙' },
  { id: 'exchanges', name: 'Exchanges', icon: '🔄' },
  { id: 'regulation', name: 'Regulation', icon: '⚖️' },
  { id: 'mining', name: 'Mining', icon: '⛏️' }
];

export default { sources, categories };
