'use client';

import { useState, useEffect, useCallback } from 'react';

function getBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:13002';
}

const CLASSIFICATIONS = {
  'Extreme Fear': { color: '#ef4444', emoji: '😱' },
  'Fear': { color: '#f97316', emoji: '😨' },
  'Neutral': { color: '#eab308', emoji: '😐' },
  'Greed': { color: '#84cc16', emoji: '😀' },
  'Extreme Greed': { color: '#22c55e', emoji: '🤑' },
};

function GaugeChart({ value }) {
  const angle = (value / 100) * 180 - 90; // -90 to 90 degrees
  const radius = 80;
  const cx = 100;
  const cy = 95;

  // Arc segments: Extreme Fear, Fear, Neutral, Greed, Extreme Greed
  const segments = [
    { start: 0, end: 25, color: '#ef4444' },
    { start: 25, end: 46, color: '#f97316' },
    { start: 46, end: 54, color: '#eab308' },
    { start: 54, end: 75, color: '#84cc16' },
    { start: 75, end: 100, color: '#22c55e' },
  ];

  function polarToCart(angleDeg, r) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  function arcPath(startPct, endPct, r) {
    const startAngle = 180 + (startPct / 100) * 180;
    const endAngle = 180 + (endPct / 100) * 180;
    const start = polarToCart(startAngle, r);
    const end = polarToCart(endAngle, r);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  const needleEnd = polarToCart(180 + (value / 100) * 180, radius - 10);

  return (
    <svg viewBox="0 0 200 115" className="fng-gauge-svg">
      {/* Background arc segments */}
      {segments.map((seg, i) => (
        <path
          key={i}
          d={arcPath(seg.start, seg.end, radius)}
          fill="none"
          stroke={seg.color}
          strokeWidth="12"
          strokeLinecap="butt"
          opacity="0.8"
        />
      ))}

      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={needleEnd.x}
        y2={needleEnd.y}
        stroke="var(--text-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Needle center dot */}
      <circle cx={cx} cy={cy} r="4" fill="var(--accent)" />

      {/* Labels */}
      <text x="15" y="100" fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)">Fear</text>
      <text x="165" y="100" fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)">Greed</text>
    </svg>
  );
}

export default function FearGreedIndex() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/api/fear-greed`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !data || data.length === 0) return null;

  const current = data[0];
  const value = parseInt(current.value, 10);
  const classification = current.value_classification;
  const classConfig = CLASSIFICATIONS[classification] || CLASSIFICATIONS['Neutral'];

  // Historical: yesterday, last week, last month
  const yesterday = data[1] || null;
  const lastWeek = data[7] || null;
  const lastMonth = data[30] || null;

  // Next update countdown
  const timeUntilUpdate = current.time_until_update
    ? parseInt(current.time_until_update, 10)
    : null;

  function formatCountdown(seconds) {
    if (!seconds || seconds <= 0) return 'Soon';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function getClassColor(cls) {
    return CLASSIFICATIONS[cls]?.color || 'var(--text-muted)';
  }

  return (
    <div className="fng-widget">
      <div className="fng-header">
        <span className="fng-title">FEAR & GREED INDEX</span>
        <span className="fng-source">alternative.me</span>
      </div>

      <div className="fng-body">
        <div className="fng-gauge">
          <GaugeChart value={value} />
          <div className="fng-value-overlay">
            <span className="fng-value" style={{ color: classConfig.color }}>{value}</span>
            <span className="fng-class" style={{ color: classConfig.color }}>{classification}</span>
          </div>
        </div>

        <div className="fng-history">
          {yesterday && (
            <div className="fng-history-row">
              <span className="fng-history-label">Yesterday</span>
              <span className="fng-history-val" style={{ color: getClassColor(yesterday.value_classification) }}>
                {yesterday.value} — {yesterday.value_classification}
              </span>
            </div>
          )}
          {lastWeek && (
            <div className="fng-history-row">
              <span className="fng-history-label">Last Week</span>
              <span className="fng-history-val" style={{ color: getClassColor(lastWeek.value_classification) }}>
                {lastWeek.value} — {lastWeek.value_classification}
              </span>
            </div>
          )}
          {lastMonth && (
            <div className="fng-history-row">
              <span className="fng-history-label">Last Month</span>
              <span className="fng-history-val" style={{ color: getClassColor(lastMonth.value_classification) }}>
                {lastMonth.value} — {lastMonth.value_classification}
              </span>
            </div>
          )}
        </div>
      </div>

      {timeUntilUpdate && (
        <div className="fng-footer">
          <span className="fng-update">Next update: {formatCountdown(timeUntilUpdate)}</span>
        </div>
      )}
    </div>
  );
}
