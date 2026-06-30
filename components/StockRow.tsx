"use client";
import type { ReactNode } from "react";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";
import { Pill, Sparkline, PriceTag, signalStyle } from "./ui/primitives";
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

// ─── Compact confidence/score bar shown in a collapsed row ──────────────────
export function MiniBar({ pct, signal, label }: { pct: number; signal?: string; label?: string }) {
  const s = signalStyle(signal);
  return (
    <div className="flex items-center gap-2 w-full" title={label}>
      <div className="flex-1 h-1 bg-line-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="text-[10px] text-ink-2 num w-8 text-right">{Math.round(pct)}%</span>
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

// ─── Expanded inline detail body (replaces the old modal) ───────────────────
export function StockDetailBody({ detail, footer = true }: { detail: SignalDetail; footer?: boolean }) {
  const { signal, reason, newsHeadline, catalysts, risks, suggestedEntry, tech, fundamentals, currentPrice } = detail;
  const s = signalStyle(signal);
  const technical = buildTechnicalNarrative(tech);
  const hasNews = !!newsHeadline && newsHeadline !== "No recent news";
  const hasCats = (catalysts?.length ?? 0) > 0;
  const hasRisks = (risks?.length ?? 0) > 0;

  return (
    <div className="space-y-3 pt-3">
      {reason && (
        <p className={`text-[13px] leading-relaxed border-l-2 pl-3 italic ${s.text} border-current`}>{reason}</p>
      )}

      {technical && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-1">Technical setup</div>
          <p className="text-xs text-ink-2 leading-relaxed">{technical}</p>
        </div>
      )}

      {hasNews && (
        <div className="flex items-center gap-2 bg-sky-dim border border-sky/30 rounded-lg px-3 py-2">
          <span className="text-sky-2 text-[13px]">📰</span>
          <span className="text-[12px] text-sky-2 leading-snug flex-1">{newsHeadline}</span>
        </div>
      )}

      {(hasCats || hasRisks) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {hasCats && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-up-2 mb-1">Why it works</div>
              {catalysts!.map((c, i) => <div key={i} className="text-[11px] text-ink-2 mb-0.5 leading-snug">✓ {c}</div>)}
            </div>
          )}
          {hasRisks && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-down-2 mb-1">Watch out for</div>
              {risks!.map((r, i) => <div key={i} className="text-[11px] text-ink-2 mb-0.5 leading-snug">⚠ {r}</div>)}
            </div>
          )}
        </div>
      )}

      {tech && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-1.5">Technicals</div>
          <TechChips tech={tech} liveVolume={undefined} />
        </div>
      )}

      <FundamentalsState data={fundamentals} price={currentPrice} bare />

      {suggestedEntry && (
        <div className="bg-gold-dim border border-gold/40 rounded-lg px-3.5 py-2 flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">Suggested entry</span>
          <span className="text-[13px] font-semibold text-gold-2 num">{suggestedEntry}</span>
        </div>
      )}

      {footer && (
        <div className="text-[10px] text-ink-3 pt-1">
          Fundamentals from askanalyst.com.pk · Technicals from PSX price history · Not financial advice
        </div>
      )}
    </div>
  );
}

// ─── Collapsed row → expands inline ─────────────────────────────────────────
export function StockRow({
  signal, ticker, subtitle, meta, spark, price, change, actions, open, onToggle, children,
}: {
  signal?: string;
  ticker: ReactNode;
  subtitle?: string;
  meta?: ReactNode;          // middle cell — confidence bar / P&L (desktop only)
  spark?: number[];
  price?: number;
  change?: number;
  actions?: ReactNode;       // right-side controls (star / edit / delete)
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;      // expanded content
}) {
  return (
    <article className={`bg-card border rounded-xl overflow-hidden transition-colors ${open ? "border-line-2" : "border-line hover:border-line-2"}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="grid items-center gap-x-3 px-3.5 py-3 cursor-pointer select-none
                   grid-cols-[auto_minmax(0,1fr)_auto_auto]
                   sm:grid-cols-[auto_minmax(0,1fr)_120px_84px_auto_auto]"
      >
        {/* 1 · signal pill */}
        <div className="shrink-0">{signal ? <Pill signal={signal} small /> : <span className="w-1 h-4 rounded-full bg-line-2 inline-block" />}</div>

        {/* 2 · ticker + subtitle */}
        <div className="min-w-0">
          <div className="text-[14px] font-bold tracking-tight truncate leading-tight">{ticker}</div>
          {subtitle && <div className="text-[10px] text-ink-3 truncate">{subtitle}</div>}
        </div>

        {/* 3 · meta (desktop) */}
        <div className="hidden sm:flex items-center">{meta}</div>

        {/* 4 · sparkline (desktop) */}
        <div className="hidden sm:flex justify-center">{spark && spark.length >= 5 ? <Sparkline data={spark} width={72} height={26} /> : null}</div>

        {/* 5 · price */}
        <div className="text-right shrink-0"><PriceTag price={price} changePercent={change} /></div>

        {/* 6 · actions + chevron */}
        <div className="flex items-center gap-1.5 justify-end shrink-0 pl-1">
          {actions && <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">{actions}</div>}
          <Chevron open={open} />
        </div>
      </div>

      {open && (
        <div className="px-3.5 pb-3.5 border-t border-line animate-fade-in">
          {children}
        </div>
      )}
    </article>
  );
}
