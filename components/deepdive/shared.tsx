import type { LucideIcon } from "lucide-react";
import { Ban, Info } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared presentational primitives for the Deep Dive research view.
 *
 * Deep Dive is denser than Opportunities, so the visual system here is
 * deliberately flatter: sections are separated by headings and whitespace
 * rather than by giving every metric its own bordered card. Cards are
 * reserved for things that genuinely are discrete objects (a news item, the
 * AI panel), not for individual numbers.
 *
 * These are server components — pure rendering, no state.
 */

// ─── Formatters ──────────────────────────────────────────────────────────────
// Every one returns the em-dash placeholder for null rather than 0 or "N/A",
// so an absent value is always visually distinct from a real zero.

export const DASH = "—";

export function fmtNum(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? DASH : v.toFixed(digits);
}

/** 5.69 -> "5.69×" */
export function fmtMultiple(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? DASH : `${v.toFixed(digits)}×`;
}

/** 16.9 -> "16.9%" */
export function fmtPercent(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? DASH : `${v.toFixed(digits)}%`;
}

/** 42.66 -> "+42.7%" */
export function fmtSignedPercent(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return DASH;
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

/** PKR amounts up to billions. lib/format.ts's fmtPKR stops at millions,
 *  which turns a liquid stock's daily turnover into "1438.43M". */
export function fmtPKRLarge(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000_000) return `${(a / 1_000_000_000).toFixed(2)}B`;
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(a / 1_000).toFixed(1)}K`;
  return Math.round(a).toString();
}

/** Directional tone for a signed number; neutral when absent. */
export function signTone(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-ink-2";
  return v > 0 ? "text-up-2" : v < 0 ? "text-down-2" : "text-ink-2";
}

// ─── Section shell ───────────────────────────────────────────────────────────

export function Section({
  icon: Icon, title, kicker, aside, children, id,
}: {
  icon: LucideIcon;
  title: string;
  /** One line under the heading — what this section answers. */
  kicker?: string;
  /** Right-aligned metadata, typically a freshness tag. */
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="border-t border-line pt-6 mt-6 first:border-0 first:pt-0 first:mt-0">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink tracking-tight">
            <Icon size={15} strokeWidth={2} className="text-ink-3 shrink-0" aria-hidden />
            {title}
          </h2>
          {kicker && <p className="text-[11px] text-ink-3 mt-1 leading-snug">{kicker}</p>}
        </div>
        {aside && <div className="shrink-0 flex items-center gap-1.5">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** A labelled group inside a section — the level between "section" and "metric". */
export function Group({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="label">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export function MetricGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const colClass = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
  }[cols];
  return <div className={`grid ${colClass} gap-x-4 gap-y-4`}>{children}</div>;
}

/**
 * One metric. `naReason` is for values the data model tells us are structurally
 * inapplicable (a bank not reporting Debt/Equity) — rendered differently from a
 * plain missing value, because "not reported under bank schema" is an answer,
 * while a dash is an absence.
 */
export function Metric({
  label, value, tone = "text-ink", hint, naReason,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
  naReason?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="label mb-1 truncate" title={label}>{label}</div>
      {naReason ? (
        <div className="text-[11px] text-ink-3 leading-snug italic">{naReason}</div>
      ) : (
        <>
          <div className={`text-[15px] font-semibold num tabular-nums leading-none ${tone}`}>{value}</div>
          {hint && <div className="text-[10px] text-ink-3 mt-1 leading-snug">{hint}</div>}
        </>
      )}
    </div>
  );
}

// ─── Freshness / provenance tags ─────────────────────────────────────────────

/**
 * Tags that state where a number came from and how old it is. Annual
 * fundamentals and live quotes look identical on a page unless something says
 * otherwise, so every section that mixes them carries one of these.
 */
export function Tag({ children, tone = "neutral", title }: {
  children: ReactNode;
  tone?: "neutral" | "annual" | "live" | "eod" | "proxy";
  title?: string;
}) {
  const cls = {
    neutral: "bg-inset border-line text-ink-3",
    annual: "bg-violet-dim border-violet/30 text-violet-2",
    live: "bg-up-dim border-up/40 text-up-2",
    eod: "bg-inset border-line-2 text-ink-2",
    proxy: "bg-sky-dim border-sky/30 text-sky-2",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[9px] font-medium tracking-wide whitespace-nowrap num ${cls}`}>
      {children}
    </span>
  );
}

