'use client';

import { useState } from 'react';
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

export default function NewsFeed({ news, lastUpdated }) {
  const [activeTag, setActiveTag] = useState('all');

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
            <h2>{activeTag === 'all' ? 'Latest News' : tags.find(t => t.id === activeTag)?.name}</h2>
            <span className="last-updated">
              {filtered.length} articles
            </span>
          </div>

          <div className="news-grid">
            {filtered.map((item, index) => (
              <NewsCard key={item.guid} item={item} index={index} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="empty-state">
              <p>No news found for this tag.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
