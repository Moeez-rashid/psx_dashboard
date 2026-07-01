"use client";
import { useState, useEffect, type ReactNode } from "react";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";
import { Sparkline } from "./ui/primitives";
import { TechChips, FundamentalsState, type StockTech } from "./StockBits";

// ─── Detail payload shared by every tab ─────────────────────────────────────
export interface SignalDetail {
  ticker: string;
  signal?: string;
  confidence?: number;
  reason?: string;
  newsHeadline?: string;
  catalysts?: string[];
  risks?: string[];
  suggestedEntry?: string;
  tech?: StockTech;
  fundamentals?: AskAnalystFundamentals | null;
  currentPrice?: number;
  changePercent?: number;
  spark?: number[];
}

// ─── Tier-2 flowing line content ────────────────────────────────────────────
export interface Tier2 {
  icon: string;                                   // small leading icon (emoji)
  text: string;                                   // the single sentence
  fragment?: { text: string; className: string }; // optional inline colored fragment
}

/** First clause of a sentence — up to (and including) the first period. */
export function firstClause(s?: string): string {
  if (!s) return "";
  const m = s.match(/^[^.]*\.?/);
  return (m ? m[0] : s).trim().replace(/\.$/, "");
}

/** One flowing paragraph describing the technical setup (mirrors the old modal copy). */
export function buildTechnicalNarrative(tech?: StockTech): string {
  if (!tech) return "";
  let t = "";
  if (tech.rsi < 35)      t += `RSI at ${tech.rsi.toFixed(0)} is deeply oversold — a potential reversal zone. `;
  else if (tech.rsi < 50) t += `RSI at ${tech.rsi.toFixed(0)} sits below midpoint — mild oversold conditions with upside room. `;
  else if (tech.rsi < 65) t += `RSI at ${tech.rsi.toFixed(0)} shows healthy momentum without being overbought. `;
  else                    t += `RSI at ${tech.rsi.toFixed(0)} is approaching overbought — timing of entry is critical. `;

  const above20 = tech.priceVsEma20 === "above";
  const above50 = (tech.priceVsEma50 ?? tech.priceVsEma20) === "above";
  if (above20 && above50)
    t += `Price holds above both EMA20 (${tech.ema20.toFixed(0)}) and EMA50 (${tech.ema50.toFixed(0)}), confirming a clean uptrend. `;
  else if (above20)
    t += `Price has reclaimed EMA20 (${tech.ema20.toFixed(0)}) but EMA50 (${tech.ema50.toFixed(0)}) is still overhead — watch for full confirmation. `;
  else
    t += `Price is below EMA20 (${tech.ema20.toFixed(0)}) and EMA50 (${tech.ema50.toFixed(0)}) — trend is bearish; monitor for a reclaim before entry. `;

  if (tech.volumeRatio >= 2.0)      t += `Volume surging at ${tech.volumeRatio.toFixed(1)}× the 20-day average — strong conviction behind the move.`;
  else if (tech.volumeRatio >= 1.3) t += `Volume at ${tech.volumeRatio.toFixed(1)}× average confirms above-normal participation.`;
  else if (tech.volumeRatio >= 0.8) t += `Volume is at ${tech.volumeRatio.toFixed(1)}× average — normal activity levels.`;
  else                              t += `Volume thin at ${tech.volumeRatio.toFixed(1)}× average — limited conviction; wait for a pickup.`;
  return t;
}

// ─── Single hue per row ─────────────────────────────────────────────────────
// Every status-signal element (left edge, badge, confidence, sparkline) draws
// from ONE hue for the row; only treatment varies. P&L%, the entry fragment and
// the news accent are intentionally outside this system.
interface Hue { edge: string; text: string; border: string; bar: string; stroke: string }
const HUE: Record<string, Hue> = {
  up:   { edge: "var(--color-up)",   text: "text-up-2",   border: "border-up/50",   bar: "bg-up",   stroke: "var(--color-up-2)" },
  gold: { edge: "var(--color-gold)", text: "text-gold-2", border: "border-gold/50", bar: "bg-gold", stroke: "var(--color-gold-2)" },
  down: { edge: "var(--color-down)", text: "text-down-2", border: "border-down/50", bar: "bg-down", stroke: "var(--color-down-2)" },
  sky:  { edge: "var(--color-sky)",  text: "text-sky-2",  border: "border-sky/50",  bar: "bg-sky",  stroke: "var(--color-sky-2)" },
};
function hueOf(signal?: string): Hue {
  const s = (signal ?? "").toUpperCase();
  if (s === "BUY" || s === "STRONG_BUY" || s === "STRONG") return HUE.up;
  if (s === "HOLD") return HUE.gold;
  if (s === "SELL" || s === "AVOID") return HUE.down;
  return HUE.sky;
}

