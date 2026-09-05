/**
 * Technical Scoring Engine — deterministic, quantitative, NO AI.
 * ---------------------------------------------------------------------------
 * Input:  EODPoint[] (newest first) from lib/psx.ts
 * Output: TechnicalScore — a reproducible 0-100 "Technical Score" plus the
 *         indicators and plain-English reasons behind it.
 *
 * HARD RULE: nothing in this file may depend on an LLM, news, sentiment or
 * fundamentals (P/E, EPS, ROE...). The same price/volume history must always
 * produce the same score, whichever AI provider the user has configured — or
 * none at all. Fundamental and news reasoning belongs in Deep Dive, elsewhere.
 *
 * ─── SCORE COMPOSITION (weights sum to exactly 100) ────────────────────────
 *   Trend structure ....... 35   EMA20/EMA50 stack, price vs both, EMA20 slope,
 *                                ± a recent-crossover adjustment
 *   Momentum (RSI) ........ 25   regime-aware: the SAME RSI is worth very
 *                                different points in an uptrend vs a downtrend
 *   Volume confirmation ... 20   today vs the average of the PRIOR 20 sessions,
 *                                saturating, and direction-aware
 *   Entry quality ......... 20   distance from EMA20, normalised by the stock's
 *                                own daily volatility
 *
 * Design constraints deliberately applied:
 *   • No component can exceed its cap, so no single indicator can run away
 *     with the score (a 10x volume spike is still worth at most 20 points).
 *   • Trend and crossover are ONE bucket, not two — they measure the same
 *     underlying thing, and scoring them separately double-counted trend.
 *   • Oversold is only rewarded when there is an uptrend to buy back into.
 *   • Extension above EMA20 is penalised, so the ranking does not simply
 *     surface whatever has already run the furthest.
 */

import type { EODPoint } from "./psx";

export interface TechnicalComponents {
  trend: number;      // 0-35
  momentum: number;   // 0-25
  volume: number;     // 0-20
  entry: number;      // 0-20
}

