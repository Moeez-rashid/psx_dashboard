"use client";
import { useState, useEffect, type ReactNode } from "react";
import { Star, X, ChevronDown, Newspaper, type LucideIcon } from "lucide-react";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";
import { Sparkline } from "./ui/primitives";
import { TechnicalScoreMeter } from "./ui/TechnicalScore";
import { TechChips, FundamentalsState, type StockTech } from "./StockBits";

// ─── Detail payload shared by every tab ─────────────────────────────────────
export interface SignalDetail {
  ticker: string;
  signal?: string;
  technicalScore?: number;
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
  icon: LucideIcon;                                // small leading icon
  text: string;                                    // the single sentence
  fragment?: { text: string; className: string };  // optional inline colored fragment
}

// ─── Single hue per row ─────────────────────────────────────────────────────
interface Hue { edge: string; text: string; border: string; bar: string; stroke: string }
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

const BADGE_SHORT: Record<string, string> = { STRONG_BUY: "STRONG", NEUTRAL: "WATCH" };
function badgeLabel(signal?: string): string {
  const u = (signal ?? "—").toUpperCase();
  return BADGE_SHORT[u] ?? u.replace("_", " ");
}

// ─── P&L meter (holdings only) — diverging bar centered on breakeven ────────
// A raw |pnlPct| used directly as a 0-100% bar width made every realistic
// P&L (rarely more than a few percent) look like an almost-empty sliver with
// no sense of direction or scale. This instead anchors a center "breakeven"
// tick and grows a bar left (loss) or right (gain) from it, scaled against a
// ±20% swing — big enough that everyday P&L reads clearly, capped so no
// single extreme position can visually dominate the row.
const PNL_METER_SCALE = 20;
function PnLMeter({ pnlPct }: { pnlPct: number }) {
  const isUp = pnlPct >= 0;
  const magnitude = Math.min(100, (Math.abs(pnlPct) / PNL_METER_SCALE) * 100);
  return (
    <div className="text-left">
      <div className="flex items-baseline gap-1">
        <span className={`text-[13px] font-medium num leading-none ${isUp ? "text-up-2" : "text-down-2"}`}>
          {isUp ? "+" : ""}{pnlPct.toFixed(1)}%
        </span>
        <span className="text-[8px] uppercase tracking-[0.08em] text-ink-3 leading-none">P&L</span>
      </div>
      <div className="relative h-[3px] rounded-full mt-1.5 flex overflow-hidden bg-line-2/70">
        <div className="w-1/2 h-full flex justify-end">
          {!isUp && <div className="h-full bg-down rounded-full opacity-90" style={{ width: `${magnitude}%` }} />}
        </div>
        <div className="w-1/2 h-full flex justify-start">
          {isUp && <div className="h-full bg-up rounded-full opacity-90" style={{ width: `${magnitude}%` }} />}
        </div>
        <div className="absolute left-1/2 -translate-x-px top-0 bottom-0 w-px bg-ink-3/70" />
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return <ChevronDown size={15} strokeWidth={2.25} className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />;
}

// ─── Discrete 2-step action, integrated into a single icon (no dialog box) ──
// First click arms (icon turns red); a second click confirms. Clicking elsewhere
// or Esc, or ~2.5s of inactivity, cancels. Used for both the watchlist star and
// the holding remove so the interaction is identical wherever it appears.
function ConfirmIconButton({ idleIcon: Idle, idleFill, title, onConfirm }: {
  idleIcon: LucideIcon; idleFill?: boolean; title: string; onConfirm: () => void;
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
      className={`inline-flex leading-none cursor-pointer transition-all ${armed ? "text-down-2 scale-125" : "text-ink-3 hover:text-down-2"}`}
    >
      {armed ? <X size={15} strokeWidth={2.5} /> : <Idle size={15} strokeWidth={2} fill={idleFill ? "currentColor" : "none"} />}
    </button>
  );
}

// Star: adding is one click; removing asks (arms → confirm) via the same pattern.
function StarButton({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  if (!starred) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="inline-flex leading-none text-ink-3 hover:text-gold-2 cursor-pointer"
        title="Add to watchlist" aria-label="Add to watchlist"
      >
        <Star size={15} strokeWidth={2} />
      </button>
    );
  }
  return (
    <span className="text-gold-2">
      <ConfirmIconButton idleIcon={Star} idleFill title="Remove from watchlist" onConfirm={onToggle} />
    </span>
  );
}

/**
 * The first technical reason always doubles as the row's collapsed tier-2
 * headline (see signalTier2 in Dashboard.tsx) whenever there's no distinct
 * AI-authored `reason` — so it's dropped from this list to avoid repeating
 * the exact same sentence immediately below itself once expanded. When a
 * real AI `reason` IS present, it's a different sentence entirely, so the
 * full technical list stays intact and only an exact-string match is removed.
 */
function dedupedReasons(reasons: string[] | undefined, reason?: string): string[] {
  if (!reasons?.length) return [];
  if (!reason) return reasons.slice(1);
  return reasons.filter((r) => r !== reason);
}

