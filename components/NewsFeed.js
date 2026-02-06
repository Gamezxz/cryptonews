'use client';

import { useState, useEffect } from 'react';
import NewsCard from './NewsCard';

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

export default function NewsFeed({ news: initialNews }) {
  const [activeTag, setActiveTag] = useState('all');
  const [news, setNews] = useState(initialNews);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch('http://localhost:13002/api/news?limit=200');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setNews(json.data);
            setLastUpdate(new Date());
          }
        }
      } catch (err) {
        console.error('Failed to fetch news:', err);
      }
    };

    const interval = setInterval(fetchNews, 60000); // 60 seconds
    return () => clearInterval(interval);
  }, []);

  const filtered = activeTag === 'all'
    ? news
    : news.filter(item =>
        item.categories?.includes(activeTag) || item.category === activeTag
      );

  return (
    <>
      <div className="tag-filter">
        <div className="container">
          {tags.map((tag) => (
            <button
              key={tag.id}
              className={`tag-btn tag-${tag.id} ${activeTag === tag.id ? 'active' : ''}`}
              onClick={() => setActiveTag(tag.id)}
            >
              {tag.name}
            </button>
          ))}
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
            {filtered.map((item, index) => (
              <NewsCard key={item.guid} item={item} index={index} />
            ))}
          </div>

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