export interface TechnicalScore {
  symbol: string;
  rsi: number;
  ema20: number;
  ema50: number;
  ema20SlopePct: number;      // % change in EMA20 over the last 5 sessions
  currentPrice: number;
  volumeRatio: number;        // today vol / avg volume of the PRIOR 20 sessions
  todayVolume: number;
  avgVolume20d: number;       // average of the prior 20 sessions (excludes today)
  dailyVolatilityPct: number; // stdev of the last 20 daily returns, in %
  extensionPct: number;       // (price − EMA20) / EMA20, in %
  crossoverSignal: "bullish" | "bearish" | "neutral";
  priceVsEma20: "above" | "below";
  priceVsEma50: "above" | "below";
  emaGapPct: number;          // (EMA20 − EMA50) / EMA50, in %
  trendRegime: "uptrend" | "flat" | "recovering" | "downtrend";
  components: TechnicalComponents;
  technicalScore: number;     // 0-100 — the Opportunities ranking metric
  technicalSignal: "STRONG_BUY" | "BUY" | "NEUTRAL" | "AVOID";
  reasons: string[];          // deterministic, generated from the numbers above
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => parseFloat(n.toFixed(1));

/** EMA over a price series (oldest first). Indices before the seed are NaN. */
function calcEMA(prices: number[], period: number): number[] {
  const out: number[] = new Array(prices.length).fill(NaN);
  if (prices.length < period) return out;

  const k = 2 / (period + 1);
  let sma = 0;
  for (let i = 0; i < period; i++) sma += prices[i];
  out[period - 1] = sma / period;

  for (let i = period; i < prices.length; i++) {
    out[i] = prices[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

/** Wilder-smoothed RSI over a price series (oldest first). */
function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return round1(100 - 100 / (1 + avgGain / avgLoss));
}

/**
 * True crossover detection: did EMA20−EMA50 actually change sign within the
 * lookback window? The previous implementation only compared two endpoints,
 * which reported "neutral" for both a months-long uptrend and a months-long
 * downtrend — and then paid the downtrend points for it.
 */
function detectCrossover(
  ema20s: number[],
  ema50s: number[],
  lookback = 10
): "bullish" | "bearish" | "neutral" {
  const len = ema20s.length;
  if (len < lookback + 2) return "neutral";

  const diffNow = ema20s[len - 1] - ema50s[len - 1];
  if (!Number.isFinite(diffNow) || diffNow === 0) return "neutral";

  for (let i = len - lookback - 1; i < len - 1; i++) {
    const d = ema20s[i] - ema50s[i];
    if (!Number.isFinite(d) || d === 0) continue;
    if (Math.sign(d) !== Math.sign(diffNow)) {
      return diffNow > 0 ? "bullish" : "bearish";
    }
  }
  return "neutral";
}

/** Standard deviation of the last `n` daily returns, expressed in percent. */
function dailyVolatility(closes: number[], n = 20): number {
  const rets: number[] = [];
  for (let i = Math.max(1, closes.length - n); i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) rets.push((closes[i] - prev) / prev);
  }
  if (rets.length < 2) return 1.5; // neutral default for PSX
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return round1(Math.sqrt(variance) * 100);
}

/**
 * Score one stock from its EOD history.
 * Returns null when the stock is unscoreable (too little history) or too
 * illiquid to trade — both are data quality gates, not score-zero outcomes.
 */
export function scoreStock(
  symbol: string,
  history: EODPoint[], // newest first
  minAvgVolume = 200_000
): TechnicalScore | null {
  // EMA50 + a 10-session crossover window + a 20-session prior-volume window
  // all need runway; 60 sessions is the shortest history that satisfies each.
  if (history.length < 60) return null;

  const oldest = [...history].reverse();
  const closes = oldest.map((d) => d.price);
  const volumes = oldest.map((d) => d.volume);
  if (closes.some((c) => !Number.isFinite(c) || c <= 0)) return null;

  const ema20s = calcEMA(closes, 20);
  const ema50s = calcEMA(closes, 50);
  const rsi = calcRSI(closes, 14);

  const last = closes.length - 1;
  const currentPrice = closes[last];
  const ema20 = ema20s[last];
  const ema50 = ema50s[last];
  if (!Number.isFinite(ema20) || !Number.isFinite(ema50) || ema20 <= 0) return null;

  // ── Volume: today vs the average of the PRIOR 20 sessions ────────────────
  // Excluding today matters: including it dilutes the very spike we want to
  // detect (a true 3x day reads as ~2.5x when it is inside its own average).
  const priorVols = volumes.slice(Math.max(0, last - 20), last);
  const avgVolume20d =
    priorVols.length > 0
      ? priorVols.reduce((a, b) => a + b, 0) / priorVols.length
      : 0;
  const todayVolume = volumes[last];
  const volumeRatio =
    avgVolume20d > 0 ? round1(todayVolume / avgVolume20d) : 0;

  if (avgVolume20d < minAvgVolume) return null; // illiquid — not tradeable

  const ema20SlopePct =
    Number.isFinite(ema20s[last - 5]) && ema20s[last - 5] > 0
      ? round1(((ema20 - ema20s[last - 5]) / ema20s[last - 5]) * 100)
      : 0;
  const dailyVolatilityPct = dailyVolatility(closes, 20);
  const extensionPct = round1(((currentPrice - ema20) / ema20) * 100);
  const prevClose = closes[last - 1];
  const lastSessionReturnPct =
    prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  const crossoverSignal = detectCrossover(ema20s, ema50s, 10);
  const above20 = currentPrice >= ema20;
  const above50 = currentPrice >= ema50;
  const slopeUp = ema20SlopePct > 0.15;
  const slopeDown = ema20SlopePct < -0.15;

  // A trend only counts when the EMAs are separated by more than day-to-day
  // noise. Testing `ema20 > ema50` alone rated a flat, rangebound stock as a
  // full uptrend whenever the gap was a fraction of a percent — which handed
  // sideways names the maximum trend score.
  const emaGapPct = round1(((ema20 - ema50) / ema50) * 100);
  const trendFloorPct = clamp(dailyVolatilityPct * 0.4, 0.3, 1.5);
  const stacked = emaGapPct > trendFloorPct;   // genuine bullish structure
  const inverted = emaGapPct < -trendFloorPct; // genuine bearish structure

  const priceVsEma20 = above20 ? "above" : "below";
  const priceVsEma50 = above50 ? "above" : "below";
  const trendRegime: TechnicalScore["trendRegime"] = stacked
    ? "uptrend"
    : inverted
      ? above20 && above50 ? "recovering" : "downtrend"
      : "flat";

  const reasons: string[] = [];

  // ── 1. TREND STRUCTURE (35) ──────────────────────────────────────────────
  // One bucket for the whole trend picture: EMA stack, price location and
  // slope. Crossover is an adjustment here rather than its own bucket,
  // because a crossover IS a trend event — scoring it separately paid twice
  // for one signal.
  let trend: number;
  if (stacked && above20 && above50) {
    trend = slopeUp ? 35 : 30;
    reasons.push(
      slopeUp
        ? `Price above EMA20 (${ema20.toFixed(2)}) and EMA50 (${ema50.toFixed(2)}), EMA20 rising ${ema20SlopePct}% over 5 sessions — established uptrend`
        : `Price above EMA20 (${ema20.toFixed(2)}) and EMA50 (${ema50.toFixed(2)}) — uptrend, though EMA20 has flattened`
    );
  } else if (stacked && above50 && !above20) {
    trend = slopeUp ? 28 : 24;
    reasons.push(
      `Pullback below EMA20 (${ema20.toFixed(2)}) but holding above EMA50 (${ema50.toFixed(2)}) — uptrend structure intact`
    );
  } else if (stacked) {
    trend = 14;
    reasons.push(
      `EMA20 still above EMA50 but price has broken below both — uptrend under threat`
    );
  } else if (!inverted) {
    // EMAs within noise of each other — rangebound, not a trend either way.
    trend = above20 && above50 ? 16 : 10;
    reasons.push(
      `EMA20 and EMA50 within ${Math.abs(emaGapPct)}% of each other — rangebound, no established trend`
    );
  } else if (above20 && above50) {
    trend = slopeUp ? 20 : 15;
    reasons.push(
      `Price reclaimed both EMAs but EMA20 is still below EMA50 — early recovery, unconfirmed`
    );
  } else if (above20) {
    trend = 9;
    reasons.push(`Price above EMA20 only, EMA20 below EMA50 — tentative bounce in a downtrend`);
  } else {
    trend = slopeDown ? 0 : 3;
    reasons.push(
      `Price below EMA20 (${ema20.toFixed(2)}) and EMA50 (${ema50.toFixed(2)}), EMA20 below EMA50 — downtrend`
    );
  }

  if (crossoverSignal === "bullish") {
    trend += 4;
    reasons.push("EMA20 crossed above EMA50 within the last 10 sessions — fresh golden cross");
  } else if (crossoverSignal === "bearish") {
    trend -= 6;
    reasons.push("EMA20 crossed below EMA50 within the last 10 sessions — fresh death cross");
  }
  trend = clamp(trend, 0, 35);

  // ── 2. MOMENTUM / RSI (25) ───────────────────────────────────────────────
  // Regime-aware by design. "Lower RSI = better" is wrong: RSI 25 in a
  // healthy uptrend is a dip worth buying, RSI 25 in a downtrend is a stock
  // still being sold. The same number therefore pays very differently.
  const buyableRegime = stacked && above50; // an uptrend to lean back into
  let momentum: number;
  if (buyableRegime) {
    if (rsi < 30) {
      momentum = 14;
      reasons.push(`RSI ${rsi} — deeply oversold inside an uptrend; sharp dip, watch for a trend break`);
    } else if (rsi < 40) {
      momentum = 22;
      reasons.push(`RSI ${rsi} — oversold pullback within an uptrend, favourable risk/reward`);
    } else if (rsi < 55) {
      momentum = 25;
      reasons.push(`RSI ${rsi} — healthy momentum with room to run`);
    } else if (rsi < 65) {
      momentum = 20;
      reasons.push(`RSI ${rsi} — firm momentum, still short of overbought`);
    } else if (rsi < 72) {
      momentum = 12;
      reasons.push(`RSI ${rsi} — approaching overbought, entry timing matters`);
    } else {
      momentum = 4;
      reasons.push(`RSI ${rsi} — overbought; poor risk/reward for a new entry`);
    }
  } else {
    if (rsi < 30) {
      momentum = 5;
      reasons.push(`RSI ${rsi} — oversold, but with no uptrend to support it this is a falling knife`);
    } else if (rsi < 40) {
      momentum = 8;
      reasons.push(`RSI ${rsi} — weak momentum and no trend support`);
    } else if (rsi < 55) {
      momentum = 13;
      reasons.push(`RSI ${rsi} — momentum stabilising, trend not yet confirmed`);
    } else if (rsi < 65) {
      momentum = 11;
      reasons.push(`RSI ${rsi} — momentum improving ahead of the trend structure`);
    } else if (rsi < 72) {
      momentum = 7;
      reasons.push(`RSI ${rsi} — strong push, but unsupported by trend structure`);
    } else {
      momentum = 2;
      reasons.push(`RSI ${rsi} — overbought without trend support; likely a spike`);
    }
  }

  // ── 3. VOLUME CONFIRMATION (20) ──────────────────────────────────────────
  // Saturating (an 8x day is not four times as meaningful as a 2x day) and
  // direction-aware, because heavy volume into a falling price is
  // distribution, not accumulation.
  let volume: number;
  if (volumeRatio >= 4) {
    volume = 15;
    reasons.push(`Volume ${volumeRatio}x the prior 20-day average — extreme single-session spike, treated cautiously`);
  } else if (volumeRatio >= 1.8) {
    volume = 20;
    reasons.push(`Volume ${volumeRatio}x the prior 20-day average — strong participation`);
  } else if (volumeRatio >= 1.2) {
    volume = 16;
    reasons.push(`Volume ${volumeRatio}x the prior 20-day average — above-normal activity`);
  } else if (volumeRatio >= 0.9) {
    volume = 11;
    reasons.push(`Volume ${volumeRatio}x the prior 20-day average — normal participation`);
  } else if (volumeRatio >= 0.6) {
    volume = 6;
    reasons.push(`Volume ${volumeRatio}x the prior 20-day average — below-average interest`);
  } else {
    volume = 2;
    reasons.push(`Volume ${volumeRatio}x the prior 20-day average — very thin trade`);
  }
  if (volumeRatio >= 1.5 && lastSessionReturnPct <= -1) {
    volume = Math.round(volume * 0.5);
    reasons.push(
      `Heavy volume on a ${lastSessionReturnPct.toFixed(1)}% down session — distribution rather than accumulation`
    );
  }

  // ── 4. ENTRY QUALITY (20) ────────────────────────────────────────────────
  // How good the price is *right now* relative to EMA20, normalised by the
  // stock's own daily volatility: 5% above EMA20 means something very
  // different for a stock that typically moves 0.5%/day than for one that
  // moves 3%/day. The normaliser is clamped so it can never dominate.
  const volNormaliser = clamp(dailyVolatilityPct / 1.5, 0.7, 2.0);
  const normalisedExt = extensionPct / volNormaliser;
  let entry: number;
  if (normalisedExt >= 12) {
    entry = 0;
    reasons.push(`Price ${extensionPct}% above EMA20 — severely extended, poor entry`);
  } else if (normalisedExt >= 8) {
    entry = 4;
    reasons.push(`Price ${extensionPct}% above EMA20 — extended, chase risk`);
  } else if (normalisedExt >= 5) {
    entry = 9;
    reasons.push(`Price ${extensionPct}% above EMA20 — somewhat stretched`);
  } else if (normalisedExt >= 2.5) {
    entry = 15;
    reasons.push(`Price ${extensionPct}% above EMA20 — modestly above support`);
  } else if (normalisedExt >= -2.5) {
    entry = 20;
    reasons.push(`Price ${extensionPct}% from EMA20 — sitting at support, prime entry zone`);
  } else if (normalisedExt >= -6) {
    entry = 14;
    reasons.push(`Price ${extensionPct}% below EMA20 — mild discount to short-term trend`);
  } else if (normalisedExt >= -12) {
    entry = 7;
    reasons.push(`Price ${extensionPct}% below EMA20 — well below trend, needs a reclaim`);
  } else {
    entry = 2;
    reasons.push(`Price ${extensionPct}% below EMA20 — far below trend`);
  }

  const components: TechnicalComponents = { trend, momentum, volume, entry };
  const technicalScore = clamp(
    Math.round(trend + momentum + volume + entry),
    0,
    100
  );

  // Thresholds are calibrated to this 100-point scale — see DECISIONS.md.
  // A STRONG_BUY needs genuine strength in every component, not one maxed bucket.
  let technicalSignal: TechnicalScore["technicalSignal"];
  if (technicalScore >= 78) technicalSignal = "STRONG_BUY";
  else if (technicalScore >= 60) technicalSignal = "BUY";
  else if (technicalScore >= 40) technicalSignal = "NEUTRAL";
  else technicalSignal = "AVOID";

  return {
    symbol,
    rsi,
    ema20: parseFloat(ema20.toFixed(2)),
    ema50: parseFloat(ema50.toFixed(2)),
    ema20SlopePct,
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    volumeRatio,
    todayVolume: Math.round(todayVolume),
    avgVolume20d: Math.round(avgVolume20d),
    dailyVolatilityPct,
    extensionPct,
    crossoverSignal,
    priceVsEma20,
    priceVsEma50,
    emaGapPct,
    trendRegime,
    components,
    technicalScore,
    technicalSignal,
    reasons,
  };
}

/**
 * Deterministic ordering for Opportunities and any other ranked list.
 * Score first, then volume confirmation, then entry quality, then ticker —
 * so identical scores never produce a shuffling list between renders.
 */
export function compareByTechnicalScore(a: TechnicalScore, b: TechnicalScore): number {
  if (b.technicalScore !== a.technicalScore) return b.technicalScore - a.technicalScore;
  if (b.components.volume !== a.components.volume) return b.components.volume - a.components.volume;
  if (b.components.entry !== a.components.entry) return b.components.entry - a.components.entry;
  return a.symbol.localeCompare(b.symbol);
}

/** Score several stocks, drop anything below `minScore`, rank deterministically. */
export function scoreMultiple(
  stocks: Array<{ symbol: string; history: EODPoint[] }>,
  minScore = 40,
  minAvgVolume = 200_000
): TechnicalScore[] {
  return stocks
    .map(({ symbol, history }) => scoreStock(symbol, history, minAvgVolume))
    .filter((s): s is TechnicalScore => s !== null && s.technicalScore >= minScore)
    .sort(compareByTechnicalScore);
}
