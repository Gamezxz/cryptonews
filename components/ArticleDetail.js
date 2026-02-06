"use client";

import { useState } from "react";
import Link from "next/link";

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

function readingTime(wordCount) {
  const minutes = Math.ceil(wordCount / 200);
  return minutes < 1 ? "1 min read" : `${minutes} min read`;
}

function getImageUrl(item) {
  if (item.enclosure) return item.enclosure;
  if (item.content) {
    const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) return imgMatch[1];
  }
  return null;
}

export default function ArticleDetail({ article, relatedArticles }) {
  const [imageError, setImageError] = useState(false);
  const [articleData, setArticleData] = useState(article);

  const imageUrl = getImageUrl(articleData);
  const tags =
    articleData.categories?.length > 0
      ? articleData.categories
      : [articleData.category];

  const hasSummary = articleData.aiSummary || articleData.aiSummaryThai;
  const hasFullContent =
    articleData.fullContent && articleData.fullContent.length > 100;

  return (
    <div className="article-detail">
      {/* Back Navigation */}
      <nav className="article-nav">
        <Link href="/" className="back-link">
          <span className="back-arrow">&larr;</span> Back to Feed
        </Link>
      </nav>

      {/* Hero Image */}
      {imageUrl && !imageError && (
        <div className="article-hero">
          <img
            src={imageUrl}
            alt={articleData.title}
            onError={() => setImageError(true)}
          />
        </div>
      )}

      {/* Header */}
      <header className="article-header">
        <div className="article-badges">
          <span className="source-badge">{articleData.source}</span>
          {articleData.sentiment && (
            <span
              className={`sentiment-badge sentiment-${articleData.sentiment}`}
            >
              {articleData.sentiment === "bullish"
                ? "↑ Bullish"
                : articleData.sentiment === "bearish"
                  ? "↓ Bearish"
                  : "— Neutral"}
            </span>
          )}
          {articleData.wordCount > 0 && (
            <span className="reading-time-badge">
              {readingTime(articleData.wordCount)}
            </span>
          )}
        </div>

        <h1 className="article-title-main">
          {articleData.translatedTitle || articleData.title}
        </h1>
        {articleData.translatedTitle && (
          <p className="article-title-original">{articleData.title}</p>
        )}

        <div className="article-meta-row">
          <time dateTime={articleData.pubDate}>
            {timeAgo(articleData.pubDate)}
          </time>
          <span className="meta-separator">//</span>
          <span>{articleData.author || articleData.source}</span>
          <div className="article-tags">
            {tags.map((tag) => (
              <span key={tag} className={`category-badge tag-${tag}`}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* AI Summary Box */}
      {hasSummary ? (
        <section className="summary-box">
          <div className="summary-header">
            <span className="summary-icon">AI</span>
            <h2>Summary</h2>
          </div>
          {articleData.aiSummaryThai && (
            <div className="summary-section">
              <span className="lang-label lang-th">TH</span>
              <p>{articleData.aiSummaryThai}</p>
            </div>
          )}
          {articleData.aiSummary && articleData.aiSummaryThai && (
            <div className="lang-divider"></div>
          )}
          {articleData.aiSummary && (
            <div className="summary-section">
              <span className="lang-label lang-en">EN</span>
              <p>{articleData.aiSummary}</p>
            </div>
          )}
          {articleData.keyPoints?.length > 0 && (
            <div className="key-points">
              <h3>Key Points</h3>
              <ul>
                {articleData.keyPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <section className="summary-box summary-box-empty">
          <div className="summary-header">
            <span className="summary-icon">AI</span>
            <h2>Summary</h2>
          </div>
          <p className="summary-pending">
            AI is processing this article. Summary will be available soon.
          </p>
        </section>
      )}

      {/* Full Content */}
      <section className="article-body">
        <h2 className="section-label">Article</h2>
        {hasFullContent ? (
          <div className="article-full-text">
            {articleData.fullContent
              .split("\n")
              .filter((p) => p.trim())
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </div>
        ) : (
          <div className="article-full-text">
            {articleData.translatedContent && (
              <div className="bilingual-section">
                <span className="lang-label lang-th">TH</span>
                <p>{articleData.translatedContent}</p>
              </div>
            )}
            {articleData.translatedContent && articleData.content && (
              <div className="lang-divider"></div>
            )}
            {articleData.content && (
              <div className="bilingual-section">
                <span className="lang-label lang-en">EN</span>
                <p>{articleData.content}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Source Link */}
      <div className="article-source-link">
        <a href={articleData.link} target="_blank" rel="noopener noreferrer">
          Read original at {articleData.source} &rarr;
        </a>
      </div>

      {/* Related Articles */}
      {relatedArticles?.length > 0 && (
        <section className="related-articles">
          <h2 className="section-label">Related</h2>
          <div className="related-grid">
            {relatedArticles.map((rel) => (
              <Link
                href={`/news/${rel.slug || rel._id}/`}
                key={rel._id}
                className="related-card"
              >
                <span className="related-source">{rel.source}</span>
                <h3>{rel.translatedTitle || rel.title}</h3>
                <time>{timeAgo(rel.pubDate)}</time>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
