"use client";
import { Star, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { hueOf, StockDetailBody, type SignalDetail } from "./StockRow";
import { Sparkline } from "./ui/primitives";
import { TechnicalScoreChip } from "./ui/TechnicalScore";

/**
 * Watchlist is a monitoring surface, not a second copy of Opportunities'
 * discovery cards: one dense row per ticker so many can be compared at a
 * glance, with the full detail (reasons, fundamentals, news) tucked behind
 * an expand rather than always visible. Desktop renders a real table;
 * mobile stacks the same fields onto two compact lines instead of shrinking
 * the table itself.
 */

const BADGE_SHORT: Record<string, string> = { STRONG_BUY: "STRONG", NEUTRAL: "WATCH" };
function badgeLabel(signal?: string): string {
  const u = (signal ?? "—").toUpperCase();
  return BADGE_SHORT[u] ?? u.replace("_", " ");
}

// Same column order as Opportunities' StockRow: ticker → Technical Score →
// sparkline → price+change (grouped, one stat) → signal → chevron. Keeping
// the two tables' reading order identical is what makes Watchlist feel like
// a compact version of the same product instead of a different layout.
const ROW_GRID = "grid-cols-[24px_minmax(0,1.2fr)_92px_44px_76px_84px_14px]";

export function WatchlistHeader() {
  return (
    <div className={`hidden sm:grid ${ROW_GRID} gap-x-3 items-center px-3.5 py-1.5`}>
      <span />
      <span className="label">Ticker</span>
      <span className="label">Technical Score</span>
      <span />
      <span className="label text-right">Price</span>
      <span className="label">Signal</span>
      <span />
    </div>
  );
}

export function WatchlistRow({
  ticker, sector, signal, technicalScore, price, change, spark, detail, open, onToggle, onRemove, onOpenNews,
}: {
  ticker: string;
  sector?: string;
  signal?: string | null;
  technicalScore?: number | null;
  price?: number;
  change?: number;
  spark?: number[];
  detail: SignalDetail;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onOpenNews?: (ticker: string) => void;
}) {
  const hue = hueOf(signal ?? undefined);
  // Neither a technical score nor an AI signal has arrived yet for this
  // ticker — freshly added, or its data hasn't finished loading.
  const hasData = technicalScore != null || signal != null;

  return (
    <div className="bg-card border border-line rounded-lg overflow-hidden transition-colors data-[open=true]:border-line-2" data-open={open}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="cursor-pointer select-none grid grid-cols-[minmax(0,1fr)_20px] sm:grid-cols-[24px_minmax(0,1.2fr)_92px_44px_76px_84px_14px] gap-x-2 sm:gap-x-3 items-center px-3 py-2.5 sm:py-2"
      >
        {/* Desktop: star in its own column */}
        <span className="hidden sm:inline-flex justify-center">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            title="Remove from watchlist" aria-label="Remove from watchlist"
            className="text-gold-2 hover:text-down-2 cursor-pointer"
          >
            <Star size={13} strokeWidth={2} fill="currentColor" />
          </button>
        </span>

        {/* Mobile: single stacked block; Desktop: ticker + sector cell */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="sm:hidden shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                title="Remove from watchlist" aria-label="Remove from watchlist"
                className="text-gold-2 cursor-pointer inline-flex"
              >
                <Star size={12} strokeWidth={2} fill="currentColor" />
              </button>
            </span>
            <span className="text-[13px] font-bold tracking-tight truncate">{ticker}</span>
            {sector && <span className="hidden sm:inline text-[10px] text-ink-3 truncate min-w-0">{sector}</span>}
            <span className={`sm:hidden shrink-0 inline-flex items-center rounded border px-1 py-px text-[8px] font-bold tracking-wide ${hue.text} ${hue.border}`}>
              {badgeLabel(signal ?? undefined)}
            </span>
          </div>
          {/* Mobile second line: price · change · score */}
          <div className="sm:hidden flex items-center gap-2 mt-0.5 text-[10px] num text-ink-3">
            <span className="text-ink-2 font-medium">{price !== undefined ? price.toFixed(2) : "—"}</span>
            {change !== undefined && (
              <span className={change >= 0 ? "text-up-2" : "text-down-2"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span>
            )}
            {technicalScore != null ? (
              <span className={hue.text}>Tech {Math.round(technicalScore)}/100</span>
            ) : !hasData ? (
              <span className="text-ink-3 inline-flex items-center gap-1">
                <RefreshCw size={9} strokeWidth={2.25} className="animate-spin" aria-hidden />Loading
              </span>
            ) : null}
          </div>
        </div>

        {/* Desktop-only columns — same left-to-right order as Opportunities:
            score, sparkline, then price+change as one grouped stat. */}
        <span className="hidden sm:block min-w-0">
          {technicalScore != null ? (
            <TechnicalScoreChip score={technicalScore} />
          ) : !hasData ? (
            <span className="text-[10px] text-ink-3 inline-flex items-center gap-1">
              <RefreshCw size={10} strokeWidth={2.25} className="animate-spin" aria-hidden />Loading…
            </span>
          ) : (
            <span className="text-[11px] text-ink-3">—</span>
          )}
        </span>
        <span className="hidden sm:flex justify-center">
          {spark && spark.length >= 5 && <Sparkline data={spark} width={36} height={16} color={hue.stroke} opacity={0.6} />}
        </span>
        <div className="hidden sm:block text-right leading-tight">
          <div className="text-[12px] font-medium num">{price !== undefined ? price.toFixed(2) : "—"}</div>
          {change !== undefined && (
            <div className={`text-[10px] num ${change >= 0 ? "text-up-2" : "text-down-2"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div>
          )}
        </div>
        <span className="hidden sm:block">
          <span className={`inline-flex items-center justify-center rounded-md border bg-transparent text-[9px] font-bold tracking-wide px-1.5 py-0.5 ${hue.text} ${hue.border}`}>
            {badgeLabel(signal ?? undefined)}
          </span>
        </span>

        <span className="flex justify-end sm:justify-center">
          <ChevronDown size={14} strokeWidth={2.25} className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </div>

      {open && (
        <div className="px-3.5 pb-3.5 border-t border-line animate-fade-in">
          {hasData ? (
            <StockDetailBody detail={detail} onOpenNews={onOpenNews} />
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-ink-3 pt-2.5">
              <RefreshCw size={12} strokeWidth={2.25} className="animate-spin shrink-0" aria-hidden />
              <span>
                Loading technicals — use <span className="inline-flex items-center gap-0.5 text-ink-2"><RefreshCw size={10} strokeWidth={2.25} aria-hidden />Refresh</span> to retry
                or <span className="inline-flex items-center gap-0.5 text-ink-2"><Sparkles size={10} strokeWidth={2.25} aria-hidden />AI Analysis</span> for full signals.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
