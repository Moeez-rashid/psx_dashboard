/**
 * Signal → colour mapping, shared by every surface that renders a signal.
 *
 * Deliberately a plain module with no "use client" and no JSX: Deep Dive's
 * sections are server components and cannot call a function exported from a
 * client module, while StockRow/WatchlistRow are client components. Keeping
 * the map here lets both use the identical hues instead of drifting apart.
 */

export interface Hue {
  edge: string;
  text: string;
  border: string;
  bar: string;
  stroke: string;
}

const HUE: Record<string, Hue> = {
  up:   { edge: "var(--color-up)",   text: "text-up-2",   border: "border-up/50",   bar: "bg-up",   stroke: "var(--color-up-2)" },
  gold: { edge: "var(--color-gold)", text: "text-gold-2", border: "border-gold/50", bar: "bg-gold", stroke: "var(--color-gold-2)" },
  down: { edge: "var(--color-down)", text: "text-down-2", border: "border-down/50", bar: "bg-down", stroke: "var(--color-down-2)" },
  sky:  { edge: "var(--color-sky)",  text: "text-sky-2",  border: "border-sky/50",  bar: "bg-sky",  stroke: "var(--color-sky-2)" },
};

export function hueOf(signal?: string): Hue {
  const s = (signal ?? "").toUpperCase();
  if (s === "BUY" || s === "STRONG_BUY" || s === "STRONG") return HUE.up;
  if (s === "HOLD") return HUE.gold;
  if (s === "SELL" || s === "AVOID") return HUE.down;
  return HUE.sky;
}
