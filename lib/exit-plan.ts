/**
 * Exit plan: a stop-loss and a profit target sized by how much the stock
 * normally moves in a day (ATR 14 from PSX's daily high/low).
 *
 *   stop   = price − 2 × ATR
 *   target = price + 2 × (price − stop)        → reward is twice the risk
 *
 * A risk rule, not a forecast and not part of the Technical Score. In the
 * backtest (scripts/backtest.ts) on the daily top-8 slate it ended level with
 * simply holding for 20 sessions; what it buys is a known, bounded loss per
 * trade, which is what the trade calculator sizes the position from.
 */

export const EXIT_ATR_MULT = 2;
export const EXIT_REWARD_MULT = 2;

export interface ExitPlan {
  entry: number;
  stop: number;
  target: number;
  /** ATR as a % of the entry price — the stock's typical daily range. */
  atrPct: number;
  stopPct: number;   // negative
  targetPct: number; // positive
}

export function exitPlan(entry: number | null | undefined, atr: number | null | undefined): ExitPlan | null {
  if (!entry || !atr || !(entry > 0) || !(atr > 0)) return null;
  const risk = EXIT_ATR_MULT * atr;
  if (risk >= entry * 0.5) return null; // a stop this far away isn't a plan
  const stop = entry - risk;
  const target = entry + EXIT_REWARD_MULT * risk;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    entry: r2(entry),
    stop: r2(stop),
    target: r2(target),
    atrPct: r2((atr / entry) * 100),
    stopPct: r2(((stop - entry) / entry) * 100),
    targetPct: r2(((target - entry) / entry) * 100),
  };
}

export const EXIT_PLAN_NOTE =
  "Stop = 2× the stock's average daily range below the price; target = twice that distance above. A risk rule, not a forecast.";
