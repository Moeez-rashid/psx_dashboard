"use client";
import { useMemo, useState } from "react";
import { ChartSpline } from "lucide-react";
import type { DeepDivePricePoint } from "@/lib/deepdive";
import type { ClosingRangeWindow, PriceBehavior } from "@/lib/price-behavior";
import { Section, Tag, Unavailable, RangeMeter, DASH } from "./shared";

/**
 * "Where has this stock actually been trading, and where is it now inside
 * that band?" — one interactive chart plus a compact multi-period range
 * summary, both reading the SAME deterministic numbers from
 * lib/price-behavior.ts. Nothing here recomputes a low, a high or a position.
 *
 * The lookback control drives the chart window AND the summary together on
 * purpose: the chart is then literally a picture of the band the numbers
 * below describe, instead of two periods the reader has to reconcile.
 *
 * Every figure is a CLOSING price. The PSX EOD feed has no daily high/low, so
 * these bands cannot be, and are never called, support or resistance — see
 * the note rendered at the end of the section, which stays on the page rather
 * than being tucked into a tooltip.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-08" → "8 Sep 2026". Deliberately not toLocaleDateString: this
 *  renders on the server and again on the client, and a locale- or
 *  timezone-dependent format would produce a hydration mismatch. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  if (!y || Number.isNaN(mi) || !MONTHS[mi]) return iso;
  return `${Number(d)} ${MONTHS[mi]} ${y}`;
}

const fmtPrice = (v: number) => v.toFixed(2);

function breadthSentence(shortLabel: string, longLabel: string, ratioPct: number, breadth: string): string {
  const tail =
    breadth === "narrower"
      ? "recent closes have stayed inside a materially narrower band than the longer lookback."
      : breadth === "broader"
        ? "recent closes already cover most of the longer band."
        : "the two bands are comparable in width.";
  return `The ${shortLabel} range spans ${ratioPct}% of the ${longLabel} range — ${tail}`;
}

export default function PriceBehaviorSection({
  behavior, priceSeries,
}: {
  behavior: PriceBehavior;
  priceSeries: DeepDivePricePoint[];
}) {
  const windows = behavior.windows;
  const [selectedLabel, setSelectedLabel] = useState<string>(() => {
    if (windows.some((w) => w.label === "30D")) return "30D";
    return windows[windows.length - 1]?.label ?? "";
  });

  const selected: ClosingRangeWindow | null =
    windows.find((w) => w.label === selectedLabel) ?? windows[windows.length - 1] ?? null;

  // Same sanitising rule as lib/price-behavior.ts, so the chart can never
  // plot a point the range figures excluded.
  const cleanSeries = useMemo(
    () => priceSeries.filter((p) => Number.isFinite(p.close) && p.close > 0),
    [priceSeries]
  );
  // priceSeries is oldest→newest; a window is the newest N sessions.
  const chartPoints = selected ? cleanSeries.slice(-selected.sessions) : [];

  return (
    <Section
      icon={ChartSpline}
      title="Price behaviour"
      kicker="Where this stock has actually been trading. Closing prices only, counted in trading sessions rather than calendar days."
      aside={
        behavior.totalSessions > 0
          ? <Tag title="Usable closing-price sessions available for this ticker">{behavior.totalSessions} sessions</Tag>
          : undefined
      }
    >
      {!behavior.available || !selected ? (
        <Unavailable>
          {behavior.unavailableReason ?? "No closing-price ranges could be computed for this ticker."}
        </Unavailable>
      ) : (
        <>
          {/* Lookback control — each option carries its own range, so the
              control doubles as the multi-period comparison. */}
          <div
            role="group"
            aria-label="Closing-range lookback period"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"
          >
            {windows.map((w) => {
              const active = w.label === selected.label;
              return (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => setSelectedLabel(w.label)}
                  aria-pressed={active}
                  title={`${w.sessions} trading sessions, ${fmtDate(w.fromDate)} to ${fmtDate(w.toDate)}`}
                  className={`flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left cursor-pointer transition-colors
                    outline-none focus-visible:ring-1 focus-visible:ring-up/70 focus-visible:border-up/60
                    ${active
                      ? "border-up/50 bg-up-dim text-ink"
                      : "border-line bg-inset hover:border-line-2"}`}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${active ? "text-up-2" : "text-ink-3"}`}>
                    {w.label}
                  </span>
                  <span className="text-[11px] num tabular-nums text-ink whitespace-nowrap">
                    {fmtPrice(w.low)}–{fmtPrice(w.high)}
                  </span>
                  <span className="text-[10px] num text-ink-3">{w.widthPct.toFixed(1)}% wide</span>
                </button>
              );
            })}
          </div>

          {behavior.comparison && (
            <p className="text-[11px] text-ink-2 mt-2.5 leading-relaxed">
              {breadthSentence(
                behavior.comparison.shortLabel,
                behavior.comparison.longLabel,
                behavior.comparison.ratioPct,
                behavior.comparison.breadth
              )}
            </p>
          )}

          {/* Chart + the selected window's numbers, together in one card. */}
          <div className="mt-4 bg-inset border border-line rounded-lg px-3 py-3">
            <ClosingPriceChart points={chartPoints} window={selected} />

            <div className="mt-4 max-w-xl">
              {selected.positionPct !== null ? (
                <RangeMeter
                  low={selected.low}
                  high={selected.high}
                  value={selected.current}
                  lowLabel={`Low ${fmtPrice(selected.low)}`}
                  highLabel={`High ${fmtPrice(selected.high)}`}
                  valueLabel={fmtPrice(selected.current)}
                />
              ) : (
                <p className="text-[11px] text-ink-3 leading-relaxed">
                  Every close in this window was {fmtPrice(selected.low)} — the band has no width, so a position within it is undefined.
                </p>
              )}
            </div>

            <dl className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-[11px]">
              <Stat
                label="Position in range"
                value={selected.positionPct !== null ? `${selected.positionPct.toFixed(0)}%` : DASH}
                hint={selected.positionPct !== null ? "0% = at the window low, 100% = at the window high" : "Undefined for a zero-width band"}
              />
              <Stat label="Range width" value={`${selected.widthPct.toFixed(1)}%`} hint="Of the window low" />
              <Stat label="Above the low" value={`+${selected.distanceFromLowPct.toFixed(1)}%`} />
              <Stat label="Below the high" value={`${selected.distanceFromHighPct.toFixed(1)}%`} />
            </dl>
          </div>

          <p className="text-[10px] text-ink-3 mt-3 leading-relaxed">
            Highs and lows of <strong className="text-ink-2 font-medium">closing prices</strong> over the last {selected.sessions} trading
            sessions ({fmtDate(selected.fromDate)} – {fmtDate(selected.toDate)}). The PSX end-of-day feed carries no daily high or low,
            so these are not intraday extremes and are not support or resistance levels. They describe where the stock has traded;
            they are not targets and say nothing about where it trades next.
          </p>
        </>
      )}
    </Section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.06em] text-ink-3">{label}</dt>
      <dd className="text-[12px] num tabular-nums text-ink font-medium" title={hint}>{value}</dd>
    </div>
  );
}

/**
 * Closing-price line for one window.
 *
 * Hand-rolled SVG rather than a charting dependency: the whole chart is a
 * polyline, two guide lines and a crosshair, and the existing bundle already
 * draws every other Deep Dive visual the same way.
 *
 * The readout sits ABOVE the chart as fixed text instead of a floating
 * tooltip, so the price for a session is reachable without a mouse — it shows
 * the latest session by default, follows the pointer on hover, and follows
 * the arrow keys when the chart has focus.
 */
function ClosingPriceChart({ points, window: w }: { points: DeepDivePricePoint[]; window: ClosingRangeWindow }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;

  const geometry = useMemo(() => {
    if (n < 2) return null;
    const closes = points.map((p) => p.close);
    const dataMin = Math.min(...closes);
    const dataMax = Math.max(...closes);
    const spread = dataMax - dataMin;
    // Padding keeps the line and the guide lines off the frame edge; the
    // fallback covers a perfectly flat window, where spread is 0.
    const pad = spread > 0 ? spread * 0.12 : Math.max(dataMax * 0.01, 0.5);
    const yMin = dataMin - pad;
    const yMax = dataMax + pad;
    const range = yMax - yMin || 1;
    const xFrac = (i: number) => (n <= 1 ? 0.5 : i / (n - 1));
    const yFrac = (v: number) => (yMax - v) / range;
    const W = 1000, H = 100;
    const line = points.map((p, i) => `${(xFrac(i) * W).toFixed(2)},${(yFrac(p.close) * H).toFixed(2)}`).join(" ");
    return {
      W, H, xFrac, yFrac, line,
      area: `0,${H} ${line} ${W},${H}`,
      rising: closes[n - 1] >= closes[0],
    };
  }, [points, n]);

  if (!geometry) {
    return <p className="text-[11px] text-ink-3">Not enough sessions in this window to draw a chart.</p>;
  }

  const { W, H, xFrac, yFrac, line, area, rising } = geometry;
  const stroke = rising ? "var(--color-up-2)" : "var(--color-down-2)";
  const activeIndex = hover !== null ? Math.min(Math.max(hover, 0), n - 1) : n - 1;
  const active = points[activeIndex];

  const pointerToIndex = (clientX: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    if (rect.width === 0) return 0;
    const frac = (clientX - rect.left) / rect.width;
    return Math.round(Math.min(1, Math.max(0, frac)) * (n - 1));
  };

  const nudge = (delta: number) => setHover((h) => Math.min(n - 1, Math.max(0, (h ?? n - 1) + delta)));

  return (
    <div>
      {/* Readout — the primary way to read a price, mouse or not. */}
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-[10px] uppercase tracking-[0.08em] text-ink-3">
          {w.label} closing range
        </span>
        <span className="text-[11px] num tabular-nums text-ink-2" aria-live="polite">
          <span className="text-ink-3">{fmtDate(active.date)}</span>
          <span className="mx-1.5 text-line-2">|</span>
          <span className="text-ink font-medium">
            <span className="text-ink-3 font-normal text-[0.85em] mr-0.5">PKR</span>
            {fmtPrice(active.close)}
          </span>
        </span>
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-label={`Closing price chart, ${w.label} window. ${n} sessions from ${fmtDate(w.fromDate)} to ${fmtDate(w.toDate)}. Lowest close ${fmtPrice(w.low)}, highest ${fmtPrice(w.high)}, latest ${fmtPrice(w.current)} PKR. Use the left and right arrow keys to read individual sessions.`}
        onMouseMove={(e) => setHover(pointerToIndex(e.clientX, e.currentTarget))}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-1); }
          else if (e.key === "ArrowRight") { e.preventDefault(); nudge(1); }
          else if (e.key === "Home") { e.preventDefault(); setHover(0); }
          else if (e.key === "End") { e.preventDefault(); setHover(n - 1); }
          else if (e.key === "Escape") setHover(null);
        }}
        className="relative h-[140px] sm:h-[180px] rounded outline-none focus-visible:ring-1 focus-visible:ring-up/60 cursor-crosshair"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          className="w-full h-full block overflow-visible" aria-hidden
        >
          {/* Window low / high guide lines — the band's edges, labelled in the
              overlay below rather than as SVG text, which this viewBox would stretch. */}
          <line
            x1={0} y1={yFrac(w.high) * H} x2={W} y2={yFrac(w.high) * H}
            stroke="var(--color-line-2)" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke"
          />
          <line
            x1={0} y1={yFrac(w.low) * H} x2={W} y2={yFrac(w.low) * H}
            stroke="var(--color-line-2)" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke"
          />

          <polygon points={area} fill={stroke} opacity={0.07} />
          <polyline
            points={line} fill="none" stroke={stroke} strokeWidth={1.4}
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          />

          {/* Crosshair at the active session. */}
          <line
            x1={xFrac(activeIndex) * W} y1={0} x2={xFrac(activeIndex) * W} y2={H}
            stroke="var(--color-ink-3)" strokeWidth={1} opacity={0.55} vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* HTML overlay: circles and text keep their shape here, where the
            non-uniform viewBox scaling can't distort them. */}
        <div className="absolute inset-0 pointer-events-none">
          <span
            className="absolute right-0 -translate-y-1/2 text-[9px] num text-ink-3 bg-inset px-1 rounded"
            style={{ top: `${yFrac(w.high) * 100}%` }}
          >
            {fmtPrice(w.high)}
          </span>
          <span
            className="absolute right-0 -translate-y-1/2 text-[9px] num text-ink-3 bg-inset px-1 rounded"
            style={{ top: `${yFrac(w.low) * 100}%` }}
          >
            {fmtPrice(w.low)}
          </span>
          <span
            className="absolute w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink border border-surface"
            style={{ left: `${xFrac(activeIndex) * 100}%`, top: `${yFrac(active.close) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-ink-3 num mt-1.5">
        <span>{fmtDate(points[0].date)}</span>
        <span>{fmtDate(points[n - 1].date)}</span>
      </div>
    </div>
  );
}
