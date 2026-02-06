'use client';

import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

function getBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:13002';
}

export default function MarketInsight() {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInsight = useCallback(async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/api/insight`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setInsight(json.data);
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsight();

    const socket = io(getBaseUrl(), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('insight_update', () => {
      fetchInsight();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchInsight]);

  if (loading || !insight) return null;

  const { sentiment, summary, summaryEn, tldrTh, tldrEn, keyTopics, marketMood, updatedAt } = insight;

  const moodConfig = {
    bullish: { label: 'BULLISH', color: 'var(--green)', icon: '▲' },
    bearish: { label: 'BEARISH', color: 'var(--red)', icon: '▼' },
    neutral: { label: 'NEUTRAL', color: 'var(--text-muted)', icon: '◆' },
  };

  const mood = moodConfig[marketMood] || moodConfig.neutral;

  const timeAgo = updatedAt ? getTimeAgo(new Date(updatedAt)) : '';

  return (
    <div className="market-insight">
      <div className="container">
        <div className="insight-header">
          <div className="insight-title">
            <span className="insight-icon">AI</span>
            <span>MARKET INSIGHT</span>
          </div>
          <div className="insight-mood" style={{ color: mood.color }}>
            <span className="mood-icon">{mood.icon}</span>
            <span>{mood.label}</span>
          </div>
        </div>

        {/* Sentiment Bar */}
        <div className="sentiment-bar-container">
          <div className="sentiment-bar">
            {sentiment.bullish > 0 && (
              <div
                className="sentiment-segment bullish"
                style={{ width: `${sentiment.bullish}%` }}
              >
                {sentiment.bullish >= 10 && `${sentiment.bullish}%`}
              </div>
            )}
            {sentiment.neutral > 0 && (
              <div
                className="sentiment-segment neutral"
                style={{ width: `${sentiment.neutral}%` }}
              >
                {sentiment.neutral >= 10 && `${sentiment.neutral}%`}
              </div>
            )}
            {sentiment.bearish > 0 && (
              <div
                className="sentiment-segment bearish"
                style={{ width: `${sentiment.bearish}%` }}
              >
                {sentiment.bearish >= 10 && `${sentiment.bearish}%`}
              </div>
            )}
          </div>
          <div className="sentiment-labels">
            <span className="sentiment-label bullish">BULLISH {sentiment.bullish}%</span>
            <span className="sentiment-label neutral">NEUTRAL {sentiment.neutral}%</span>
            <span className="sentiment-label bearish">BEARISH {sentiment.bearish}%</span>
          </div>
        </div>

        {/* AI Summary */}
        <div className="insight-summary">
          <div className="bilingual-section">
            <span className="lang-label lang-th">TH</span>
            <p>{summary}</p>
          </div>
          <div className="lang-divider"></div>
          <div className="bilingual-section">
            <span className="lang-label lang-en">EN</span>
            <p className="insight-summary-en">{summaryEn}</p>
          </div>
        </div>

        {/* TLDR Bullet Points */}
        {tldrTh && tldrTh.length > 0 && (
          <div className="insight-tldr">
            <div className="tldr-header">
              <span className="tldr-label">TLDR</span>
            </div>
            <div className="bilingual-section">
              <span className="lang-label lang-th">TH</span>
              <ul className="tldr-list">
                {tldrTh.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
            <div className="lang-divider"></div>
            <div className="bilingual-section">
              <span className="lang-label lang-en">EN</span>
              <ul className="tldr-list tldr-list-en">
                {(tldrEn || []).map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Key Topics */}
        {keyTopics && keyTopics.length > 0 && (
          <div className="insight-topics">
            <span className="topics-label">TRENDING:</span>
            {keyTopics.map((topic, i) => (
              <span key={i} className="topic-chip">{topic}</span>
            ))}
          </div>
        )}

        <div className="insight-footer">
          <span className="insight-updated">Updated {timeAgo}</span>
          <span className="insight-based">Based on {insight.sentimentTotal || 0} articles</span>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
