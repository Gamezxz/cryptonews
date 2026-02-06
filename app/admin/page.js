"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:13002";

function formatTime(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatTimeAgo(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

// Activity type icons and colors
const activityConfig = {
  fetch: { icon: "RSS", color: "#3b82f6" },
  translate: { icon: "TH", color: "#f59e0b" },
  scrape: { icon: "AI", color: "#a855f7" },
  rebuild: { icon: "BLD", color: "#22c55e" },
  admin: { icon: "ADM", color: "#ec4899" },
  error: { icon: "ERR", color: "#ef4444" },
};

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [actionLoading, setActionLoading] = useState("");
  const [translateLogs, setTranslateLogs] = useState([]);
  const socketRef = useRef(null);
  const terminalRef = useRef(null);

  const connectSocket = useCallback((key) => {
    const socket = io(API_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("auth", key);
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("auth_success", () => {
      setAuthenticated(true);
      setAuthError("");
      localStorage.setItem("admin_key", key);
    });

    socket.on("auth_error", (msg) => {
      setAuthError(msg);
      setAuthenticated(false);
      localStorage.removeItem("admin_key");
    });

    socket.on("stats", (data) => {
      setStats(data);
      if (data.activityLog) setActivities(data.activityLog);
    });

    socket.on("activity", (entry) => {
      setActivities((prev) => [entry, ...prev].slice(0, 30));
    });

    socket.on("action_ack", (data) => {
      if (data.status === "done" || data.status === "error") {
        setActionLoading("");
      }
    });

    return socket;
  }, []);

  useEffect(() => {
    const savedKey = localStorage.getItem("admin_key");
    if (savedKey) {
      setKeyInput(savedKey);
      connectSocket(savedKey);
    }
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [connectSocket]);

  function handleLogin(e) {
    e.preventDefault();
    if (!keyInput.trim()) return;
    if (socketRef.current) socketRef.current.disconnect();
    connectSocket(keyInput.trim());
  }

  function handleLogout() {
    localStorage.removeItem("admin_key");
    if (socketRef.current) socketRef.current.disconnect();
    setAuthenticated(false);
    setStats(null);
    setActivities([]);
  }

  function handleAction(action) {
    if (!socketRef.current || actionLoading) return;
    setActionLoading(action);
    socketRef.current.emit("action", action);
  }

  // Login screen
  if (!authenticated) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginBox}>
          <div style={styles.loginLogo}>C</div>
          <h1 style={styles.loginTitle}>ADMIN DASHBOARD</h1>
          <p style={styles.loginSubtitle}>Crypto Intelligence Monitor</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter admin key..."
              style={styles.loginInput}
              autoFocus
            />
            <button type="submit" style={styles.loginButton}>
              AUTHENTICATE
            </button>
          </form>
          {authError && <p style={styles.errorText}>{authError}</p>}
        </div>
      </div>
    );
  }

  const s = stats;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerLogo}>C</span>
          <div>
            <h1 style={styles.headerTitle}>ADMIN DASHBOARD</h1>
            <p style={styles.headerSub}>
              {connected ? (
                <span style={{ color: "#22c55e" }}>CONNECTED</span>
              ) : (
                <span style={{ color: "#ef4444" }}>DISCONNECTED</span>
              )}
              {s && <span style={{ color: "#52525b" }}> | Updated {formatTime(s.timestamp)}</span>}
            </p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button
            onClick={() => handleAction("refresh")}
            disabled={!!actionLoading}
            style={{ ...styles.actionBtn, borderColor: "#3b82f6", color: "#3b82f6" }}
          >
            {actionLoading === "refresh" ? "..." : "FORCE REFRESH"}
          </button>
          <button
            onClick={() => handleAction("rebuild")}
            disabled={!!actionLoading}
            style={{ ...styles.actionBtn, borderColor: "#22c55e", color: "#22c55e" }}
          >
            {actionLoading === "rebuild" ? "..." : "FORCE REBUILD"}
          </button>
          <button
            onClick={() => handleAction("recreate-cache")}
            disabled={!!actionLoading}
            style={{ ...styles.actionBtn, borderColor: "#f59e0b", color: "#f59e0b" }}
          >
            {actionLoading === "recreate-cache" ? "..." : "RECREATE CACHE"}
          </button>
          <button onClick={handleLogout} style={{ ...styles.actionBtn, borderColor: "#ef4444", color: "#ef4444" }}>
            LOGOUT
          </button>
        </div>
      </header>

      {!s ? (
        <div style={styles.loading}>Loading stats...</div>
      ) : (
        <>
          {/* Overview Cards */}
          <div style={styles.cardRow}>
            <StatCard label="TOTAL ARTICLES" value={s.overview.totalArticles} color="#f59e0b" />
            <StatCard label="TODAY" value={s.overview.todayArticles} color="#22c55e" />
            <StatCard label="SOURCES" value={s.overview.sourcesCount} color="#3b82f6" />
            <StatCard
              label="SCRAPE RATE"
              value={`${s.scraping.successRate}%`}
              color="#a855f7"
            />
          </div>

          {/* Progress Bars */}
          <div style={styles.cardRow}>
            <ProgressCard
              title="SCRAPING PROGRESS"
              items={[
                { label: "Scraped", value: s.scraping.scraped, color: "#22c55e" },
                { label: "Pending", value: s.scraping.pending, color: "#f59e0b" },
                { label: "Failed", value: s.scraping.failed, color: "#ef4444" },
              ]}
              total={s.scraping.scraped + s.scraping.pending + s.scraping.failed}
            />
            <ProgressCard
              title="TRANSLATION PROGRESS"
              items={[
                { label: "Translated", value: s.translation.translated, color: "#3b82f6" },
                { label: "Pending", value: s.translation.untranslated, color: "#f59e0b" },
              ]}
              total={s.translation.translated + s.translation.untranslated}
            />
          </div>

          {/* Sentiment + Categories + Sources */}
          <div style={styles.cardRow3}>
            {/* Sentiment */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>SENTIMENT</h3>
              <div style={styles.sentimentGrid}>
                <SentimentBar label="BULLISH" value={s.sentiment.bullish || 0} color="#22c55e" total={s.overview.totalArticles} />
                <SentimentBar label="BEARISH" value={s.sentiment.bearish || 0} color="#ef4444" total={s.overview.totalArticles} />
                <SentimentBar label="NEUTRAL" value={s.sentiment.neutral || 0} color="#52525b" total={s.overview.totalArticles} />
              </div>
            </div>

            {/* Categories */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>CATEGORIES</h3>
              <div style={styles.listContainer}>
                {Object.entries(s.categories)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, count]) => (
                    <div key={cat} style={styles.listItem}>
                      <span style={styles.listLabel}>{cat.toUpperCase()}</span>
                      <span style={styles.listValue}>{count}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Sources */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>TOP SOURCES</h3>
              <div style={styles.listContainer}>
                {Object.entries(s.sources)
                  .slice(0, 10)
                  .map(([source, count]) => (
                    <div key={source} style={styles.listItem}>
                      <span style={styles.listLabel}>{source}</span>
                      <span style={styles.listValue}>{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Activity Log + Recent Articles */}
          <div style={styles.cardRow}>
            {/* Activity Log */}
            <div style={{ ...styles.card, flex: 2 }}>
              <h3 style={styles.cardTitle}>ACTIVITY LOG</h3>
              <div style={styles.logContainer}>
                {activities.length === 0 ? (
                  <p style={{ color: "#52525b", fontSize: 12 }}>No recent activity</p>
                ) : (
                  activities.map((a, i) => {
                    const cfg = activityConfig[a.type] || activityConfig.error;
                    return (
                      <div key={i} style={styles.logEntry}>
                        <span
                          style={{
                            ...styles.logBadge,
                            backgroundColor: cfg.color + "20",
                            color: cfg.color,
                            borderColor: cfg.color + "40",
                          }}
                        >
                          {cfg.icon}
                        </span>
                        <span style={styles.logMessage}>{a.message}</span>
                        {a.detail && <span style={styles.logDetail}>{a.detail}</span>}
                        <span style={styles.logTime}>{formatTime(a.time)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Recent Articles */}
            <div style={{ ...styles.card, flex: 1 }}>
              <h3 style={styles.cardTitle}>RECENT ARTICLES</h3>
              <div style={styles.listContainer}>
                {s.recentArticles?.map((a) => (
                  <div key={a._id} style={styles.recentItem}>
                    <div style={styles.recentTitle}>{a.title?.substring(0, 50)}...</div>
                    <div style={styles.recentMeta}>
                      <span>{a.source}</span>
                      <span
                        style={{
                          color:
                            a.scrapingStatus === "scraped"
                              ? "#22c55e"
                              : a.scrapingStatus === "failed"
                                ? "#ef4444"
                                : "#f59e0b",
                        }}
                      >
                        {a.scrapingStatus || "pending"}
                      </span>
                      <span>{formatTimeAgo(a.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Sub-components
function StatCard({ label, value, color }) {
  return (
    <div style={{ ...styles.card, ...styles.statCard }}>
      <p style={styles.statLabel}>{label}</p>
      <p style={{ ...styles.statValue, color }}>{value}</p>
    </div>
  );
}

function ProgressCard({ title, items, total }) {
  return (
    <div style={{ ...styles.card, flex: 1 }}>
      <h3 style={styles.cardTitle}>{title}</h3>
      {/* Stacked bar */}
      <div style={styles.progressBarBg}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              height: "100%",
              width: total > 0 ? `${(item.value / total) * 100}%` : "0%",
              backgroundColor: item.color,
              transition: "width 0.5s ease",
            }}
          />
        ))}
      </div>
      <div style={styles.progressLabels}>
        {items.map((item, i) => (
          <div key={i} style={styles.progressItem}>
            <span style={{ ...styles.dot, backgroundColor: item.color }} />
            <span style={styles.progressText}>
              {item.label}: <strong>{item.value}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SentimentBar({ label, value, color, total }) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#a1a1aa", letterSpacing: "0.1em" }}>{label}</span>
        <span style={{ fontSize: 12, color, fontWeight: 700 }}>
          {value} ({pct}%)
        </span>
      </div>
      <div style={{ ...styles.progressBarBg, height: 6 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            backgroundColor: color,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

// Inline styles (brutalist dark theme matching the main site)
const styles = {
  // Login
  loginContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a0a0b",
    fontFamily: "'JetBrains Mono', monospace",
  },
  loginBox: {
    textAlign: "center",
    padding: 40,
    border: "1px solid #27272b",
    backgroundColor: "#111113",
    maxWidth: 400,
    width: "100%",
  },
  loginLogo: {
    width: 48,
    height: 48,
    border: "2px solid #f59e0b",
    color: "#f59e0b",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 16,
  },
  loginTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#fafafa",
    letterSpacing: "0.15em",
    margin: "0 0 4px",
  },
  loginSubtitle: {
    fontSize: 11,
    color: "#52525b",
    letterSpacing: "0.1em",
    margin: "0 0 24px",
  },
  loginInput: {
    width: "100%",
    padding: "12px 16px",
    backgroundColor: "#0a0a0b",
    border: "1px solid #27272b",
    color: "#fafafa",
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    marginBottom: 12,
    boxSizing: "border-box",
  },
  loginButton: {
    width: "100%",
    padding: "12px 16px",
    backgroundColor: "#f59e0b",
    border: "none",
    color: "#0a0a0b",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.15em",
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 12,
  },

  // Dashboard
  container: {
    minHeight: "100vh",
    backgroundColor: "#0a0a0b",
    color: "#fafafa",
    fontFamily: "'JetBrains Mono', monospace",
    padding: "0 24px 48px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 0",
    borderBottom: "1px solid #1f1f23",
    marginBottom: 24,
    flexWrap: "wrap",
    gap: 12,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  headerLogo: {
    width: 36,
    height: 36,
    border: "2px solid #f59e0b",
    color: "#f59e0b",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    fontWeight: 800,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.15em",
    margin: 0,
  },
  headerSub: {
    fontSize: 11,
    margin: 0,
    letterSpacing: "0.05em",
  },
  headerRight: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  actionBtn: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "1px solid",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "all 0.15s ease",
  },
  loading: {
    textAlign: "center",
    padding: 60,
    color: "#52525b",
    fontSize: 14,
    letterSpacing: "0.1em",
  },

  // Cards
  cardRow: {
    display: "flex",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  cardRow3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#111113",
    border: "1px solid #1f1f23",
    padding: 20,
    flex: 1,
    minWidth: 200,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#52525b",
    letterSpacing: "0.15em",
    margin: "0 0 16px",
    textTransform: "uppercase",
  },

  // Stat cards
  statCard: {
    textAlign: "center",
    minWidth: 140,
  },
  statLabel: {
    fontSize: 10,
    color: "#52525b",
    letterSpacing: "0.15em",
    margin: "0 0 8px",
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    margin: 0,
  },

  // Progress
  progressBarBg: {
    display: "flex",
    height: 8,
    backgroundColor: "#1f1f23",
    overflow: "hidden",
    marginBottom: 12,
  },
  progressLabels: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
  },
  progressItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    display: "inline-block",
  },
  progressText: {
    fontSize: 11,
    color: "#a1a1aa",
  },

  // Sentiment
  sentimentGrid: {
    display: "flex",
    flexDirection: "column",
  },

  // Lists
  listContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 300,
    overflowY: "auto",
  },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
    borderBottom: "1px solid #1f1f2310",
    fontSize: 12,
  },
  listLabel: {
    color: "#a1a1aa",
  },
  listValue: {
    color: "#fafafa",
    fontWeight: 700,
  },

  // Activity log
  logContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 400,
    overflowY: "auto",
  },
  logEntry: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 0",
    borderBottom: "1px solid #1f1f2320",
    fontSize: 12,
  },
  logBadge: {
    padding: "2px 6px",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.05em",
    border: "1px solid",
    flexShrink: 0,
  },
  logMessage: {
    color: "#a1a1aa",
    flex: 1,
  },
  logDetail: {
    color: "#52525b",
    fontSize: 11,
    flexShrink: 0,
  },
  logTime: {
    color: "#52525b",
    fontSize: 10,
    flexShrink: 0,
    minWidth: 70,
    textAlign: "right",
  },

  // Recent articles
  recentItem: {
    padding: "8px 0",
    borderBottom: "1px solid #1f1f2320",
  },
  recentTitle: {
    fontSize: 12,
    color: "#fafafa",
    marginBottom: 4,
    lineHeight: 1.4,
  },
  recentMeta: {
    display: "flex",
    gap: 8,
    fontSize: 10,
    color: "#52525b",
  },
};
