'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

function getBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:13002';
}

const COINS = [
  { symbol: 'BTCUSDT', name: 'BTC', label: 'Bitcoin' },
  { symbol: 'ETHUSDT', name: 'ETH', label: 'Ethereum' },
  { symbol: 'PAXGUSDT', name: 'PAXG', label: 'PAX Gold' },
  { symbol: 'BNBUSDT', name: 'BNB', label: 'BNB' },
];

const WS_URL = `wss://fstream.binance.com/stream?streams=${COINS.map(c => c.symbol.toLowerCase() + '@ticker').join('/')}`;

function formatPrice(price, symbol) {
  const num = parseFloat(price);
  if (isNaN(num)) return '—';
  if (symbol === 'BTCUSDT' || symbol === 'PAXGUSDT') return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (symbol === 'ETHUSDT') return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatMA(val, symbol) {
  if (!val) return '—';
  if (symbol === 'BTCUSDT') return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (symbol === 'PAXGUSDT') return val.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function RSIGauge({ value }) {
  if (value === null || value === undefined) return null;
  const color = value < 30 ? 'var(--green)' : value > 70 ? 'var(--red)' : 'var(--accent)';
  const label = value < 30 ? 'OVERSOLD' : value > 70 ? 'OVERBOUGHT' : '';
  return (
    <div className="ticker-rsi">
      <span className="ticker-rsi-label">RSI</span>
      <div className="ticker-rsi-bar">
        <div className="ticker-rsi-fill" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
        <div className="ticker-rsi-zones" />
      </div>
      <span className="ticker-rsi-value" style={{ color }}>{value.toFixed(1)}</span>
      {label && <span className="ticker-rsi-tag" style={{ color, borderColor: color }}>{label}</span>}
    </div>
  );
}

export default function CryptoPriceTicker() {
  const [prices, setPrices] = useState({});
  const [indicators, setIndicators] = useState({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const prevPricesRef = useRef({});
  const [flashes, setFlashes] = useState({});

  // Fetch RSI/MA indicators
  const fetchIndicators = useCallback(async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/api/klines`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setIndicators(json.data);
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket connection
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

          setPrices(prev => {
            const oldPrice = prev[symbol]?.price;
            // Flash effect
            if (oldPrice && oldPrice !== newPrice) {
              setFlashes(f => ({ ...f, [symbol]: newPrice > oldPrice ? 'up' : 'down' }));
              setTimeout(() => setFlashes(f => ({ ...f, [symbol]: null })), 400);
            }
            return {
              ...prev,
              [symbol]: {
                price: newPrice,
                change: parseFloat(d.P),
                high: parseFloat(d.h),
                low: parseFloat(d.l),
                volume: parseFloat(d.q),
              }
            };
          });
        } catch {
          // Ignore parse errors
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

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
    return () => {
      unmounted = true;
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, []);

  // Fetch indicators on mount + every 5 min
  useEffect(() => {
    fetchIndicators();
    const interval = setInterval(fetchIndicators, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchIndicators]);

  // Don't render until we have at least indicators
  if (loading && Object.keys(prices).length === 0) return null;

  return (
    <div className="ticker-widget">
      <div className="ticker-header">
        <span className="ticker-title">LIVE PRICES</span>
        <span className={`ticker-status ${connected ? 'ticker-online' : 'ticker-offline'}`}>
          <span className="ticker-dot" />
          {connected ? 'LIVE' : 'RECONNECTING'}
        </span>
      </div>
      <div className="ticker-grid">
        {COINS.map(coin => {
          const p = prices[coin.symbol];
          const ind = indicators[coin.symbol];
          const flash = flashes[coin.symbol];
          const changePositive = p && p.change >= 0;

          return (
            <div key={coin.symbol} className="ticker-card">
              <div className="ticker-card-top">
                <div className="ticker-coin">
                  <span className="ticker-coin-name">{coin.name}</span>
                  <span className="ticker-coin-pair">/ USDT</span>
                </div>
                {p && (
                  <span className={`ticker-change ${changePositive ? 'ticker-up' : 'ticker-down'}`}>
                    {changePositive ? '+' : ''}{p.change.toFixed(2)}%
                  </span>
                )}
              </div>

              <div className={`ticker-price ${flash ? `flash-${flash}` : ''}`}>
                {p ? `$${formatPrice(p.price, coin.symbol)}` : '—'}
              </div>

              {ind && <RSIGauge value={ind.rsi} />}

              {ind && (
                <div className="ticker-ma">
                  <div className="ticker-ma-row">
                    <span className="ticker-ma-label">MA7</span>
                    <span className="ticker-ma-val">{formatMA(ind.ma7, coin.symbol)}</span>
                  </div>
                  <div className="ticker-ma-row">
                    <span className="ticker-ma-label">MA25</span>
                    <span className="ticker-ma-val">{formatMA(ind.ma25, coin.symbol)}</span>
                  </div>
                  {ind.ma7 && ind.ma25 && (
                    <span className={`ticker-signal ${ind.ma7 > ind.ma25 ? 'signal-bull' : 'signal-bear'}`}>
                      {ind.ma7 > ind.ma25 ? 'BULLISH' : 'BEARISH'}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
