'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import NewsCard from './NewsCard';
import MarketInsight from './MarketInsight';

function getBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:13002';
}

const tags = [
  { id: 'all', name: 'All' },
  { id: 'bitcoin', name: 'Bitcoin' },
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'defi', name: 'DeFi' },
  { id: 'nft', name: 'NFTs' },
  { id: 'altcoins', name: 'Altcoins' },
  { id: 'exchanges', name: 'Exchanges' },
  { id: 'regulation', name: 'Regulation' },
  { id: 'mining', name: 'Mining' },
];

const PAGE_SIZE = 20;

export default function NewsFeed({ news: initialNews }) {
  const [activeTag, setActiveTag] = useState('all');
  const [news, setNews] = useState(initialNews);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  // Fetch latest news from cache API
  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/api/cache?limit=500`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setNews(json.data);
        }
      }
    } catch (err) {
      // Silent fail — will retry
    }
  }, []);

  useEffect(() => {
    // Connect Socket.IO for real-time updates
    const socket = io(getBaseUrl(), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Real-time: server pushes news_update when cache.json changes
    socket.on('news_update', () => {
      fetchNews();
    });

    // Initial fetch from API (fresher than static build data)
    fetchNews();

    // Fallback polling every 30s in case socket disconnects
    const fallback = setInterval(() => {
      if (!socketRef.current?.connected) {
        fetchNews();
      }
    }, 30000);

    return () => {
      socket.disconnect();
      clearInterval(fallback);
    };
  }, [fetchNews]);

  const filtered = activeTag === 'all'
    ? news
    : news.filter(item =>
        item.categories?.includes(activeTag) || item.category === activeTag
      );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <>
      <MarketInsight />

      <div className="tag-filter">
        <div className="container">
          {tags.map((tag) => (
            <button
              key={tag.id}
              className={`tag-btn tag-${tag.id} ${activeTag === tag.id ? 'active' : ''}`}
              onClick={() => { setActiveTag(tag.id); setVisibleCount(PAGE_SIZE); }}
            >
              {tag.name}
            </button>
          ))}
          {connected && (
            <span className="live-indicator">LIVE</span>
          )}
        </div>
      </div>

      <main className="main-content">
        <div className="container">
          <div className="news-header">
            <h2>{activeTag === 'all' ? 'Latest Intelligence' : tags.find(t => t.id === activeTag)?.name}</h2>
            <span className="news-count">
              <strong>{filtered.length}</strong> signals detected
            </span>
          </div>

          <div className="news-grid">
            {visible.map((item, index) => (
              <NewsCard key={item.guid} item={item} index={index} />
            ))}
          </div>

          {hasMore && (
            <div className="load-more-container">
              <button
                className="load-more-btn"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              >
                LOAD MORE ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="empty-state">
              <p>No signals detected for this filter.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
