/**
 * Technical Analysis Engine
 * Input:  EODPoint[] (newest first) from lib/psx.ts
 * Output: TechnicalScore — used to filter stocks before sending to AI
 *
 * Indicators computed:
 *   RSI(14)          — momentum oscillator, oversold <35, overbought >70
 *   EMA(20)          — short-term trend
 *   EMA(50)          — medium-term trend
 *   EMA crossover    — 20 crossed above 50 recently = bullish signal
 *   Volume ratio     — today's volume vs 20-day average
 *   Composite score  — weighted 0-100, used as quality gate
 */

import type { EODPoint } from "./psx";

export interface TechnicalScore {
  symbol: string;
  rsi: number;
  ema20: number;
  ema50: number;
  currentPrice: number;
  volumeRatio: number;       // today vol / 20d avg vol
  todayVolume: number;       // actual volume for the most recent session
  avgVolume20d: number;
  crossoverSignal: "bullish" | "bearish" | "neutral";
  priceVsEma20: "above" | "below";
  priceVsEma50: "above" | "below";
  compositeScore: number;    // 0-100
  technicalSignal: "STRONG_BUY" | "BUY" | "NEUTRAL" | "AVOID";
  reasons: string[];         // human-readable bullet points for the prompt
}

/** Calculate EMA for a price series (oldest first). */
function calcEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return prices.map(() => 0);
  const k = 2 / (period + 1);
  const emas: number[] = new Array(prices.length).fill(0);

  // Seed with SMA of first `period` values
  let sma = 0;
  for (let i = 0; i < period; i++) sma += prices[i];
  emas[period - 1] = sma / period;

  for (let i = period; i < prices.length; i++) {
    emas[i] = prices[i] * k + emas[i - 1] * (1 - k);
  }
  return emas;
}

/** Calculate RSI(period) for a price series (oldest first). */
function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50; // default neutral

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smooth subsequent values
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

/** Detect if EMA20 crossed above EMA50 in the last N days. */
function detectCrossover(
  ema20s: number[],
  ema50s: number[],
  lookback = 5
): "bullish" | "bearish" | "neutral" {
  const len = ema20s.length;
  if (len < lookback + 1) return "neutral";

  const start = len - lookback - 1;
  const wasBelowBefore = ema20s[start] < ema50s[start];
  const isAboveNow = ema20s[len - 1] > ema50s[len - 1];

  if (wasBelowBefore && isAboveNow) return "bullish"; // golden cross
  if (!wasBelowBefore && !isAboveNow) return "bearish"; // death cross
  return "neutral";
}

