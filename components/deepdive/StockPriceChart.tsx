"use client";
import { useMemo, useState } from "react";
import type { DeepDivePricePoint } from "@/lib/deepdive";

/**
 * The first thing on a stock page: closing prices over 1M / 3M / 6M / 1Y.
 * Drag or hover to read any session; the readout above the chart shows the
 * latest close otherwise. Closing prices only — the EOD feed has no intraday
 * data, and this says so instead of drawing something it doesn't have.
 */

const RANGES = [
  { label: "1M", sessions: 21 },
  { label: "3M", sessions: 63 },
  { label: "6M", sessions: 126 },
  { label: "1Y", sessions: 252 },
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  return MONTHS[mi] ? `${Number(d)} ${MONTHS[mi]} ${y}` : iso;
}

export default function StockPriceChart({ series }: { series: DeepDivePricePoint[] }) {
  const clean = useMemo(() => series.filter((p) => Number.isFinite(p.close) && p.close > 0), [series]);
  // Offer only ranges the history can fill; the longest one always shows.
  const ranges = RANGES.filter((r, i) => i === 0 || clean.length >= r.sessions * 0.8);
  const [rangeLabel, setRangeLabel] = useState<string>("3M");
  const range = ranges.find((r) => r.label === rangeLabel) ?? ranges[ranges.length - 1];
  const points = clean.slice(-range.sessions);
  const n = points.length;
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (n < 2) return null;
    const closes = points.map((p) => p.close);
    const lo = Math.min(...closes), hi = Math.max(...closes);
    const pad = hi > lo ? (hi - lo) * 0.1 : Math.max(hi * 0.01, 0.5);
    const yMin = lo - pad, yMax = hi + pad;
    const W = 1000, H = 300;
    const x = (i: number) => (i / (n - 1)) * W;
    const y = (v: number) => ((yMax - v) / (yMax - yMin)) * H;
    const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(" ");
    return { W, H, x, y, line, area: `0,${H} ${line} ${W},${H}` };
  }, [points, n]);

  if (!geo) {
    return <p className="text-[13px] text-ink-3 py-8 text-center">Not enough price history to draw a chart yet.</p>;
  }

  const first = points[0].close;
  const idx = hover === null ? n - 1 : Math.min(Math.max(hover, 0), n - 1);
  const at = points[idx];
  const change = ((at.close - first) / first) * 100;
  const up = points[n - 1].close >= first;
  const stroke = up ? "var(--color-up-2)" : "var(--color-down-2)";

  const toIndex = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width ? Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (n - 1)) : n - 1;
  };

  return (
    <section aria-label="Price chart" className="mt-5">
      {/* Readout: follows the finger, otherwise the latest close. */}
      <div className="flex items-baseline justify-between gap-3 min-h-6">
        <span className="text-[13px] text-ink-2">
          {hover === null ? `${range.label} change` : fmtDate(at.date)}
        </span>
        <span className="text-[13px] num tabular-nums">
          {hover !== null && <span className="text-ink mr-2">{at.close.toFixed(2)}</span>}
          <span className={change >= 0 ? "text-up-2" : "text-down-2"}>
            {change >= 0 ? "+" : "−"}{Math.abs(change).toFixed(2)}%
          </span>
        </span>
      </div>

      <div
        className="relative mt-2 h-44 sm:h-56 touch-pan-y select-none"
        onPointerMove={(e) => setHover(toIndex(e.clientX, e.currentTarget))}
        onPointerDown={(e) => setHover(toIndex(e.clientX, e.currentTarget))}
        onPointerLeave={() => setHover(null)}
        onPointerUp={(e) => { if (e.pointerType !== "mouse") setHover(null); }}
      >
        <svg viewBox={`0 0 ${geo.W} ${geo.H}`} preserveAspectRatio="none" className="w-full h-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="stockChartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={geo.area} fill="url(#stockChartFill)" />
          <polyline points={geo.line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover !== null && (
            <line x1={geo.x(idx)} x2={geo.x(idx)} y1="0" y2={geo.H} stroke="var(--color-ink-3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Dot drawn in HTML so it stays round when the SVG stretches. */}
        <span
          className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full ring-4 ring-surface pointer-events-none"
          style={{ left: `${(geo.x(idx) / geo.W) * 100}%`, top: `${(geo.y(at.close) / geo.H) * 100}%`, background: stroke }}
        />
      </div>

      <div className="flex items-center justify-between mt-3">
        <div role="group" aria-label="Chart range" className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => { setRangeLabel(r.label); setHover(null); }}
              aria-pressed={r.label === range.label}
              className={`min-w-11 min-h-9 px-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer
                ${r.label === range.label ? "bg-raised text-ink" : "text-ink-3 hover:text-ink-2"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-ink-3">Daily closes</span>
      </div>
    </section>
  );
}
