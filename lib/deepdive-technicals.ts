/**
 * Deep Dive supplementary technical indicators — deterministic, close/volume
 * only, computed from the SAME `EODPoint[]` history as lib/technicals.ts.
 *
 * Deliberately a separate file with its own tiny EMA/SMA helpers rather than
 * importing from lib/technicals.ts: the Technical Score algorithm in that
 * file must stay untouched, and keeping Deep Dive's additions in a file that
 * never imports from or modifies technicals.ts makes that easy to verify —
 * `git diff lib/technicals.ts` for this feature is empty by construction.
 *
 * None of this feeds into Technical Score. It's supplementary context for
 * the Deep Dive page only.
 *
 * Historical data gap: PSX's EOD feed gives close/open/volume only, no daily
 * high/low. That rules out ADX, ATR and anything wick-based (real candlestick
 * patterns, true intraday support/resistance) — see AGENTS.md. Everything
 * below is close-based only, and named accordingly (e.g. "closing range",
 * not "support/resistance") so it never implies data we don't have.
 */

import type { EODPoint } from "./psx";

const round2 = (n: number) => parseFloat(n.toFixed(2));

/** EMA over a price series (oldest first). Indices before the seed are NaN.
 *  Intentionally duplicated from lib/technicals.ts (not imported) — see the
 *  file banner above for why. */
