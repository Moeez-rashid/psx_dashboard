/**
 * Deterministic closing-price range context for Deep Dive.
 *
 * Answers one question: "where has this stock actually been trading, and
 * where is it now inside that band?" — computed from the same EOD history
 * every other Deep Dive calculation reads, with no new data source.
 *
 * Naming is deliberate and load-bearing. These are ranges of CLOSING PRICES.
 * PSX's EOD feed carries close/open/volume and no daily high/low (see
 * AGENTS.md), so intraday extremes — the wicks real support/resistance is
 * read off — do not exist in our data at all. Nothing here may be renamed
 * support, resistance, a floor, a ceiling or a target: a closing range says
 * where price has been, never where it will go or where it "should" turn.
 *
 * Windows are counted in TRADING SESSIONS, not calendar days. "30D" means
 * the last 30 sessions in the feed, which spans roughly six calendar weeks.
 * A window is only reported when the history can actually fill it, so a
 * ticker with 40 sessions gets 5D/20D/30D and no 60D — rather than three
 * identical rows labelled 60D, 120D and 1Y that would all silently be the
 * same 40 sessions.
 *
 * This is the single source of these facts. The Deep Dive UI, the chart and
 * the AI evidence digest all read this module's output; none of them
 * recompute a low, a high or a position from a price series themselves.
 */

import type { EODPoint } from "./psx";

const round2 = (n: number) => parseFloat(n.toFixed(2));

/** Lookback windows offered, in trading sessions. 252 ≈ one trading year. */
const STANDARD_WINDOWS: Array<{ label: string; sessions: number }> = [
  { label: "5D", sessions: 5 },
  { label: "20D", sessions: 20 },
  { label: "30D", sessions: 30 },
  { label: "60D", sessions: 60 },
  { label: "120D", sessions: 120 },
  { label: "1Y", sessions: 252 },
];

/** Windows compared to describe whether recent trading has been confined to
 *  a narrow part of the longer band. Both must be present for a verdict. */
const COMPARISON_SHORT = "30D";
const COMPARISON_LONG = "120D";

export interface ClosingRangeWindow {
  /** "30D" — D counts trading sessions, never calendar days. */
  label: string;
  /** Sessions this window covers. Always equal to what the label implies:
   *  a window that could not be filled from history is omitted, not shortened. */
  sessions: number;
  /** Lowest CLOSING price in the window. Not an intraday low, not support. */
  low: number;
  /** Highest CLOSING price in the window. Not an intraday high, not resistance. */
  high: number;
  /** Latest close — identical across every window, repeated for convenience. */
  current: number;
  /** (high − low) ÷ low × 100. How wide the band is relative to its own floor. */
  widthPct: number;
  /** (current − low) ÷ (high − low) × 100. Null when high === low: with a
   *  zero-width band the position is genuinely undefined, and 0/100/50 would
   *  each be an invention. */
  positionPct: number | null;
  /** (current − low) ÷ low × 100. Zero or positive by construction. */
  distanceFromLowPct: number;
  /** (current − high) ÷ high × 100. Zero or negative by construction. */
  distanceFromHighPct: number;
  /** Oldest session in the window. */
  fromDate: string;
  /** Newest session in the window (the latest session overall). */
  toDate: string;
}

/** How much of the longer band the recent one occupies. Descriptive of the
 *  two windows as they stand — NOT a trend, a regime call or a forecast. */
export type RangeBreadth = "narrower" | "similar" | "broader";

export interface RangeComparison {
  shortLabel: string;
  longLabel: string;
  /** (high−low) of the short window ÷ (high−low) of the long window.
   *  Always within [0,1]: the short window is a subset of the long one, so
   *  its extremes can never sit outside the longer window's extremes. */
  ratio: number;
  /** Same number as a percentage, rounded — what the UI and digest quote. */
  ratioPct: number;
  breadth: RangeBreadth;
}

export interface PriceBehavior {
  available: boolean;
  /** Why there are no windows, when there are none. */
  unavailableReason: string | null;
  windows: ClosingRangeWindow[];
  comparison: RangeComparison | null;
  latestClose: number | null;
  latestDate: string | null;
  /** Usable sessions found in the history (after dropping unusable rows). */
  totalSessions: number;
}

