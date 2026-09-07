import { ChartColumn } from "lucide-react";
import type { DeepDiveFundamentalHistory } from "@/lib/deepdive";
import { Section, Tag, Unavailable, YearBars, fmtNum, fmtSignedPercent, signTone, type YearPoint } from "./shared";

/**
 * The multi-year view — the part that turns a snapshot into a trend.
 *
 * Deliberately charts rather than tabulates: fourteen fiscal years of five
 * metrics as a table is 70 numbers nobody reads. Each series shows its
 * latest value with the direction against the prior reported year, and any
 * fiscal year a series doesn't cover is drawn as a gap (see YearBars) rather
 * than interpolated or zero-filled.
 */

/** Formats a year-on-year delta with exactly one sign: some series format
 *  themselves as signed percentages already, others (EPS, DPS) don't. */
function signedDelta(delta: number, format: (v: number) => string): string {
  const formatted = format(delta);
  return /^[+-]/.test(formatted) ? formatted : `${delta >= 0 ? "+" : ""}${formatted}`;
}

function Trend({ points, format }: { points: YearPoint[]; format: (v: number) => string }) {
  if (points.length === 0) return null;
  const latest = points[points.length - 1];
  const prior = points.length > 1 ? points[points.length - 2] : null;
  const delta = prior ? latest.value - prior.value : null;

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[15px] font-semibold num tabular-nums text-ink">{format(latest.value)}</span>
      <span className="text-[10px] text-ink-3 num">FY{latest.year}</span>
      {delta !== null && (
        <span className={`text-[10px] num ${signTone(delta)}`}>
          {signedDelta(delta, format)} vs FY{prior!.year}
        </span>
      )}
    </div>
  );
}

function HistoryChart({
  title, points, years, format, note,
}: {
  title: string;
  points: YearPoint[];
  years: string[];
  format: (v: number) => string;
  note?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="label">{title}</h3>
        {points.length > 0 && <span className="text-[10px] text-ink-3 num">{points.length} yrs</span>}
      </div>
      {points.length === 0 ? (
        <p className="text-[11px] text-ink-3 py-4">Not reported for this company.</p>
      ) : (
        <>
          <div className="mb-2"><Trend points={points} format={format} /></div>
          <YearBars years={years} points={points} format={format} height={56} />
          {note && <p className="text-[10px] text-ink-3 mt-2 leading-snug">{note}</p>}
        </>
      )}
    </div>
  );
}

export default function FundamentalHistorySection({ history }: { history: DeepDiveFundamentalHistory }) {
  const h = history;
  const hasAny = h.eps.length + h.epsGrowth.length + h.dps.length + h.pe.length + h.roe.length > 0;

  const span = h.years.length > 0 ? `FY${h.years[0]}–FY${h.years[h.years.length - 1]}` : null;

  return (
    <Section
      icon={ChartColumn}
      title="Fundamental history"
      kicker="Direction and consistency across reported fiscal years — not a live series."
      aside={span ? <Tag tone="annual" title="Range of fiscal years reported">{span}</Tag> : undefined}
    >
      {!hasAny ? (
        <Unavailable>No multi-year fundamental history is available for this ticker.</Unavailable>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-7">
            <HistoryChart title="Earnings per share" points={h.eps} years={h.years} format={(v) => fmtNum(v, 2)} />
            <HistoryChart title="EPS growth" points={h.epsGrowth} years={h.years} format={(v) => fmtSignedPercent(v, 1)} note="Bars below the line are years earnings shrank." />
            <HistoryChart title="Dividend per share" points={h.dps} years={h.years} format={(v) => fmtNum(v, 2)} />
            <HistoryChart title="Return on equity" points={h.roe} years={h.years} format={(v) => `${v.toFixed(1)}%`} />
            <HistoryChart title="P/E ratio" points={h.pe} years={h.years} format={(v) => `${v.toFixed(2)}×`} note="Historic P/E is computed against each year's own price and earnings." />
          </div>

          <p className="text-[10px] text-ink-3 mt-6 leading-relaxed border-t border-line pt-3">
            Annual figures from company accounts via askanalyst.com.pk. Each bar is one reported fiscal year; dashed marks are years a metric was not reported. These do not update intraday.
          </p>
        </>
      )}
    </Section>
  );
}
