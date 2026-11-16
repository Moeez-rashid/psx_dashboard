"use client";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { NewsAnalysis } from "@/lib/providers/types";
import { SentimentBadge } from "./NewsView";
import { Move } from "./ui/MobileRow";

interface Pulse {
  kse100: { value: number; change: number; changePercent: number } | null;
  breadth: { advancing: number; declining: number; unchanged: number; total: number };
}

/**
 * Phones, top of Signals: the market in one line (KSE-100, how many stocks
 * rose and fell) and today's news in two, tapping through to the News tab.
 * Enough context for the picks below without pushing them off the screen.
 */
export default function SignalsPulse({ na, onOpenNews }: { na: NewsAnalysis | null; onOpenNews: () => void }) {
  const [data, setData] = useState<Pulse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/market")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Pulse) => { if (alive) setData(d); })
      .catch(() => {});
    load();
    const id = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const k = data?.kse100;
  const b = data?.breadth;
  if (!k && !b && !na) return null;

  return (
    <div className="card p-0 mb-3 overflow-hidden">
      {(k || b) && (
        <div className="px-3 pt-2 pb-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-ink-3">KSE-100</span>
            {k && <span className="text-[14px] font-semibold num">{k.value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}</span>}
            {k && <span className="text-[11px] num"><Move pct={k.changePercent} abs={k.change} /></span>}
            <span className="flex-1" />
            {b && (
              <span className="text-[11px] num text-ink-3">
                <span className="text-up-2">{b.advancing}</span> up · <span className="text-down-2">{b.declining}</span> down
              </span>
            )}
          </div>
          {b && b.total > 0 && (
            <div className="flex h-1 rounded-full overflow-hidden bg-line-2/70 mt-1.5" aria-hidden>
              <div className="bg-up" style={{ width: `${(b.advancing / b.total) * 100}%` }} />
              <div className="bg-ink-3/40" style={{ width: `${(b.unchanged / b.total) * 100}%` }} />
              <div className="bg-down" style={{ width: `${(b.declining / b.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}
      {na?.summary && (
        <button
          type="button"
          onClick={onOpenNews}
          className="w-full flex items-start gap-2 border-t border-line px-3 py-2 text-left cursor-pointer active:bg-raised"
        >
          <span className="shrink-0 scale-90 origin-top-left"><SentimentBadge na={na} /></span>
          <span className="flex-1 min-w-0 text-[12px] text-ink-2 leading-snug line-clamp-2">{na.summary}</span>
          <ChevronRight size={15} className="text-ink-3 shrink-0 mt-0.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