const BADGE_SHORT: Record<string, string> = { STRONG_BUY: "STRONG", NEUTRAL: "WATCH" };
function badgeLabel(signal?: string): string {
  const u = (signal ?? "—").toUpperCase();
  return BADGE_SHORT[u] ?? u.replace("_", " ");
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden>
      <polyline points="6,9 12,15 18,9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Watchlist star with a discrete 2-step confirm on removal ───────────────
function StarButton({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const close = () => setConfirming(false);
    // defer so the click that opened the popover doesn't immediately close it
    const id = setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirming(false); };
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(id); document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, [confirming]);

  // Adding is immediate; only removal asks for confirmation.
  if (!starred) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="text-[15px] leading-none text-ink-3 hover:text-gold-2 cursor-pointer"
        title="Add to watchlist" aria-label="Add to watchlist"
      >☆</button>
    );
  }
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setConfirming(v => !v); }}
        className={`text-[15px] leading-none cursor-pointer transition-colors ${confirming ? "text-down-2" : "text-gold-2 hover:text-down-2"}`}
        title="Remove from watchlist" aria-label="Remove from watchlist"
      >★</button>
      {confirming && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-7 z-30 w-40 bg-card border border-line-2 rounded-lg shadow-xl shadow-black/50 p-2 animate-fade-in"
        >
          <div className="text-[11px] text-ink-2 mb-1.5 leading-snug">Remove from watchlist?</div>
          <div className="flex gap-1.5">
            <button onClick={(e) => { e.stopPropagation(); setConfirming(false); onToggle(); }} className="btn-danger text-[10px] px-2 py-0.5 flex-1 font-semibold">Remove</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirming(false); }} className="btn text-[10px] px-2 py-0.5 flex-1">Keep</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Expanded inline detail body (two-column rhythm; no modal) ──────────────
export function StockDetailBody({ detail, topBlock, onOpenNews, footer = true }: {
  detail: SignalDetail;
  topBlock?: ReactNode;        // holding position block, rendered first
  onOpenNews?: (ticker: string) => void;
  footer?: boolean;
}) {
  const { ticker, signal, reason, newsHeadline, catalysts, risks, tech, fundamentals, currentPrice } = detail;
  const hue = hueOf(signal);
  const technical = buildTechnicalNarrative(tech);
  const hasNews = !!newsHeadline && newsHeadline !== "No recent news";
  const hasCats = (catalysts?.length ?? 0) > 0;
  const hasRisks = (risks?.length ?? 0) > 0;

  return (
    <div className="space-y-3 pt-3">
      {topBlock}

      {reason && (
        <p className={`text-[13px] leading-relaxed border-l-2 pl-3 italic ${hue.text} border-current`}>{reason}</p>
      )}

      {technical && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-1">Technical setup</div>
          <p className="text-xs text-ink-2 leading-relaxed">{technical}</p>
        </div>
      )}

      {/* Two-column row: Why it works | Watch out for */}
      {(hasCats || hasRisks) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            {hasCats && <>
              <div className="text-[9px] uppercase tracking-wide text-up-2 mb-1">Why it works</div>
              {catalysts!.map((c, i) => <div key={i} className="text-[11px] text-ink-2 mb-0.5 leading-snug">✓ {c}</div>)}
            </>}
          </div>
          <div>
            {hasRisks && <>
              <div className="text-[9px] uppercase tracking-wide text-down-2 mb-1">Watch out for</div>
              {risks!.map((r, i) => <div key={i} className="text-[11px] text-ink-2 mb-0.5 leading-snug">⚠ {r}</div>)}
            </>}
          </div>
        </div>
      )}

      {/* Two-column row: Technicals | Fundamentals — shares the tracks above */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          {tech && <>
            <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-1.5">Technicals</div>
            <TechChips tech={tech} liveVolume={undefined} />
          </>}
        </div>
        <div>
          <FundamentalsState data={fundamentals} price={currentPrice} bare />
        </div>
      </div>

      {/* Bottom catalyst strip — headline + News › only (entry range lives in tier 2, not here) */}
      {hasNews && (
        <button
          onClick={() => onOpenNews?.(ticker)}
          className="w-full flex items-center gap-2 bg-sky-dim border border-sky/30 rounded-lg px-3 py-2 text-left cursor-pointer hover:brightness-110 transition"
        >
          <span className="text-sky-2 text-[13px] shrink-0">📰</span>
          <span className="text-[12px] text-sky-2 leading-snug flex-1 min-w-0 truncate">{newsHeadline}</span>
          <span className="text-[10px] text-ink-3 shrink-0">News ›</span>
        </button>
      )}

      {footer && (
        <div className="text-[10px] text-ink-3 pt-1">
          Fundamentals from askanalyst.com.pk · Technicals from PSX price history · Not financial advice
        </div>
      )}
    </div>
  );
}