/** Main function: score a stock from its EOD history. */
export function scoreStock(
  symbol: string,
  history: EODPoint[], // newest first
  minAvgVolume = 200_000 // filter illiquid stocks below this
): TechnicalScore | null {
  // Need at least 60 data points for reliable indicators
  if (history.length < 60) return null;

  // Reverse to oldest-first for indicator calculation
  const oldest = [...history].reverse();
  const closes = oldest.map((d) => d.price);
  const volumes = oldest.map((d) => d.volume);

  const ema20s = calcEMA(closes, 20);
  const ema50s = calcEMA(closes, 50);
  const rsi = calcRSI(closes, 14);

  const lastIdx = closes.length - 1;
  const currentPrice = closes[lastIdx];
  const ema20 = ema20s[lastIdx];
  const ema50 = ema50s[lastIdx];

  // Volume: compare latest vs 20-day average
  const recentVols = volumes.slice(Math.max(0, lastIdx - 19), lastIdx + 1);
  const avgVolume20d =
    recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
  const todayVolume = volumes[lastIdx];
  const volumeRatio =
    avgVolume20d > 0 ? parseFloat((todayVolume / avgVolume20d).toFixed(2)) : 0;

  // Drop illiquid stocks
  if (avgVolume20d < minAvgVolume) return null;

  const crossoverSignal = detectCrossover(ema20s, ema50s, 5);
  const priceVsEma20 = currentPrice >= ema20 ? "above" : "below";
  const priceVsEma50 = currentPrice >= ema50 ? "above" : "below";

  // --- Composite Scoring (0-100) ---
  let score = 0;
  const reasons: string[] = [];

  // RSI (30 pts)
  if (rsi < 30) {
    score += 30;
    reasons.push(`RSI ${rsi} — deeply oversold, potential reversal`);
  } else if (rsi < 45) {
    score += 22;
    reasons.push(`RSI ${rsi} — oversold territory, good entry zone`);
  } else if (rsi < 60) {
    score += 15;
    reasons.push(`RSI ${rsi} — neutral momentum`);
  } else if (rsi < 70) {
    score += 8;
    reasons.push(`RSI ${rsi} — approaching overbought`);
  } else {
    score += 0;
    reasons.push(`RSI ${rsi} — overbought, avoid chasing`);
  }

  // EMA trend (25 pts)
  if (priceVsEma20 === "above" && priceVsEma50 === "above") {
    score += 25;
    reasons.push("Price above EMA20 and EMA50 — strong uptrend");
  } else if (priceVsEma20 === "above") {
    score += 15;
    reasons.push("Price above EMA20 — short-term bullish");
  } else if (priceVsEma50 === "above") {
    score += 10;
    reasons.push("Price above EMA50 but below EMA20 — consolidating");
  } else {
    score += 0;
    reasons.push("Price below both EMAs — downtrend");
  }

  // EMA crossover (25 pts)
  if (crossoverSignal === "bullish") {
    score += 25;
    reasons.push("EMA20 recently crossed above EMA50 — golden cross signal");
  } else if (crossoverSignal === "neutral" && priceVsEma20 === "above") {
    score += 12;
  } else if (crossoverSignal === "bearish") {
    score += 0;
    reasons.push("EMA20 below EMA50 — death cross, bearish trend");
  } else {
    score += 8;
  }

  // Volume (20 pts)
  if (volumeRatio >= 2.0) {
    score += 20;
    reasons.push(
      `Volume ${volumeRatio}x above 20d average — strong buying interest`
    );
  } else if (volumeRatio >= 1.3) {
    score += 14;
    reasons.push(`Volume ${volumeRatio}x above average — above-average activity`);
  } else if (volumeRatio >= 0.8) {
    score += 8;
    reasons.push(`Volume ${volumeRatio}x average — normal activity`);
  } else {
    score += 0;
    reasons.push(`Volume ${volumeRatio}x average — low participation, thin market`);
  }

  const compositeScore = Math.min(100, Math.round(score));

  let technicalSignal: TechnicalScore["technicalSignal"];
  if (compositeScore >= 75) technicalSignal = "STRONG_BUY";
  else if (compositeScore >= 50) technicalSignal = "BUY";
  else if (compositeScore >= 30) technicalSignal = "NEUTRAL";
  else technicalSignal = "AVOID";

  return {
    symbol,
    rsi,
    ema20: parseFloat(ema20.toFixed(2)),
    ema50: parseFloat(ema50.toFixed(2)),
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    volumeRatio,
    todayVolume: Math.round(todayVolume),
    avgVolume20d: Math.round(avgVolume20d),
    crossoverSignal,
    priceVsEma20,
    priceVsEma50,
    compositeScore,
    technicalSignal,
    reasons,
  };
}

/** Score multiple stocks in parallel and filter by minimum score. */
export async function scoreMultiple(
  stocks: Array<{ symbol: string; history: EODPoint[] }>,
  minScore = 40,
  minAvgVolume = 200_000
): Promise<TechnicalScore[]> {
  const results = stocks
    .map(({ symbol, history }) => scoreStock(symbol, history, minAvgVolume))
    .filter((s): s is TechnicalScore => s !== null && s.compositeScore >= minScore);

  return results.sort((a, b) => b.compositeScore - a.compositeScore);
}
