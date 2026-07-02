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

// ─── Left-aligned labeled stat + bar (confidence / P&L) ─────────────────────
function StatBar({ label, value, valueClass, barClass, pct }: {
  label: string; value: string; valueClass: string; barClass: string; pct: number;
}) {
  return (
    <div className="text-left">
      <div className="flex items-baseline gap-1">
        <span className={`text-[11px] font-medium num leading-none ${valueClass}`}>{value}</span>
        <span className="text-[7px] uppercase tracking-[0.08em] text-ink-3 leading-none">{label}</span>
      </div>
      <div className="h-[2px] bg-line-2/70 rounded-full overflow-hidden mt-1">
        <div className={`h-full rounded-full ${barClass} opacity-80`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden>
      <polyline points="6,9 12,15 18,9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Discrete 2-step action, integrated into a single icon (no dialog box) ──
// First click arms (icon turns red); a second click confirms. Clicking elsewhere
// or Esc, or ~2.5s of inactivity, cancels. Used for both the watchlist star and
// the holding remove so the interaction is identical wherever it appears.
function ConfirmIconButton({ idleIcon, idleClass, title, onConfirm }: {
  idleIcon: string; idleClass: string; title: string; onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const cancel = () => setArmed(false);
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setArmed(false); };
    // Auto-revert to "keep" if left unconfirmed, plus click-away / Esc to cancel.
    const revert = setTimeout(() => setArmed(false), 4000);
    // Defer attaching so the click that armed it doesn't immediately cancel it.
    const id = setTimeout(() => {
      document.addEventListener("click", cancel);
      document.addEventListener("keydown", onEsc);
    }, 0);
    return () => { clearTimeout(revert); clearTimeout(id); document.removeEventListener("click", cancel); document.removeEventListener("keydown", onEsc); };
  }, [armed]);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (armed) { onConfirm(); setArmed(false); } else setArmed(true); }}
      title={armed ? "Click again to remove — or click away to keep" : title}
      aria-label={title}
      className={`text-[14px] leading-none cursor-pointer transition-all ${armed ? "text-down-2 font-bold scale-125" : idleClass}`}
    >
      {armed ? "✕" : idleIcon}
    </button>
  );
}

// Star: adding is one click; removing asks (arms → confirm) via the same pattern.
function StarButton({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  if (!starred) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="text-[15px] leading-none text-ink-3 hover:text-gold-2 cursor-pointer"
        title="Add to watchlist" aria-label="Add to watchlist"
      >☆</button>
    );
  }
  return <ConfirmIconButton idleIcon="★" idleClass="text-gold-2 hover:text-down-2" title="Remove from watchlist" onConfirm={onToggle} />;
}

// ─── Expanded inline detail body (compact, two-/three-column rhythm) ────────
export function StockDetailBody({ detail, topBlock, onOpenNews, footer = true }: {
  detail: SignalDetail;
  topBlock?: ReactNode;
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
    <div className="space-y-2.5 pt-2.5">
      {topBlock}

      {reason && (
        <p className={`text-[13px] leading-snug border-l-2 pl-3 italic ${hue.text} border-current`}>{reason}</p>
      )}

      {/* Technical setup · Why it works · Watch out for — one aligned three-column band */}
      {(technical || hasCats || hasRisks) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-2">
          <div>
            {technical && <>
              <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-1">Technical setup</div>
              <p className="text-[11px] text-ink-2 leading-snug">{technical}</p>
            </>}
          </div>
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

      {/* Technicals | Fundamentals */}
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

      {/* Bottom catalyst strip — headline + News › only (entry range lives in tier 2) */}
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
        <div className="text-[10px] text-ink-3 pt-0.5">
          Fundamentals from askanalyst.com.pk · Technicals from PSX price history · Not financial advice
        </div>
      )}
    </div>
  );
}

