"use client";
import { Bell, Star, Calculator } from "lucide-react";
import { addToWatchlist, removeFromWatchlist } from "@/lib/local-store";
import { useWatchSet } from "@/lib/use-local";
import { OPEN_TOOLS_EVENT } from "@/lib/nav";
import { openAlertFor } from "@/components/AlertsCenter";
import { toast } from "@/components/ui/Toast";

/** Watchlist / alert / calculator shortcuts for one stock. */
export default function StockActions({ ticker, price, label, bar = false }: {
  ticker: string; price?: number | null; label?: string;
  /** Stock page on phones: pinned above the tab bar as three equal, thumb-sized buttons. */
  bar?: boolean;
}) {
  const watching = useWatchSet().has(ticker);

  const toggle = () => {
    if (watching) { removeFromWatchlist(ticker); toast(`${ticker} removed from watchlist`); }
    else if (addToWatchlist(ticker, label ?? ticker)) toast(`${ticker} added to watchlist`);
  };

  const btn = bar
    ? "flex-1 justify-center whitespace-nowrap px-2 min-h-8 text-[12px] md:flex-none md:min-h-0 md:px-3 md:text-[11px]"
    : "text-[11px]";
  const icon = bar ? 13 : 12;
  const buttons = (
    <>
      <button onClick={toggle} aria-pressed={watching} className={`btn ${btn} ${watching ? "border-gold/50 text-gold-2" : ""}`}>
        <Star size={icon} strokeWidth={2} fill={watching ? "currentColor" : "none"} aria-hidden />
        {watching ? "Watching" : "Watch"}
      </button>
      <button onClick={() => openAlertFor(ticker, price ?? undefined)} className={`btn ${btn}`}>
        <Bell size={icon} strokeWidth={2} aria-hidden />Alert
      </button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TOOLS_EVENT, { detail: { entry: price ?? undefined } }))}
        className={`btn ${btn}`}
      >
        <Calculator size={icon} strokeWidth={2} aria-hidden />Plan trade
      </button>
    </>
  );

  if (!bar) return <div className="flex items-center gap-1.5 flex-wrap">{buttons}</div>;
  return (
    <>
      {/* Phones: fixed just above the tab bar (the page adds the matching spacer at its end). */}
      <div className="fixed md:static inset-x-0 z-30 bottom-[calc(52px+env(safe-area-inset-bottom))]
                      flex gap-2 px-4 py-1.5 md:p-0 bg-surface/92 md:bg-transparent backdrop-blur-md md:backdrop-blur-none
                      border-t border-line md:border-0">
        {buttons}
      </div>
    </>
  );
}
