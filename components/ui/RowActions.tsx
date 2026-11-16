"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Star, X } from "lucide-react";
import { openAlertFor } from "@/components/AlertsCenter";

const CHIP = "inline-flex items-center gap-1 h-7 rounded-full border text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors";

/**
 * Phones, bottom of an opened row: small chips, not full-width buttons.
 * Watch/Unwatch or Remove (two taps), Alert, and Deep Dive on the right.
 */
export default function RowActions({ ticker, price, watching, onToggleWatch, onRemove, removeLabel = "Remove" }: {
  ticker: string;
  price?: number;
  /** Watch toggle; omit for holdings. */
  watching?: boolean;
  onToggleWatch?: () => void;
  /** Two-tap remove (holdings). */
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div className="sm:hidden flex items-center gap-1.5 pt-2.5">
      {onToggleWatch && (
        <button type="button" onClick={stop(onToggleWatch)} aria-pressed={!!watching}
          className={`${CHIP} px-2.5 ${watching ? "border-gold/50 text-gold-2" : "border-line-2 text-ink-2"}`}>
          <Star size={12} strokeWidth={2} fill={watching ? "currentColor" : "none"} aria-hidden />
          {watching ? "Watching" : "Watch"}
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={stop(() => (armed ? onRemove() : setArmed(true)))}
          className={`${CHIP} px-2.5 ${armed ? "border-down/60 text-down-2" : "border-line-2 text-ink-2"}`}>
          <X size={12} strokeWidth={2} aria-hidden />{armed ? "Tap again" : removeLabel}
        </button>
      )}
      <button type="button" onClick={stop(() => openAlertFor(ticker, price))} aria-label={`Price alert for ${ticker}`} title="Price alert"
        className={`${CHIP} w-7 justify-center border-line-2 text-ink-2`}>
        <Bell size={12} strokeWidth={2} aria-hidden />
      </button>
      <span className="flex-1" />
      <Link href={`/stock/${ticker}`} onClick={(e) => e.stopPropagation()}
        className={`${CHIP} pl-3 pr-2 border-sky/40 bg-sky-dim text-sky-2`}>
        Deep Dive<ChevronRight size={13} strokeWidth={2.25} aria-hidden />
      </Link>
    </div>
  );
}