// ─── Two-tier collapsed card → expands inline ───────────────────────────────
export function StockRow({
  variant, signal, ticker, sector, confidence, pnlPct,
  spark, price, change, starred, onToggleStar, onRemove, tier2, open, onToggle, children,
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
  onRemove?: () => void;      // holding variant — remove position (same slot as the star)
  tier2: Tier2;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;       // expanded content
}) {
  const hue = hueOf(signal);
  const isSignal = variant === "signal";
  // Identical grid for both variants → columns line up across every tab.
  // Confidence/P&L sits directly after the ticker (left-aligned); a flexible
  // spacer pushes the sparkline/price/action cluster to the right edge.
  const grid = "grid-cols-[56px_minmax(0,1fr)_80px_22px_14px] sm:grid-cols-[56px_96px_84px_minmax(0,1fr)_50px_80px_22px_14px]";

  return (
    <article
      className={`bg-card border rounded-xl overflow-hidden transition-colors ${open ? "border-line-2" : "border-line hover:border-line-2"}`}
      style={{ borderLeftWidth: "3px", borderLeftColor: hue.edge }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="cursor-pointer select-none"
      >
        {/* ── Tier 1 ── */}
        <div className={`grid items-center gap-x-2 sm:gap-x-3 px-3.5 pt-3 pb-2.5 ${grid}`}>
          {/* 1 · badge — outline, status hue */}
          <div className="flex justify-center min-w-0">
            <span className={`inline-flex items-center justify-center rounded-md border bg-transparent text-[9px] font-bold tracking-wide px-1.5 py-0.5 w-full ${hue.text} ${hue.border}`}>
              {badgeLabel(signal)}
            </span>
          </div>

          {/* 2 · ticker + sector */}
          <div className="min-w-0">
            <div className="text-[14px] font-bold tracking-tight truncate leading-tight">{ticker}</div>
            {sector && <div className="text-[10px] text-ink-3 truncate leading-tight">{sector}</div>}
          </div>

          {/* 3 · confidence (signal) / P&L% (holding) — labeled, left-aligned */}
          <div className="hidden sm:block min-w-0">
            {isSignal ? (
              confidence !== undefined
                ? <StatBar label="AI conf" value={`${Math.round(confidence)}%`} valueClass={hue.text} barClass={hue.bar} pct={confidence} />
                : null
            ) : (
              pnlPct !== null && pnlPct !== undefined
                ? <StatBar label="P&L" value={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`} valueClass={pnlPct >= 0 ? "text-up-2" : "text-down-2"} barClass={pnlPct >= 0 ? "bg-up" : "bg-down"} pct={Math.abs(pnlPct)} />
                : <span className="text-[11px] text-ink-3">—</span>
            )}
          </div>

          {/* 4 · flexible spacer (desktop) */}
          <div className="hidden sm:block" />

          {/* 5 · sparkline (desktop) — muted, status hue */}
          <div className="hidden sm:flex justify-center min-w-0">
            {spark && spark.length >= 5 ? <Sparkline data={spark} width={50} height={24} color={hue.stroke} opacity={0.6} /> : null}
          </div>

          {/* 6 · price + change (stacked) */}
          <div className="text-right min-w-0 leading-tight">
            <div className="text-[15px] font-semibold num truncate">{price !== undefined ? price.toFixed(2) : "—"}</div>
            {change !== undefined && (
              <div className={`text-[10px] num ${change >= 0 ? "text-up-2" : "text-down-2"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div>
            )}
          </div>

          {/* 7 · action — star (signal) / remove (holding), same slot */}
          <div className="flex justify-center min-w-0">
            {isSignal
              ? <StarButton starred={!!starred} onToggle={() => onToggleStar?.()} />
              : (onRemove ? <ConfirmIconButton idleIcon="✕" idleClass="text-ink-3 hover:text-down-2" title="Remove holding" onConfirm={onRemove} /> : null)}
          </div>

          {/* 8 · chevron */}
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
