"use client";
import { useEffect, useState } from "react";
import { fmtVol } from "@/lib/format";
import { resolveSectorName } from "@/lib/sectors";
import { Skeleton } from "./ui/primitives";

interface Mover {
  symbol: string;
  sector: string;
  price: number;
  changePercent: number;
  volume: number;
}
interface MarketData {
  breadth: { advancing: number; declining: number; unchanged: number; total: number };
  gainers: Mover[];
  losers: Mover[];
  mostActive: Mover[];
  timestamp: string;
}

function MoverRow({ m, onAdd, added }: { m: Mover; onAdd: (t: string) => void; added: boolean }) {
  return (
    <div className="group flex items-center gap-2 py-1 min-w-0">
      <button
        onClick={() => !added && onAdd(m.symbol)}
        title={added ? "Already in watchlist" : "Add to watchlist"}
        className={`text-[10px] w-4 text-center leading-none transition-colors cursor-pointer
          ${added ? "text-up-2" : "text-ink-3 hover:text-sky-2 group-hover:text-ink-2"}`}
      >
        {added ? "✓" : "+"}
      </button>
      <span className="text-xs font-semibold text-ink w-14 truncate">{m.symbol}</span>
      <span className="text-[10px] text-ink-3 truncate flex-1 hidden lg:block">{resolveSectorName(m.sector)}</span>
      <span className="text-[11px] text-ink-2 num">{m.price.toFixed(2)}</span>
      <span className={`text-[11px] num w-14 text-right ${m.changePercent >= 0 ? "text-up-2" : "text-down-2"}`}>
        {m.changePercent >= 0 ? "+" : ""}{m.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

/** Live market overview — works with zero setup, no AI key required. */
export default function MarketStrip({ onAddWatch, watchingTickers }: {
  onAddWatch: (ticker: string) => void;
  watchingTickers: Set<string>;
}) {
  const [data, setData] = useState<MarketData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/market")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (alive) { setData(d); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    load();
    const id = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (failed && !data) return null;

  const b = data?.breadth;
  const advPct = b && b.total > 0 ? (b.advancing / b.total) * 100 : 50;

  return (
    <section className="mb-5">
      {/* Breadth bar */}
      <div className="flex items-center gap-3 mb-3">
        <span className="label">Market breadth</span>
        {b ? (
          <>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-line-2 flex">
              <div className="bg-up h-full transition-all duration-700" style={{ width: `${advPct}%` }} />
              <div className="bg-down h-full flex-1" />
            </div>
            <span className="text-[11px] num text-up-2">{b.advancing} ▲</span>
            <span className="text-[11px] num text-down-2">{b.declining} ▼</span>
          </>
        ) : (
          <Skeleton className="flex-1 h-1.5" />
        )}
      </div>

      {/* Movers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          ["Top gainers", data?.gainers],
          ["Top losers", data?.losers],
          ["Most active", data?.mostActive],
        ] as const).map(([title, movers]) => (
          <div key={title} className="card py-3">
            <div className="label mb-1.5">{title}</div>
            {movers
              ? movers.slice(0, 5).map(m => (
                  <MoverRow key={m.symbol} m={m} onAdd={onAddWatch} added={watchingTickers.has(m.symbol)} />
                ))
              : [...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 my-1" />)}
            {title === "Most active" && movers && movers[0] && (
              <div className="text-[9px] text-ink-3 mt-1.5">
                Top turnover {fmtVol(movers[0].volume)} shares · tap ＋ to watchlist
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
