"use client";
import type { ReactNode } from "react";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";
import { Sparkline, signalStyle } from "./ui/primitives";
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

/** CSS stroke color for a signal — keeps sparkline/bar/badge in agreement. */
function signalStroke(signal?: string): string {
  const s = (signal ?? "").toUpperCase();
  if (s === "BUY" || s === "STRONG_BUY" || s === "STRONG") return "var(--color-up-2)";
  if (s === "HOLD") return "var(--color-gold-2)";
  if (s === "SELL" || s === "AVOID") return "var(--color-down-2)";
  return "var(--color-sky-2)";
}

const BADGE_SHORT: Record<string, string> = { STRONG_BUY: "STRONG", NEUTRAL: "WATCH" };
function badgeLabel(signal?: string): string {
  const u = (signal ?? "—").toUpperCase();
  return BADGE_SHORT[u] ?? u.replace("_", " ");
}

// ─── Tier-1 conviction / P&L bar ────────────────────────────────────────────
function TierBar({ pct, fillClass, label, labelClass = "text-ink-2" }: {
  pct: number; fillClass: string; label: string; labelClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 w-full min-w-0">
      <div className="flex-1 h-1 bg-line-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className={`text-[10px] num shrink-0 ${labelClass}`}>{label}</span>
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

// ─── Expanded inline detail body (two-column rhythm; replaces the old modal) ─
export function StockDetailBody({ detail, topBlock, entryStrip, onOpenNews, footer = true }: {
  detail: SignalDetail;
  topBlock?: ReactNode;        // holding position grid, rendered first
  entryStrip?: ReactNode;      // overrides the signal "suggested entry" strip
  onOpenNews?: (ticker: string) => void;
  footer?: boolean;
}) {
  const { ticker, signal, reason, newsHeadline, catalysts, risks, suggestedEntry, tech, fundamentals, currentPrice } = detail;
  const s = signalStyle(signal);
  const technical = buildTechnicalNarrative(tech);
  const hasNews = !!newsHeadline && newsHeadline !== "No recent news";
  const hasCats = (catalysts?.length ?? 0) > 0;
  const hasRisks = (risks?.length ?? 0) > 0;

  return (
    <div className="space-y-3 pt-3">
      {topBlock}

      {reason && (
        <p className={`text-[13px] leading-relaxed border-l-2 pl-3 italic ${s.text} border-current`}>{reason}</p>
      )}

      {technical && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-1">Technical setup</div>
          <p className="text-xs text-ink-2 leading-relaxed">{technical}</p>
        </div>
      )}

      {/* Catalyst strip — the single nav entry point to the (filtered) News page */}
      {hasNews && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpenNews?.(ticker); }}
          className="w-full flex items-center gap-2 bg-sky-dim border border-sky/30 rounded-lg px-3 py-2 text-left cursor-pointer hover:brightness-110 transition"
        >
          <span className="text-sky-2 text-[13px] shrink-0">📰</span>
          <span className="text-[12px] text-sky-2 leading-snug flex-1 min-w-0">{newsHeadline}</span>
          <span className="text-[10px] text-ink-3 shrink-0">News ›</span>
        </button>
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

      {/* Suggested entry (signal) — full-width amber strip — or caller override */}
      {entryStrip ?? (suggestedEntry && (
        <div className="bg-gold-dim border border-gold/40 rounded-lg px-3.5 py-2 flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">Suggested entry</span>
          <span className="text-[13px] font-semibold text-gold-2 num">{suggestedEntry}</span>
        </div>
      ))}

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
  variant, signal, ticker, sector, confidence, pnlPct, thesis,
  spark, price, change, starred, onToggleStar, tier2, open, onToggle, children,
}: {
  variant: "signal" | "holding";
  signal?: string;
  ticker: string;
  sector?: string;
  confidence?: number;        // signal variant — conviction bar
  pnlPct?: number | null;     // holding variant — P&L bar
  thesis?: string;            // tier-1 flowing line (desktop)
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
  const stroke = signalStroke(signal);
  const isSignal = variant === "signal";
  const grid = isSignal
    ? "grid-cols-[56px_minmax(0,1fr)_76px_20px_14px] sm:grid-cols-[56px_104px_92px_minmax(0,1fr)_50px_76px_20px_14px]"
    : "grid-cols-[56px_minmax(0,1fr)_64px_76px_14px] sm:grid-cols-[56px_104px_96px_minmax(0,1fr)_50px_76px_14px]";

  return (
    <article className={`bg-card border rounded-xl overflow-hidden transition-colors ${open ? "border-line-2" : "border-line hover:border-line-2"}`}>
      {/* Toggle target = tier 1 + tier 2 (the collapsed card) */}
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
          {/* badge */}
          <div className="flex justify-center">
            <span className={`inline-flex items-center justify-center rounded-md border text-[9px] font-bold tracking-wide px-1.5 py-0.5 w-full ${signalStyle(signal).pill}`}>
              {badgeLabel(signal)}
            </span>
          </div>

          {/* ticker + sector */}
          <div className="min-w-0">
            <div className="text-[14px] font-bold tracking-tight truncate leading-tight">{ticker}</div>
            {sector && <div className="text-[10px] text-ink-3 truncate leading-tight">{sector}</div>}
          </div>

          {/* conviction (signal) / P&L (holding) bar */}
          <div className={`min-w-0 ${isSignal ? "hidden sm:flex items-center" : "flex items-center"}`}>
            {isSignal
              ? (confidence !== undefined
                  ? <TierBar pct={confidence} fillClass={signalStyle(signal).bar} label={`${Math.round(confidence)}%`} />
                  : null)
              : (pnlPct !== null && pnlPct !== undefined
                  ? <TierBar pct={Math.min(100, Math.abs(pnlPct))} fillClass={pnlPct >= 0 ? "bg-up" : "bg-down"}
                             label={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`} labelClass={pnlPct >= 0 ? "text-up-2" : "text-down-2"} />
                  : <span className="text-[10px] text-ink-3">—</span>)}
          </div>

          {/* thesis (desktop) */}
          <div className="hidden sm:block min-w-0">
            {thesis && <span className="text-[11px] text-ink-3 truncate block">{thesis}</span>}
          </div>

          {/* sparkline (desktop) */}
          <div className="hidden sm:flex justify-center min-w-0">
            {spark && spark.length >= 5 ? <Sparkline data={spark} width={50} height={24} color={stroke} /> : null}
          </div>

          {/* price + change (stacked, compact) */}
          <div className="text-right min-w-0 leading-tight">
            <div className="text-[13px] font-semibold num truncate">{price !== undefined ? price.toFixed(2) : "—"}</div>
            {change !== undefined && (
              <div className={`text-[10px] num ${change >= 0 ? "text-up-2" : "text-down-2"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div>
            )}
          </div>

          {/* star (signal only) */}
          {isSignal && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleStar?.(); }}
              className={`text-[15px] leading-none cursor-pointer transition-colors ${starred ? "text-gold-2" : "text-ink-3 hover:text-gold-2"}`}
              title={starred ? "Remove from watchlist" : "Add to watchlist"}
              aria-label={starred ? "Remove from watchlist" : "Add to watchlist"}
            >
              {starred ? "★" : "☆"}
            </button>
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