function calcEMA(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;

  const k = 2 / (period + 1);
  let sma = 0;
  for (let i = 0; i < period; i++) sma += values[i];
  out[period - 1] = sma / period;

  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function popStdev(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

// ─── MACD (12, 26, 9) ────────────────────────────────────────────────────────

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: "bullish" | "bearish" | "neutral"; // sign of the histogram
}

/** Standard MACD(12,26,9). `closes` must be oldest-first. Needs at least
 *  ~35 sessions (26 to seed the slow EMA, 9 more to seed the signal line). */
export function calcMACD(closes: number[]): MACDResult | null {
  if (closes.length < 35) return null;

  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = closes.map((_, i) =>
    Number.isFinite(ema12[i]) && Number.isFinite(ema26[i]) ? ema12[i] - ema26[i] : NaN
  );

  const validStart = macdLine.findIndex((v) => Number.isFinite(v));
  if (validStart < 0) return null;
  const macdValid = macdLine.slice(validStart);
  if (macdValid.length < 9) return null;

  const signalSeries = calcEMA(macdValid, 9);
  const lastIdx = macdValid.length - 1;
  if (!Number.isFinite(signalSeries[lastIdx])) return null;

  const macd = macdValid[lastIdx];
  const signal = signalSeries[lastIdx];
  const histogram = macd - signal;

  return {
    macd: round2(macd),
    signal: round2(signal),
    histogram: round2(histogram),
    trend: histogram > 0 ? "bullish" : histogram < 0 ? "bearish" : "neutral",
  };
}

// ─── SMA200 ──────────────────────────────────────────────────────────────────

/** Simple 200-day moving average of closes. Needs 200 sessions of history. */
export function calcSMA200(closes: number[]): number | null {
  if (closes.length < 200) return null;
  const window = closes.slice(closes.length - 200);
  return round2(window.reduce((a, b) => a + b, 0) / 200);
}

// ─── Bollinger Bands (20, 2) ─────────────────────────────────────────────────

export interface BollingerBands {
  middle: number; // 20-day SMA
  upper: number;  // middle + 2·σ
  lower: number;  // middle - 2·σ
  bandwidthPct: number; // (upper-lower)/middle × 100 — squeeze/expansion context
  /** %B: where price sits within the bands, 0 = lower band, 1 = upper band.
   *  Can go outside [0,1] when price is outside the bands entirely. Null
   *  only in the degenerate case where the bands have zero width. */
  percentB: number | null;
}

/** Bollinger Bands using population standard deviation (John Bollinger's
 *  original spec), not the sample stdev used elsewhere in this codebase for
 *  return-volatility — these are two different, both-correct conventions. */
export function calcBollingerBands(closes: number[], period = 20, mult = 2): BollingerBands | null {
  if (closes.length < period) return null;

  const window = closes.slice(closes.length - period);
  const middle = window.reduce((a, b) => a + b, 0) / period;
  const sd = popStdev(window);
  const upper = middle + mult * sd;
  const lower = middle - mult * sd;
  const price = closes[closes.length - 1];
  const bandwidthPct = middle > 0 ? ((upper - lower) / middle) * 100 : 0;
  const percentB = upper > lower ? (price - lower) / (upper - lower) : null;

  return {
    middle: round2(middle),
    upper: round2(upper),
    lower: round2(lower),
    bandwidthPct: round2(bandwidthPct),
    percentB: percentB !== null ? round2(percentB) : null,
  };
}

// ─── Max drawdown ────────────────────────────────────────────────────────────

export interface DrawdownResult {
  maxDrawdownPct: number; // positive number, e.g. 32.4 means a 32.4% peak-to-trough decline
  peakDate: string;
  troughDate: string;
  lookbackSessions: number; // actual sessions used — may be less than requested
}

/** Max peak-to-trough decline in closing price over the trailing window.
 *  `history` must be newest-first (as returned by lib/psx.ts getHistory). */
export function calcMaxDrawdown(history: EODPoint[], lookbackSessions = 252): DrawdownResult | null {
  if (history.length < 20) return null;

  const window = history.slice(0, Math.min(lookbackSessions, history.length));
  const oldest = [...window].reverse();

  let peak = oldest[0].price;
  let peakDate = oldest[0].date;
  let maxDD = 0;
  let ddPeakDate = peakDate;
  let ddTroughDate = peakDate;

  for (const pt of oldest) {
    if (pt.price > peak) {
      peak = pt.price;
      peakDate = pt.date;
    }
    const dd = peak > 0 ? (peak - pt.price) / peak : 0;
    if (dd > maxDD) {
      maxDD = dd;
      ddPeakDate = peakDate;
      ddTroughDate = pt.date;
    }
  }

  return {
    maxDrawdownPct: round2(maxDD * 100),
    peakDate: ddPeakDate,
    troughDate: ddTroughDate,
    lookbackSessions: oldest.length,
  };
}

// ─── Closing-price range (NOT wick-based support/resistance) ────────────────

export interface ClosingRange52w {
  high: number;
  low: number;
  /** Negative when price is below the closing high, e.g. -8.2 = 8.2% below it. */
  distanceFromHighPct: number;
  /** Positive when price is above the closing low. */
  distanceFromLowPct: number;
  lookbackSessions: number;
}

/** High/low of the CLOSING price over the trailing window — an honest
 *  approximation of a 52-week range given we have no daily high/low, but
 *  explicitly not "support/resistance": real support/resistance is normally
 *  read off intraday wicks, which this data source doesn't provide. */
export function calcClosingRange(history: EODPoint[], lookbackSessions = 252): ClosingRange52w | null {
  if (history.length < 20) return null;

  const window = history.slice(0, Math.min(lookbackSessions, history.length));
  const closes = window.map((p) => p.price);
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const price = closes[0]; // newest-first

  return {
    high: round2(high),
    low: round2(low),
    distanceFromHighPct: high > 0 ? round2(((price - high) / high) * 100) : 0,
    distanceFromLowPct: low > 0 ? round2(((price - low) / low) * 100) : 0,
    lookbackSessions: window.length,
  };
}

// ─── Liquidity ───────────────────────────────────────────────────────────────

export interface LiquidityMetric {
  /** Average daily traded value in PKR (avg volume × avg price over the
   *  window) — a traded-VALUE proxy. Not order-book depth or spread, which
   *  this data source has no way to measure. */
  avgDailyValueTraded: number;
  avgVolume: number;
  lookbackSessions: number;
}

export function calcLiquidity(history: EODPoint[], lookbackSessions = 20): LiquidityMetric | null {
  if (history.length < 5) return null;

  const window = history.slice(0, Math.min(lookbackSessions, history.length));
  const avgVolume = window.reduce((a, p) => a + p.volume, 0) / window.length;
  const avgPrice = window.reduce((a, p) => a + p.price, 0) / window.length;

  return {
    avgDailyValueTraded: Math.round(avgVolume * avgPrice),
    avgVolume: Math.round(avgVolume),
    lookbackSessions: window.length,
  };
}

// ─── Consolidated bundle ─────────────────────────────────────────────────────

export interface SupplementaryTechnicals {
  sma200: number | null;
  macd: MACDResult | null;
  bollinger: BollingerBands | null;
  drawdown1y: DrawdownResult | null;
  closingRange52w: ClosingRange52w | null;
  liquidity: LiquidityMetric | null;
  /** Trading date these were computed against (the latest session in `history`). */
  asOfDate: string;
}

/** Compute every supplementary indicator in one pass. `history` must be
 *  newest-first, as returned by lib/psx.ts getHistory. Returns null only
 *  when there's no history at all — each individual field degrades to null
 *  independently when there isn't enough runway for that specific indicator,
 *  rather than failing the whole bundle. */
export function computeSupplementaryTechnicals(history: EODPoint[]): SupplementaryTechnicals | null {
  if (history.length === 0) return null;

  const oldest = [...history].reverse();
  const closes = oldest.map((d) => d.price);

  return {
    sma200: calcSMA200(closes),
    macd: calcMACD(closes),
    bollinger: calcBollingerBands(closes),
    drawdown1y: calcMaxDrawdown(history, 252),
    closingRange52w: calcClosingRange(history, 252),
    liquidity: calcLiquidity(history, 20),
    asOfDate: history[0].date,
  };
}
