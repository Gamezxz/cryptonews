"use client";

import { useState, useEffect, useCallback, useRef } from "react";

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:13002";
}

const COINS = [
  { symbol: "BTCUSDT", name: "BTC" },
  { symbol: "ETHUSDT", name: "ETH" },
  { symbol: "PAXGUSDT", name: "PAXG" },
  { symbol: "BNBUSDT", name: "BNB" },
];

const WS_URL = `wss://fstream.binance.com/stream?streams=${COINS.map((c) => c.symbol.toLowerCase() + "@ticker").join("/")}`;

function formatPrice(price, symbol) {
  const num = parseFloat(price);
  if (isNaN(num)) return "—";
  if (symbol === "BTCUSDT")
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (symbol === "PAXGUSDT")
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMA(val, symbol) {
  if (!val) return "—";
  if (symbol === "BTCUSDT")
    return val.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (symbol === "PAXGUSDT")
    return val.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function CryptoPriceTicker() {
  const [prices, setPrices] = useState({});
  const [indicators, setIndicators] = useState({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const [flashes, setFlashes] = useState({});

  const fetchIndicators = useCallback(async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/api/klines`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) setIndicators(json.data);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let delay = 5000;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        delay = 5000;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const d = msg.data;
          if (!d || !d.s) return;
          const symbol = d.s;
          const newPrice = parseFloat(d.c);

          setPrices((prev) => {
            const oldPrice = prev[symbol]?.price;
            if (oldPrice && oldPrice !== newPrice) {
              setFlashes((f) => ({
                ...f,
                [symbol]: newPrice > oldPrice ? "up" : "down",
              }));
              setTimeout(
                () => setFlashes((f) => ({ ...f, [symbol]: null })),
                400,
              );
            }
            return {
              ...prev,
              [symbol]: {
                price: newPrice,
                change: parseFloat(d.P),
                high: parseFloat(d.h),
                low: parseFloat(d.l),
              },
            };
          });
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!unmounted) {
          reconnectRef.current = setTimeout(() => {
            delay = Math.min(delay * 1.5, 30000);
            connect();
          }, delay);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      unmounted = true;
      wsRef.current?.close();
      clearTimeout(reconnectRef.current);
    };
  }, []);

  useEffect(() => {
    fetchIndicators();
    const interval = setInterval(fetchIndicators, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchIndicators]);

  if (loading && Object.keys(prices).length === 0) return null;

  return (
    <div className="ticker-widget">
      <div className="ticker-header">
        <span className="ticker-title">LIVE PRICES</span>
        <span
          className={`ticker-status ${connected ? "ticker-online" : "ticker-offline"}`}
        >
          <span className="ticker-dot" />
          {connected ? "LIVE" : "..."}
        </span>
      </div>
      <div className="ticker-list">
        {COINS.map((coin) => {
          const p = prices[coin.symbol];
          const ind = indicators[coin.symbol];
          const flash = flashes[coin.symbol];
          const up = p && p.change >= 0;

          return (
            <div key={coin.symbol} className="ticker-row">
              <span className="ticker-coin-name">{coin.name}</span>
              <span
                className={`ticker-price-sm ${flash ? `flash-${flash}` : ""}`}
              >
                {p ? `$${formatPrice(p.price, coin.symbol)}` : "—"}
              </span>
              {p && (
                <span
                  className={`ticker-change-sm ${up ? "ticker-up" : "ticker-down"}`}
                >
                  {up ? "+" : ""}
                  {p.change.toFixed(2)}%
                </span>
              )}
              {ind && (
                <span
                  className="ticker-rsi-badge"
                  style={{
                    color:
                      ind.rsi < 30
                        ? "var(--green)"
                        : ind.rsi > 70
                          ? "var(--red)"
                          : "var(--accent)",
                  }}
                >
                  RSI {ind.rsi.toFixed(1)}
                </span>
              )}
              {ind && (
                <span className="ticker-ma-sm">
                  <span className="ticker-ma-label">MA7</span>
                  {formatMA(ind.ma7, coin.symbol)}
                  <span className="ticker-ma-sep">/</span>
                  <span className="ticker-ma-label">MA25</span>
                  {formatMA(ind.ma25, coin.symbol)}
                </span>
              )}
              {ind && ind.ma7 && ind.ma25 && (
                <span
                  className={`ticker-signal-sm ${ind.ma7 > ind.ma25 ? "signal-bull" : "signal-bear"}`}
                >
                  {ind.ma7 > ind.ma25 ? "BULL" : "BEAR"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