// ─── Expanded inline detail body ─────────────────────────────────────────────
export function StockDetailBody({ detail, topBlock, onOpenNews, footer = true }: {
  detail: SignalDetail;
  topBlock?: ReactNode;
  onOpenNews?: (ticker: string) => void;
  footer?: boolean;
}) {
  const { ticker, signal, reason, newsHeadline, catalysts, risks, tech, fundamentals, currentPrice } = detail;
  const hue = hueOf(signal);
  const reasons = dedupedReasons(tech?.reasons, reason);
  const hasNews = !!newsHeadline && newsHeadline !== "No recent news";
  const hasCats = (catalysts?.length ?? 0) > 0;
  const hasRisks = (risks?.length ?? 0) > 0;

  return (
    <div className="space-y-3 pt-2.5">
      {topBlock}

      {reason && (
        <p className={`text-[13px] leading-snug border-l-2 pl-3 italic ${hue.text} border-current`}>{reason}</p>
      )}

      {/* Key technical reasons — the deterministic explanation behind the score, stated once. */}
      {reasons.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-1.5">Key technical reasons</div>
          <ul className="space-y-1">
            {reasons.map((r, i) => (
              <li key={i} className="text-[11px] text-ink-2 leading-snug pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-ink-3">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI perspective — shown only when the AI pass actually produced its own
          catalysts/risks framing (never fabricated from technicals). */}
      {(hasCats || hasRisks) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 pt-0.5">
          {hasCats && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-up-2 mb-1">AI: why it works</div>
              {catalysts!.map((c, i) => <div key={i} className="text-[11px] text-ink-2 mb-0.5 leading-snug">{c}</div>)}
            </div>
          )}
          {hasRisks && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-down-2 mb-1">AI: watch out for</div>
              {risks!.map((r, i) => <div key={i} className="text-[11px] text-ink-2 mb-0.5 leading-snug">{r}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Secondary technicals | Fundamentals — tertiary detail, one row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
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
          <Newspaper size={14} strokeWidth={2} className="text-sky-2 shrink-0" aria-hidden />
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
  variant, signal, ticker, sector, technicalScore, pnlPct,
  spark, price, change, starred, onToggleStar, onRemove, tier2, open, onToggle, children,
}: {
  variant: "signal" | "holding";
  signal?: string;
  ticker: string;
  sector?: string;
  technicalScore?: number;    // signal variant — deterministic 0-100 technical score
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
  const Tier2Icon = tier2.icon;
  // Identical grid for both variants → columns line up across every tab.
  // Score/P&L sits directly after the ticker (left-aligned); a flexible
  // spacer pushes the sparkline/price/action cluster to the right edge.
  const grid = "grid-cols-[56px_minmax(0,1fr)_92px_22px_14px] sm:grid-cols-[56px_96px_128px_minmax(0,1fr)_64px_80px_22px_14px]";

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

          {/* 2 · ticker + sector (+ score/P&L on mobile, where column 3 is hidden) */}
          <div className="min-w-0">
            <div className="text-[14px] font-bold tracking-tight truncate leading-tight">{ticker}</div>
            <div className="flex items-center gap-1 min-w-0 leading-tight">
              {sector && <span className="text-[10px] text-ink-3 truncate min-w-0">{sector}</span>}
              {isSignal && technicalScore !== undefined && (
                <span className={`sm:hidden shrink-0 text-[10px] num font-medium ${hue.text}`}>· {Math.round(technicalScore)}/100</span>
              )}
              {!isSignal && pnlPct !== null && pnlPct !== undefined && (
                <span className={`sm:hidden shrink-0 text-[10px] num font-medium ${pnlPct >= 0 ? "text-up-2" : "text-down-2"}`}>
                  · {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          {/* 3 · Technical Score (signal, prominent) / P&L% (holding) */}
          <div className="hidden sm:block min-w-0">
            {isSignal ? (
              technicalScore !== undefined ? <TechnicalScoreMeter score={technicalScore} size="sm" /> : null
            ) : (
              pnlPct !== null && pnlPct !== undefined
                ? <PnLMeter pnlPct={pnlPct} />
                : <span className="text-[11px] text-ink-3">—</span>
            )}
          </div>

          {/* 4 · flexible spacer (desktop) */}
          <div className="hidden sm:block" />

          {/* 5 · sparkline (desktop) — muted, status hue */}
          <div className="hidden sm:flex justify-center min-w-0">
            {spark && spark.length >= 5 ? <Sparkline data={spark} width={64} height={28} color={hue.stroke} opacity={0.75} /> : null}
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
              : (onRemove ? <ConfirmIconButton idleIcon={X} title="Remove holding" onConfirm={onRemove} /> : null)}
          </div>

          {/* 8 · chevron */}
          <div className="flex justify-center"><Chevron open={open} /></div>
        </div>

        {/* ── Tier 2 ── */}
        <div className="flex items-center gap-1.5 border-t border-line px-3.5 py-2.5 overflow-hidden">
          <Tier2Icon size={13} strokeWidth={2} className="shrink-0 text-ink-3" aria-hidden />
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
