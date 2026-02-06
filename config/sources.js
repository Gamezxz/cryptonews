export const sources = [
  // Popular Crypto Media
  {
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "CryptoSlate",
    url: "https://cryptoslate.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Decrypt",
    url: "https://decrypt.co/feed",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Bitcoin Magazine",
    url: "https://bitcoinmagazine.com/.rss/full/",
    category: "general",
    priority: 1,
    enabled: false, // 403 Forbidden
  },
  {
    name: "BeInCrypto",
    url: "https://beincrypto.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Blockworks",
    url: "https://blockworks.co/feed",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Crypto Briefing",
    url: "https://cryptobriefing.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Bitcoin.com",
    url: "https://news.bitcoin.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "CryptoNews.com",
    url: "https://cryptonews.com/news/feed/",
    category: "general",
    priority: 1,
    enabled: false, // Cloudflare 403 - scraping blocked
  },
  {
    name: "AMBCrypto",
    url: "https://ambcrypto.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "CryptoPotato",
    url: "https://cryptopotato.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "WatcherGuru",
    url: "https://watcher.guru/news/feed",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "U.Today",
    url: "https://u.today/rss",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "CoinGape",
    url: "https://coingape.com/feed/",
    category: "general",
    priority: 1,
    enabled: false, // 403 Forbidden
  },
  {
    name: "DailyCoin",
    url: "https://dailycoin.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Coinpedia",
    url: "https://coinpedia.org/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Investing.com",
    url: "https://www.investing.com/rss/news.rss",
    category: "general",
    priority: 1,
    enabled: false, // Cloudflare 403 - scraping blocked, mostly non-crypto news
  },
  // Research / On-Chain Analytics
  {
    name: "The Block",
    url: "https://www.theblock.co/rss.xml",
    category: "research",
    priority: 1,
    enabled: true,
  },
  {
    name: "Glassnode Insights",
    url: "https://insights.glassnode.com/rss/",
    category: "research",
    priority: 1,
    enabled: true,
  },
  {
    name: "Chainalysis Blog",
    url: "https://blog.chainalysis.com/feed/",
    category: "research",
    priority: 2,
    enabled: true,
  },
  {
    name: "Pantera Capital",
    url: "https://panteracapital.com/feed/",
    category: "research",
    priority: 2,
    enabled: true,
  },
  // DeFi / NFT / Web3
  {
    name: "The Defiant",
    url: "https://thedefiant.io/feed",
    category: "defi",
    priority: 1,
    enabled: true,
  },
  {
    name: "NFT Evening",
    url: "https://nftevening.com/feed/",
    category: "nft",
    priority: 2,
    enabled: true,
  },
  // Investigative / Editorial
  {
    name: "Protos",
    url: "https://protos.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "DL News",
    url: "https://www.dlnews.com/arc/outboundfeeds/rss/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Unchained",
    url: "https://unchainedcrypto.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  // Additional Crypto News
  {
    name: "Bitcoinist",
    url: "https://bitcoinist.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "Crypto.news",
    url: "https://crypto.news/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "ZyCrypto",
    url: "https://zycrypto.com/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "CoinJournal",
    url: "https://coinjournal.net/feed/",
    category: "general",
    priority: 1,
    enabled: true,
  },
  {
    name: "The Cryptonomist",
    url: "https://en.cryptonomist.ch/feed/",
    category: "general",
    priority: 2,
    enabled: true,
  },
  // Ecosystem
  {
    name: "Ethereum Blog",
    url: "https://blog.ethereum.org/en/feed.xml",
    category: "ecosystem",
    priority: 2,
    enabled: true,
  },
  // Exchange Blogs
  {
    name: "Binance Blog",
    url: "https://www.binance.com/en/blog/rss",
    category: "exchanges",
    priority: 2,
    enabled: false, // XML parse error
  },
  {
    name: "Coinbase Blog",
    url: "https://blog.coinbase.com/rss",
    category: "exchanges",
    priority: 2,
    enabled: false, // XML attribute error
  },
  {
    name: "Kraken Blog",
    url: "https://blog.kraken.com/feed/",
    category: "exchanges",
    priority: 2,
    enabled: true,
  },
];

export default { sources };
