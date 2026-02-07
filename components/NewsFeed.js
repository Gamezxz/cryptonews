"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import NewsCard from "./NewsCard";
import MarketInsight from "./MarketInsight";
import CryptoPriceTicker from "./CryptoPriceTicker";
import FearGreedIndex from "./FearGreedIndex";

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:13002";
}

const PAGE_SIZE = 20;

export default function NewsFeed({ news: initialNews }) {
  const [searchQuery, setSearchQuery] = useState("");
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
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // Real-time: server pushes news_update when cache.json changes
    socket.on("news_update", () => {
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

  const filtered = searchQuery.trim()
    ? news.filter((item) => {
        const q = searchQuery.toLowerCase();
        return (
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.translatedTitle &&
            item.translatedTitle.toLowerCase().includes(q)) ||
          (item.category && item.category.toLowerCase().includes(q)) ||
          (item.categories &&
            item.categories.some((c) => c.toLowerCase().includes(q)))
        );
      })
    : news;

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <>
      <div
        className="container"
        style={{ marginTop: "20px", marginBottom: "20px" }}
      >
        <div className="widgets-row">
          <FearGreedIndex />
          <CryptoPriceTicker />
        </div>
      </div>

      <MarketInsight />

      <div className="search-bar">
        <div className="container">
          <div className="search-wrapper">
            <span className="search-icon">&#x2315;</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search news... (e.g. Bitcoin, DeFi, Ethereum)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => {
                  setSearchQuery("");
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                &times;
              </button>
            )}
          </div>
          {connected && <span className="live-indicator">LIVE</span>}
        </div>
      </div>

      <main className="main-content">
        <div className="container">
          <div className="news-header">
            <h2>
              {searchQuery.trim()
                ? `Results: "${searchQuery}"`
                : "Latest Intelligence"}
            </h2>
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