// ─── Unavailable states ──────────────────────────────────────────────────────

/** Data we tried to get and couldn't — always says why. */
export function Unavailable({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-inset border border-line rounded-lg px-3 py-2.5">
      <Info size={13} strokeWidth={2} className="text-ink-3 shrink-0 mt-0.5" aria-hidden />
      <p className="text-[11px] text-ink-2 leading-relaxed">{children}</p>
    </div>
  );
}

/** Things we deliberately don't compute — a stated design choice, not a gap. */
export function NotComputed({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-inset border border-line rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Ban size={12} strokeWidth={2} className="text-ink-3" aria-hidden />
        <span className="label">{title}</span>
      </div>
      <ul className="space-y-1">
        {items.map((t, i) => (
          <li key={i} className="text-[11px] text-ink-3 leading-relaxed">{t}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── Charts ──────────────────────────────────────────────────────────────────

export interface YearPoint { year: string; value: number }

/**
 * Compact year-by-year bar chart for annual fundamentals.
 *
 * Bars are positioned by fiscal year across the full `years` axis, so a year
 * a series doesn't report leaves a visible gap rather than silently closing
 * up — the shape of the history stays truthful. Handles negative values with
 * a zero baseline so a loss-making year reads as below the line, not as a
 * small positive bar.
 */
export function YearBars({
  years, points, format, height = 64,
}: {
  years: string[];
  points: YearPoint[];
  format: (v: number) => string;
  height?: number;
}) {
  if (points.length === 0 || years.length === 0) return null;

  const byYear = new Map(points.map((p) => [p.year, p.value]));
  const values = points.map((p) => p.value);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const span = maxV - minV || 1;

  // Fixed-geometry viewBox scaled by CSS — keeps bar widths even regardless of
  // how many fiscal years the API returned.
  const SLOT = 10;
  const BAR = 7;
  const W = years.length * SLOT;
  const zeroY = (maxV / span) * height; // y of the value 0

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }} className="w-full block" role="img"
           aria-label={`Fiscal year history, ${points[0].year} to ${points[points.length - 1].year}`}>
        <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--color-line-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {years.map((year, i) => {
          const x = i * SLOT + (SLOT - BAR) / 2;
          const v = byYear.get(year);
          if (v === undefined) {
            // Honest gap: a dashed tick, never a zero-height bar that would
            // read as "this year was flat".
            return (
              <line
                key={year} x1={x + BAR / 2} y1={zeroY - 4} x2={x + BAR / 2} y2={zeroY + 4}
                stroke="var(--color-line-2)" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke"
              >
                <title>{`FY${year}: not reported`}</title>
              </line>
            );
          }
          const valueY = ((maxV - v) / span) * height;
          const y = Math.min(zeroY, valueY);
          const h = Math.max(1, Math.abs(valueY - zeroY));
          return (
            <rect
              key={year} x={x} y={y} width={BAR} height={h}
              fill={v >= 0 ? "var(--color-up)" : "var(--color-down)"} opacity={0.75}
            >
              <title>{`FY${year}: ${format(v)}`}</title>
            </rect>
          );
        })}
      </svg>
      {/* Fiscal-year axis — thinned on mobile so labels never collide */}
      <div className="flex mt-1.5">
        {years.map((year, i) => (
          <div key={year} className="flex-1 min-w-0 text-center">
            <span className={`text-[8px] text-ink-3 num ${i % 2 === 1 ? "hidden sm:inline" : ""}`}>
              {year.slice(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Full-width closing-price line. Deliberately not the shared `Sparkline`
 * primitive: that one is fixed-pixel by design for dense table rows, so a
 * research-view chart built on it overflows its container instead of
 * scaling. Uses a viewBox with non-scaling strokes so the line stays crisp
 * at any container width.
 */
export function PriceLine({
  points, height = 80,
}: {
  points: Array<{ date: string; close: number }>;
  height?: number;
}) {
  if (points.length < 5) return null;

  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const W = 1000;
  const step = W / (points.length - 1);
  const y = (v: number) => ((max - v) / range) * height;

  const line = points.map((p, i) => `${(i * step).toFixed(1)},${y(p.close).toFixed(2)}`).join(" ");
  const area = `0,${height} ${line} ${W},${height}`;
  const up = closes[closes.length - 1] >= closes[0];
  const stroke = up ? "var(--color-up-2)" : "var(--color-down-2)";

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }}
      className="w-full block" role="img"
      aria-label={`Closing price from ${points[0].date} to ${points[points.length - 1].date}`}
    >
      <polygon points={area} fill={stroke} opacity={0.07} />
      <polyline
        points={line} fill="none" stroke={stroke} strokeWidth={1.4}
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * A value's position inside a low→high band (Bollinger, 52-week closing
 * range). Communicates "where in the range are we" far faster than three
 * separate numbers.
 */
export function RangeMeter({
  low, high, value, lowLabel, highLabel, valueLabel, mid,
}: {
  low: number;
  high: number;
  value: number;
  lowLabel: string;
  highLabel: string;
  valueLabel: string;
  /** Optional middle reference (e.g. the Bollinger 20-day mean). */
  mid?: number | null;
}) {
  const span = high - low || 1;
  const pct = Math.min(100, Math.max(0, ((value - low) / span) * 100));
  const midPct = mid != null ? Math.min(100, Math.max(0, ((mid - low) / span) * 100)) : null;

  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-line-2/60 mt-1">
        {midPct !== null && (
          <div className="absolute top-[-3px] bottom-[-3px] w-px bg-ink-3/70" style={{ left: `${midPct}%` }} title="20-day mean" />
        )}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-ink border border-surface"
          style={{ left: `${pct}%` }}
          title={valueLabel}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] num">
        <span className="text-ink-3">{lowLabel}</span>
        <span className="text-ink font-medium">{valueLabel}</span>
        <span className="text-ink-3">{highLabel}</span>
      </div>
    </div>
  );
}

/** Horizontal comparison bars — used for P/E vs sector vs market proxy. */
export function CompareBars({
  rows,
}: {
  rows: Array<{ label: string; value: number | null; sub?: string; emphasis?: boolean; unavailable?: string }>;
}) {
  const max = Math.max(...rows.map((r) => r.value ?? 0), 0.0001);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className={`text-[11px] truncate ${r.emphasis ? "text-ink font-semibold" : "text-ink-2"}`}>{r.label}</span>
            {r.value !== null ? (
              <span className={`text-[13px] num tabular-nums shrink-0 ${r.emphasis ? "text-ink font-bold" : "text-ink-2 font-medium"}`}>
                {r.value.toFixed(2)}×
              </span>
            ) : (
              <span className="text-[11px] text-ink-3 shrink-0">{DASH}</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-line-2/50 overflow-hidden">
            {r.value !== null && (
              <div
                className={`h-full rounded-full ${r.emphasis ? "bg-up" : "bg-ink-3/60"}`}
                style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
              />
            )}
          </div>
          {(r.sub || r.unavailable) && (
            <div className="text-[10px] text-ink-3 mt-1 leading-snug">{r.sub ?? r.unavailable}</div>
          )}
        </div>
      ))}
    </div>
  );
}