// ─── Two-tier collapsed card → expands inline ───────────────────────────────
export function StockRow({
  variant, signal, ticker, sector, confidence, pnlPct,
  spark, price, change, starred, onToggleStar, tier2, open, onToggle, children,
}: {
  variant: "signal" | "holding";
  signal?: string;
  ticker: string;
  sector?: string;
  confidence?: number;        // signal variant — conviction stat (status hue)
  pnlPct?: number | null;     // holding variant — P&L stat (own sign color)
  spark?: number[];
  price?: number;
  change?: number;
  starred?: boolean;          // signal variant — watchlist state
  onToggleStar?: () => void;
  tier2: Tier2;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;       // expanded content
}) {
  const hue = hueOf(signal);
  const isSignal = variant === "signal";
  const grid = isSignal
    ? "grid-cols-[56px_minmax(0,1fr)_78px_20px_14px] sm:grid-cols-[56px_minmax(0,1fr)_132px_50px_78px_20px_14px]"
    : "grid-cols-[56px_minmax(0,1fr)_78px_14px] sm:grid-cols-[56px_minmax(0,1fr)_132px_50px_78px_14px]";

  return (
    <article
      className={`bg-card border rounded-xl overflow-hidden transition-colors ${open ? "border-line-2" : "border-line hover:border-line-2"}`}
      style={{ borderLeftWidth: "3px", borderLeftColor: hue.edge }}
    >
      {/* Toggle target = tier 1 + tier 2 (the collapsed card) */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="cursor-pointer select-none"
      >
        {/* ── Tier 1 (no prose — badge · ticker · dominant confidence/P&L · spark · price · star · chevron) ── */}
        <div className={`grid items-center gap-x-2 sm:gap-x-3 px-3.5 pt-3 pb-2.5 ${grid}`}>
          {/* badge — outline, status hue */}
          <div className="flex justify-center min-w-0">
            <span className={`inline-flex items-center justify-center rounded-md border bg-transparent text-[9px] font-bold tracking-wide px-1.5 py-0.5 w-full ${hue.text} ${hue.border}`}>
              {badgeLabel(signal)}
            </span>
          </div>

          {/* ticker + sector (absorbs slack) */}
          <div className="min-w-0">
            <div className="text-[14px] font-bold tracking-tight truncate leading-tight">{ticker}</div>
            {sector && <div className="text-[10px] text-ink-3 truncate leading-tight">{sector}</div>}
          </div>

          {/* confidence (signal) / P&L% (holding) — dominant stat + wide bar beneath */}
          <div className="hidden sm:block min-w-0">
            {isSignal ? (
              confidence !== undefined ? (
                <>
                  <div className={`text-[15px] font-semibold num leading-none ${hue.text}`}>{Math.round(confidence)}%</div>
                  <div className="h-1 bg-line-2 rounded-full overflow-hidden mt-1.5">
                    <div className={`h-full rounded-full ${hue.bar}`} style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }} />
                  </div>
                </>
              ) : null
            ) : (
              pnlPct !== null && pnlPct !== undefined ? (
                <>
                  <div className={`text-[15px] font-semibold num leading-none ${pnlPct >= 0 ? "text-up-2" : "text-down-2"}`}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%</div>
                  <div className="h-1 bg-line-2 rounded-full overflow-hidden mt-1.5">
                    <div className={`h-full rounded-full ${pnlPct >= 0 ? "bg-up" : "bg-down"}`} style={{ width: `${Math.min(100, Math.abs(pnlPct))}%` }} />
                  </div>
                </>
              ) : <span className="text-[11px] text-ink-3">—</span>
            )}
          </div>

          {/* sparkline (desktop) — muted, status hue */}
          <div className="hidden sm:flex justify-center min-w-0">
            {spark && spark.length >= 5 ? <Sparkline data={spark} width={50} height={24} color={hue.stroke} opacity={0.6} /> : null}
          </div>

          {/* price + change (stacked, matches confidence weight) */}
          <div className="text-right min-w-0 leading-tight">
            <div className="text-[15px] font-semibold num truncate">{price !== undefined ? price.toFixed(2) : "—"}</div>
            {change !== undefined && (
              <div className={`text-[10px] num ${change >= 0 ? "text-up-2" : "text-down-2"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div>
            )}
          </div>

          {/* star (signal only) — discrete 2-step confirm on removal */}
          {isSignal && (
            <div className="flex justify-center min-w-0">
              <StarButton starred={!!starred} onToggle={() => onToggleStar?.()} />
            </div>
          )}

          {/* chevron */}
          <div className="flex justify-center"><Chevron open={open} /></div>
        </div>

        {/* ── Tier 2 ── */}
        <div className="flex items-center gap-1.5 border-t border-line px-3.5 py-2.5 overflow-hidden">
          <span className="shrink-0 text-[12px] leading-none">{tier2.icon}</span>
          <span className="text-[11px] text-ink-2 truncate min-w-0 flex-1">
            {tier2.text}
            {tier2.fragment && <span className={tier2.fragment.className}> · {tier2.fragment.text}</span>}
          </span>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div className="px-3.5 pb-3.5 border-t border-line animate-fade-in">
          {children}
        </div>
      )}
    </article>
  );
}