/** ratio ≤ this ⇒ the recent band is a materially smaller slice of the longer one. */
const NARROW_RATIO = 0.4;
/** ratio ≥ this ⇒ the recent band already covers nearly the whole longer one. */
const BROAD_RATIO = 0.85;

function classifyBreadth(ratio: number): RangeBreadth {
  if (ratio <= NARROW_RATIO) return "narrower";
  if (ratio >= BROAD_RATIO) return "broader";
  return "similar";
}

/**
 * One window's facts, or null when `history` cannot fill it.
 *
 * `history` must be newest-first (as lib/psx.ts getHistory returns) and
 * already sanitised — see computePriceBehavior, which is the only intended
 * caller and does that filtering once for every window.
 */
export function computeClosingRangeWindow(
  history: EODPoint[],
  sessions: number,
  label: string
): ClosingRangeWindow | null {
  if (sessions < 2 || history.length < sessions) return null;

  const window = history.slice(0, sessions);
  const closes = window.map((p) => p.price);
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const current = closes[0]; // newest-first

  // Guarded rather than assumed: a zero or negative low would turn every
  // percentage below into Infinity or a nonsense sign. Sanitisation upstream
  // should make this unreachable; if it ever isn't, report no window rather
  // than a poisoned one.
  if (!(low > 0) || !Number.isFinite(high) || !Number.isFinite(current)) return null;

  const span = high - low;

  return {
    label,
    sessions,
    low: round2(low),
    high: round2(high),
    current: round2(current),
    widthPct: round2((span / low) * 100),
    positionPct: span > 0 ? round2(((current - low) / span) * 100) : null,
    distanceFromLowPct: round2(((current - low) / low) * 100),
    distanceFromHighPct: round2(((current - high) / high) * 100),
    fromDate: window[window.length - 1].date,
    toDate: window[0].date,
  };
}

/**
 * Full price-behaviour bundle for one ticker's history (newest-first).
 *
 * Degrades a window at a time rather than all-or-nothing: a ticker with 40
 * sessions still gets its 5D/20D/30D ranges and simply has no longer ones.
 */
export function computePriceBehavior(history: EODPoint[]): PriceBehavior {
  // Drop rows the feed occasionally returns with a null/NaN/zero close, so no
  // downstream figure can become NaN or Infinity. Order is preserved.
  const clean = history.filter((p) => Number.isFinite(p.price) && p.price > 0);
  const latestClose = clean.length > 0 ? round2(clean[0].price) : null;
  const latestDate = clean.length > 0 ? clean[0].date : null;

  if (clean.length < 2) {
    return {
      available: false,
      unavailableReason:
        clean.length === 0
          ? "No usable closing-price history is available for this ticker."
          : "Only one session of closing-price history is available — a range needs at least two.",
      windows: [],
      comparison: null,
      latestClose,
      latestDate,
      totalSessions: clean.length,
    };
  }

  const windows = STANDARD_WINDOWS
    .map((w) => computeClosingRangeWindow(clean, w.sessions, w.label))
    .filter((w): w is ClosingRangeWindow => w !== null);

  // Shorter history than the smallest standard window: report the one honest
  // window we can — everything available — labelled with its real session
  // count so it can't be mistaken for a standard period.
  if (windows.length === 0) {
    const all = computeClosingRangeWindow(clean, clean.length, `${clean.length}D`);
    if (all) windows.push(all);
  }

  const short = windows.find((w) => w.label === COMPARISON_SHORT);
  const long = windows.find((w) => w.label === COMPARISON_LONG);
  let comparison: RangeComparison | null = null;
  if (short && long) {
    const longSpan = long.high - long.low;
    if (longSpan > 0) {
      // Clamped only against floating-point drift: a subset window's span
      // cannot mathematically exceed its superset's.
      const ratio = Math.min(1, Math.max(0, (short.high - short.low) / longSpan));
      comparison = {
        shortLabel: short.label,
        longLabel: long.label,
        ratio: parseFloat(ratio.toFixed(4)),
        ratioPct: Math.round(ratio * 100),
        breadth: classifyBreadth(ratio),
      };
    }
  }

  return {
    available: windows.length > 0,
    unavailableReason: windows.length > 0 ? null : "Closing-price ranges could not be computed from the available history.",
    windows,
    comparison,
    latestClose,
    latestDate,
    totalSessions: clean.length,
  };
}
