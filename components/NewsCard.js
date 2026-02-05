'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

// Get image URL from item (enclosure or extract from content)
function getImageUrl(item) {
  // Check enclosure first
  if (item.enclosure) {
    return item.enclosure;
  }

  // Try to extract image from content
  if (item.content) {
    const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }
  }

  // Try to extract from media:content
  if (item['media:content']) {
    const url = item['media:content'].$?.url || item['media:content'];
    if (url) return url;
  }

  return null;
}

// Generate gradient placeholder based on category
function getGradient(category) {
  const gradients = {
    bitcoin: 'from-orange-500 to-yellow-500',
    ethereum: 'from-purple-500 to-blue-500',
    defi: 'from-green-500 to-emerald-500',
    nft: 'from-pink-500 to-rose-500',
    altcoins: 'from-blue-500 to-cyan-500',
    exchanges: 'from-indigo-500 to-violet-500',
    reddit: 'from-orange-600 to-red-500',
    regulation: 'from-slate-500 to-gray-600',
    mining: 'from-amber-600 to-yellow-600',
    general: 'from-teal-500 to-cyan-500'
  };
  return gradients[category] || gradients.general;
}

export default function NewsCard({ item, index }) {
  const imageUrl = getImageUrl(item);
  const gradient = getGradient(item.category);
  const [imageError, setImageError] = useState(false);

  const getCategoryIcon = (category) => {
    const icons = {
      bitcoin: '₿',
      ethereum: 'Ξ',
      defi: '💰',
      nft: '🖼️',
      altcoins: '🪙',
      exchanges: '🔄',
      reddit: '💬',
      regulation: '⚖️',
      mining: '⛏️',
      general: '📰'
    };
    return icons[category] || icons.general;
  };

  return (
    <article className="news-card" style={{ animationDelay: `${index * 0.02}s` }}>
      {/* Image */}
      <div className="news-image">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={item.title}
            className="news-img"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : null}
        <div className={`news-placeholder bg-gradient-to-br ${gradient}`} style={{ display: (!imageUrl || imageError) ? 'flex' : 'none' }}>
          <span className="placeholder-icon">
            {getCategoryIcon(item.category)}
          </span>
        </div>
      </div>

      <div className="news-content">
        <div className="news-source">
          <span className="source-badge">{item.source}</span>
          <span className="category-badge">{item.category}</span>
        </div>
        <h3 className="news-title">
          <a href={item.link} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        </h3>
        <p className="news-excerpt">{item.content?.substring(0, 120) || ''}...</p>
        <div className="news-meta">
          <time dateTime={item.pubDate}>
            {new Date(item.pubDate).toLocaleDateString()}
          </time>
        </div>
      </div>
    </article>
  );
}
