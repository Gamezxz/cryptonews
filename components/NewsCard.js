"use client";

import { useState } from "react";
import Link from "next/link";

function getImageUrl(item) {
  if (item.enclosure) return item.enclosure;
  if (item.content) {
    const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) return imgMatch[1];
  }
  if (item["media:content"]) {
    const url = item["media:content"].$?.url || item["media:content"];
    if (url) return url;
  }
  return null;
}

function getGradient(category) {
  const gradients = {
    bitcoin: "from-orange-500 to-yellow-500",
    ethereum: "from-purple-500 to-blue-500",
    defi: "from-green-500 to-emerald-500",
    nft: "from-pink-500 to-rose-500",
    altcoins: "from-blue-500 to-cyan-500",
    exchanges: "from-indigo-500 to-violet-500",
    regulation: "from-slate-500 to-gray-600",
    mining: "from-amber-600 to-yellow-600",
    general: "from-teal-500 to-cyan-500",
  };
  return gradients[category] || gradients.general;
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function NewsCard({ item, index }) {
  const imageUrl = getImageUrl(item);
  const gradient = getGradient(item.category);
  const [imageError, setImageError] = useState(false);
  const tags =
    item.categories && item.categories.length > 0
      ? item.categories
      : [item.category];

  // Check if both languages are available
  const hasBothLanguages = item.translatedContent && item.content;
  const hasContent = item.translatedContent || item.content;

  return (
    <article
      className="news-card"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
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
        <div
          className={`news-placeholder bg-gradient-to-br ${gradient}`}
          style={{ display: !imageUrl || imageError ? "flex" : "none" }}
        >
          <span className="placeholder-icon">
            {item.category === "bitcoin"
              ? "₿"
              : item.category === "ethereum"
                ? "Ξ"
                : item.category === "defi"
                  ? "$"
                  : item.category === "mining"
                    ? "#"
                    : "//"}
          </span>
        </div>
      </div>

      <div className="news-content">
        <div className="news-source">
          <span className="source-badge">{item.source}</span>
          {item.translatedContent && (
            <span className="translate-badge">TH</span>
          )}
          {item.sentiment && (
            <span className={`sentiment-badge sentiment-${item.sentiment}`}>
              {item.sentiment === "bullish"
                ? "↑ Bullish"
                : item.sentiment === "bearish"
                  ? "↓ Bearish"
                  : "— Neutral"}
            </span>
          )}
        </div>
        <h3 className="news-title">
          <Link href={`/news/${item.slug || item._id}/`}>
            {item.translatedTitle || item.title}
          </Link>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="external-link-icon"
            title="Open original"
          >
            ↗
          </a>
        </h3>
        {item.translatedTitle && (
          <p className="news-original-title">{item.title}</p>
        )}

        {hasContent && (
          <div className="news-full-content show">
            {hasBothLanguages ? (
              <>
                <div className="bilingual-section">
                  <span className="lang-label lang-th">TH</span>
                  <p>{item.translatedContent}</p>
                </div>
                <div className="lang-divider"></div>
                <div className="bilingual-section">
                  <span className="lang-label lang-en">EN</span>
                  <p>{item.content}</p>
                </div>
              </>
            ) : (
              <p>{item.translatedContent || item.content}</p>
            )}
          </div>
        )}

        <div className="news-meta">
          <time dateTime={item.pubDate}>{timeAgo(item.pubDate)}</time>
          <div className="news-tags">
            {tags.map((tag) => (
              <span key={tag} className={`category-badge tag-${tag}`}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
