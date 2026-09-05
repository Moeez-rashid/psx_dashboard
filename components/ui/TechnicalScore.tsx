"use client";

/**
 * The single visual anchor for the Technical Score across Opportunities and
 * Watchlist. Always renders the literal words "Technical Score" somewhere
 * legible nearby and the value as "N/100" — never a bare percentage — so it
 * can never be mistaken for a probability or AI confidence. Purely
 * presentational: the number itself comes from lib/technicals.ts unchanged.
 */

const TONE: Record<string, { text: string; bar: string; ring: string }> = {
  up: { text: "text-up-2", bar: "bg-up", ring: "var(--color-up-2)" },
  gold: { text: "text-gold-2", bar: "bg-gold", ring: "var(--color-gold-2)" },
  down: { text: "text-down-2", bar: "bg-down", ring: "var(--color-down-2)" },
  sky: { text: "text-sky-2", bar: "bg-sky", ring: "var(--color-sky-2)" },
};

function toneOf(score: number): keyof typeof TONE {
  if (score >= 60) return "up";      // BUY / STRONG_BUY band
  if (score >= 40) return "gold";    // NEUTRAL band
  return "down";                     // AVOID band
}

/** Full treatment — number + bar + explicit label, used in the Opportunities row (tier 1). */
export function TechnicalScoreMeter({ score, size = "md" }: { score: number; size?: "md" | "sm" }) {
  const tone = TONE[toneOf(score)];
  const big = size === "md";
  return (
    <div className="text-left min-w-0">
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <span className={`font-bold num leading-none tabular-nums ${tone.text} ${big ? "text-[19px]" : "text-[15px]"}`}>
          {Math.round(score)}
        </span>
        <span className={`text-ink-3 num leading-none ${big ? "text-[11px]" : "text-[10px]"}`}>/100</span>
      </div>
      <div className={`${big ? "text-[8px] mt-1" : "text-[7px] mt-0.5"} uppercase tracking-[0.09em] text-ink-3 leading-none`}>
        Technical Score
      </div>
      <div className={`h-[3px] bg-line-2/70 rounded-full overflow-hidden ${big ? "mt-1.5 w-full" : "mt-1 w-16"}`}>
        <div className={`h-full rounded-full ${tone.bar} opacity-90`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
    </div>
  );
}

/** Compact single-line chip — ticker rows in dense contexts (Watchlist table). */
export function TechnicalScoreChip({ score }: { score: number }) {
  const tone = TONE[toneOf(score)];
  return (
    <div className="inline-flex items-center gap-1.5 min-w-[64px]" title={`Technical Score ${Math.round(score)}/100 — a deterministic technical setup assessment, not a probability`}>
      <span className={`text-[13px] font-bold num tabular-nums ${tone.text}`}>{Math.round(score)}</span>
      <div className="h-[3px] w-9 bg-line-2/70 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${tone.bar} opacity-90`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
    </div>
  );
}
