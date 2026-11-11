"use client";
import { Bell, Star, Calculator } from "lucide-react";
import { addToWatchlist, removeFromWatchlist } from "@/lib/local-store";
import { useWatchSet } from "@/lib/use-local";
import { OPEN_TOOLS_EVENT } from "@/lib/nav";
import { openAlertFor } from "@/components/AlertsCenter";
import { toast } from "@/components/ui/Toast";

/** Watchlist / alert / calculator shortcuts for one stock. */
export default function StockActions({ ticker, price, label }: { ticker: string; price?: number | null; label?: string }) {
  const watching = useWatchSet().has(ticker);

  const toggle = () => {
    if (watching) { removeFromWatchlist(ticker); toast(`${ticker} removed from watchlist`); }
    else if (addToWatchlist(ticker, label ?? ticker)) toast(`${ticker} added to watchlist`);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button onClick={toggle} aria-pressed={watching} className={`btn text-[11px] ${watching ? "border-gold/50 text-gold-2" : ""}`}>
        <Star size={12} strokeWidth={2} fill={watching ? "currentColor" : "none"} aria-hidden />
        {watching ? "Watching" : "Watch"}
      </button>
      <button onClick={() => openAlertFor(ticker, price ?? undefined)} className="btn text-[11px]">
        <Bell size={12} strokeWidth={2} aria-hidden />Alert
      </button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TOOLS_EVENT, { detail: { entry: price ?? undefined } }))}
        className="btn text-[11px]"
      >
        <Calculator size={12} strokeWidth={2} aria-hidden />Plan trade
      </button>
    </div>
  );
}
