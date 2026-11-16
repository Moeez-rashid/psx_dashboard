"use client";
import { MobileRow, Move, NearEntryFlag, techBrief } from "./ui/MobileRow";
import Link from "next/link";
import { Star, ChevronDown, RefreshCw, Sparkles, Telescope, Bell } from "lucide-react";
import { openAlertFor } from "./AlertsCenter";
import { hueOf, StockDetailBody, type SignalDetail } from "./StockRow";
import { nearEntry } from "./StockBits";
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

// Same column order and proportions as Opportunities' StockRow tier 1 —
// signal badge, then ticker, then Technical Score, sitting close together via
// fixed-width columns, with one flexible spacer pushing the sparkline/price/
// action cluster to the right edge. Matching StockRow gives Watchlist cards
// the same visual weight and hierarchy (signal → ticker → score → chart →
// price) the redesign asked for, instead of the previous dense-table feel.
const ROW_GRID = "grid-cols-[56px_120px_112px_minmax(0,1fr)_64px_80px_22px_14px]";

export function WatchlistHeader() {
  return (
    <div className={`hidden sm:grid ${ROW_GRID} gap-x-3 items-center px-3.5 py-1.5`}>
      <span className="label text-center">Signal</span>
      <span className="label">Ticker</span>
      <span className="label whitespace-nowrap">Technical Score</span>
      <span />
      <span />
      <span className="label text-right">Price</span>
      <span />
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
    <div className="overflow-hidden transition-colors data-[open=true]:bg-card sm:bg-card sm:border sm:border-line sm:rounded-lg sm:data-[open=true]:border-line-2" data-open={open}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="cursor-pointer select-none"
      >
        <MobileRow
          ticker={ticker}
          tone={hue.text}
          flag={nearEntry(detail.tech) ? <NearEntryFlag /> : undefined}
          sub={technicalScore != null ? (
            <><span className={hue.text}>{badgeLabel(signal ?? undefined)} {Math.round(technicalScore)}</span>
            {techBrief(detail.tech) ? <> · {techBrief(detail.tech)}</> : sector ? <> · {sector}</> : null}</>
          ) : !hasData ? (
            <span className="inline-flex items-center gap-1"><RefreshCw size={10} strokeWidth={2.25} className="animate-spin" aria-hidden />Loading</span>
          ) : sector}
          top={price !== undefined ? price.toFixed(2) : "—"}
          bottom={<Move pct={change} />}
          spark={spark}
        />
      <div className="hidden sm:grid grid-cols-[56px_120px_112px_minmax(0,1fr)_64px_80px_22px_14px] gap-x-3 items-center px-3.5 py-3">
        <div className="flex justify-center min-w-0">
          <span className={`inline-flex items-center justify-center rounded-md border bg-transparent text-[9px] font-bold tracking-wide px-1.5 py-0.5 w-full ${hue.text} ${hue.border}`}>
            {badgeLabel(signal ?? undefined)}
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Tickers are short and are the row's identity — never truncate them; the sector gives way instead. */}
            <span className="text-[14px] font-bold tracking-tight leading-tight shrink-0">{ticker}</span>
            {sector && <span className="text-[10px] text-ink-3 truncate min-w-0">{sector}</span>}
          </div>
        </div>

        {/* Desktop-only columns: score sits right after the ticker (fixed-width
            ticker column keeps them close); sparkline, price and the star/chevron
            action cluster follow, in the same order as Opportunities' cards. */}
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
        <span className="hidden sm:block" />
        <span className="hidden sm:flex justify-center">
          {spark && spark.length >= 5 && <Sparkline data={spark} width={64} height={28} color={hue.stroke} opacity={0.75} />}
        </span>
        <div className="hidden sm:block text-right leading-tight">
          <div className="text-[15px] font-semibold num truncate">{price !== undefined ? price.toFixed(2) : "—"}</div>
          {change !== undefined && (
            <div className={`text-[10px] num ${change >= 0 ? "text-up-2" : "text-down-2"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div>
          )}
        </div>
        <span className="hidden sm:inline-flex justify-center">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            title="Remove from watchlist" aria-label="Remove from watchlist"
            className="text-gold-2 hover:text-down-2 cursor-pointer"
          >
            <Star size={13} strokeWidth={2} fill="currentColor" />
          </button>
        </span>

        <span className="flex justify-center">
          <ChevronDown size={14} strokeWidth={2.25} className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </div>
      </div>

      {open && (
        <div className="px-4 sm:px-3.5 pb-3.5 border-t border-line animate-fade-in">
          {/* Phones: the row's actions, which the compact row has no room for. */}
          <div className="sm:hidden flex gap-2 pt-2.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="btn flex-1 justify-center min-h-8 text-[12px] border-gold/50 text-gold-2">
              <Star size={13} strokeWidth={2} fill="currentColor" aria-hidden />Unwatch
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); openAlertFor(ticker, price); }}
              aria-label={`Price alert for ${ticker}`} title="Price alert" className="btn w-8 justify-center min-h-8 px-0 shrink-0">
              <Bell size={13} strokeWidth={2} aria-hidden />
            </button>
            <Link href={`/stock/${ticker}`} onClick={(e) => e.stopPropagation()} className="btn-sky flex-1 justify-center min-h-8 text-[12px]">
              <Telescope size={13} strokeWidth={2} aria-hidden />Deep Dive
            </Link>
          </div>
          {hasData ? (
            <StockDetailBody detail={detail} onOpenNews={onOpenNews} />
          ) : (
            // No technicals yet — but Deep Dive fetches its own data server-side,
            // so it stays available here. This is exactly when someone is most
            // likely to want the full research view.
            <div className="flex items-center justify-between gap-3 flex-wrap pt-2.5">
              <div className="flex items-center gap-2 text-[11px] text-ink-3 min-w-0">
                <RefreshCw size={12} strokeWidth={2.25} className="animate-spin shrink-0" aria-hidden />
                <span>
                  Loading technicals — use <span className="inline-flex items-center gap-0.5 text-ink-2"><RefreshCw size={10} strokeWidth={2.25} aria-hidden />Refresh</span> to retry
                  or <span className="inline-flex items-center gap-0.5 text-ink-2"><Sparkles size={10} strokeWidth={2.25} aria-hidden />AI Analysis</span> for full signals.
                </span>
              </div>
              <Link
                href={`/stock/${ticker}`}
                onClick={(e) => e.stopPropagation()}
                className="btn-sky text-[11px] px-3 py-1.5 font-medium shrink-0"
                title={`Open the full research view for ${ticker}`}
              >
                <Telescope size={13} strokeWidth={2} aria-hidden />
                Deep Dive
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
