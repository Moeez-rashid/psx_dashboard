"use client";
import type { StockQuote } from "@/lib/psx";
import { fmtPKR } from "@/lib/format";
import { resolveSectorName } from "@/lib/sectors";

export interface Holding { ticker: string; name: string; shares: number; avgPrice: number; shariah: boolean; }

const PIE_COLORS = [
  "var(--color-up)", "var(--color-sky)", "var(--color-gold)", "var(--color-violet)",
  "#c08060", "#60b0c0", "#a0c060", "#c060a0",
];

function polarToCart(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function donutSlicePath(cx: number, cy: number, r: number, ir: number, startDeg: number, endDeg: number): string {
  const gap = Math.min(1.5, (endDeg - startDeg) * 0.04);
  const s1 = polarToCart(cx, cy, r, startDeg + gap);
  const e1 = polarToCart(cx, cy, r, endDeg - gap);
  const s2 = polarToCart(cx, cy, ir, endDeg - gap);
  const e2 = polarToCart(cx, cy, ir, startDeg + gap);
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s1.x.toFixed(2)} ${s1.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e1.x.toFixed(2)} ${e1.y.toFixed(2)} L ${s2.x.toFixed(2)} ${s2.y.toFixed(2)} A ${ir} ${ir} 0 ${large} 0 ${e2.x.toFixed(2)} ${e2.y.toFixed(2)} Z`;
}

const GRID = "grid grid-cols-[10px_60px_1fr_72px_56px] sm:grid-cols-[10px_72px_1fr_44px_84px_92px_52px_48px] gap-x-2 items-center";

export default function HoldingsOverview({ holdings, prices }: {
  holdings: Holding[];
  prices: Record<string, StockQuote>;
}) {
  if (holdings.length === 0) return null;

  const rows = holdings.map((h, i) => {
    const livePrice = prices[h.ticker]?.currentPrice ?? h.avgPrice;
    const changeToday = prices[h.ticker]?.changePercent;
    const marketVal = livePrice * h.shares;
    const costBasis = h.avgPrice * h.shares;
    const pnl = marketVal - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return { ticker: h.ticker, name: h.name, marketVal, costBasis, pnl, pnlPct, changeToday, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  const totalMV = rows.reduce((s, r) => s + r.marketVal, 0);
  const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);
  const totalPnl = totalMV - totalCost;
  const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  // Donut slices
  const cx = 60, cy = 60, R = 54, ir = 33;
  let deg = 0;
  const slices = rows.map(r => {
    const frac = totalMV > 0 ? r.marketVal / totalMV : 1 / rows.length;
    const path = donutSlicePath(cx, cy, R, ir, deg, deg + frac * 360);
    deg += frac * 360;
    return { ...r, path };
  });

  // Sector aggregation
  const sectorMap: Record<string, number> = {};
  for (const r of rows) {
    const raw = r.name.includes(" · ") ? r.name.split(" · ").slice(1).join(" · ") : "Other";
    const sector = resolveSectorName(raw);
    sectorMap[sector] = (sectorMap[sector] ?? 0) + r.marketVal;
  }
  const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);

  const pnlTone = (v: number) => (v >= 0 ? "text-up-2" : "text-down-2");

  return (
    <div className="card mb-4">
      <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">

        {/* Donut */}
        <svg width={120} height={120} className="shrink-0">
          {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}
          <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--color-ink)" fontSize={12} fontWeight={700}>{fmtPKR(totalMV)}</text>
          <text x={cx} y={cy + 6} textAnchor="middle" fill="var(--color-ink-3)" fontSize={8}>PKR total</text>
          <text x={cx} y={cy + 19} textAnchor="middle" fill={totalPnl >= 0 ? "var(--color-up-2)" : "var(--color-down-2)"} fontSize={10} fontWeight={600}>
            {totalPnl >= 0 ? "+" : "-"}{fmtPKR(totalPnl)}
          </text>
        </svg>

        <div className="flex-1 min-w-0 w-full">
          {/* KPI row */}
          <div className="flex gap-5 items-baseline mb-4 flex-wrap">
            <div className="flex gap-1.5 items-baseline">
              <span className="text-[10px] text-ink-3 uppercase tracking-wide">Value</span>
              <span className="text-base font-bold num">PKR {fmtPKR(totalMV)}</span>
            </div>
            <div className="flex gap-1.5 items-baseline">
              <span className="text-[10px] text-ink-3 uppercase tracking-wide">Invested</span>
              <span className="text-xs text-ink-2 num">PKR {fmtPKR(totalCost)}</span>
            </div>
            <div className="flex gap-1.5 items-baseline">
              <span className="text-[10px] text-ink-3 uppercase tracking-wide">P&L</span>
              <span className={`text-sm font-semibold num ${pnlTone(totalPnl)}`}>
                {totalPnl >= 0 ? "+" : "-"}PKR {fmtPKR(totalPnl)}
              </span>
              <span className={`text-[11px] num ${pnlTone(totalPct)}`}>({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(1)}%)</span>
            </div>
          </div>

          {/* Header row */}
          <div className={`${GRID} mb-1`}>
            <span /><span className="label">Co.</span><span className="label">Allocation</span>
            <span className="label hidden sm:block text-right">%</span>
            <span className="label text-right hidden sm:block">Invested</span>
            <span className="label text-right">P&L</span>
            <span className="label text-right">P&L %</span>
            <span className="label text-right hidden sm:block">Today</span>
          </div>

          {/* Holding rows */}
          {rows.map(r => {
            const alloc = totalMV > 0 ? (r.marketVal / totalMV) * 100 : 0;
            return (
              <div key={r.ticker} className={`${GRID} h-7`}>
                <span className="w-2 h-2 rounded-[3px]" style={{ background: r.color }} />
                <span className="text-[11px] font-semibold text-ink truncate">{r.ticker}</span>
                <div className="h-1.5 bg-line-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${alloc}%`, background: r.color }} />
                </div>
                <span className="text-[10px] text-ink-2 num text-right hidden sm:block">{alloc.toFixed(1)}%</span>
                <span className="text-[10px] text-ink-2 num text-right hidden sm:block">PKR {fmtPKR(r.costBasis)}</span>
                <span className={`text-[11px] font-medium num text-right ${pnlTone(r.pnl)}`}>
                  {r.pnl >= 0 ? "+" : "-"}PKR {fmtPKR(r.pnl)}
                </span>
                <span className={`text-[10px] num text-right ${pnlTone(r.pnlPct)}`}>
                  {r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)}%
                </span>
                <span className={`text-[10px] num text-right hidden sm:block ${r.changeToday !== undefined ? pnlTone(r.changeToday) : "text-ink-3"}`}>
                  {r.changeToday !== undefined ? `${r.changeToday >= 0 ? "+" : ""}${r.changeToday.toFixed(1)}%` : "—"}
                </span>
              </div>
            );
          })}

          {/* Total row — with a single holding this would just restate that
              row's own numbers verbatim, so it only earns its place once
              there's an actual sum to show. */}
          {rows.length > 1 && (
            <div className={`${GRID} h-8 border-t border-line mt-1`}>
              <span />
              <span className="text-[11px] font-bold text-ink">Total</span>
              <span />
              <span className="hidden sm:block" />
              <span className="text-[10px] text-ink-2 num text-right hidden sm:block">PKR {fmtPKR(totalCost)}</span>
              <span className={`text-[11px] font-bold num text-right ${pnlTone(totalPnl)}`}>
                {totalPnl >= 0 ? "+" : "-"}PKR {fmtPKR(totalPnl)}
              </span>
              <span className={`text-[10px] font-bold num text-right ${pnlTone(totalPct)}`}>
                {totalPct >= 0 ? "+" : ""}{totalPct.toFixed(1)}%
              </span>
              <span className="hidden sm:block" />
            </div>
          )}

          {/* Sectors */}
          {sectors.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-line flex gap-4 flex-wrap items-center">
              <span className="label">Sectors</span>
              {sectors.map(([sector, val], i) => {
                const pct = totalMV > 0 ? ((val / totalMV) * 100).toFixed(0) : "0";
                return (
                  <span key={sector} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {sector}
                    <span className="text-ink font-medium num">{pct}%</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
