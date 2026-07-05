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
      <span className="text-xs font-semibold text-ink truncate">{m.symbol}</span>
      <span className="text-[10px] text-ink-3 truncate flex-1 hidden lg:block">{resolveSectorName(m.sector)}</span>
      <span className="flex-1 lg:hidden" />
      <span className="text-[11px] text-ink-2 num">{m.price.toFixed(2)}</span>
      <span className={`text-[11px] num w-14 text-right ${m.changePercent >= 0 ? "text-up-2" : "text-down-2"}`}>
        {m.changePercent >= 0 ? "+" : ""}{m.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

function MoverList({ movers, onAdd, watching, limit }: {
  movers: Mover[] | undefined;
  onAdd: (t: string) => void;
  watching: Set<string>;
  limit: number;
}) {
  if (!movers) return <>{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 my-1" />)}</>;
  return <>{movers.slice(0, limit).map(m => <MoverRow key={m.symbol} m={m} onAdd={onAdd} added={watching.has(m.symbol)} />)}</>;
}

const PANELS = [
  { id: "gainers", label: "Gainers", title: "Top gainers" },
  { id: "losers", label: "Losers", title: "Top losers" },
  { id: "active", label: "Active", title: "Most active" },
] as const;
type PanelId = typeof PANELS[number]["id"];

/** Live market overview — works with zero setup, no AI key required. */
export default function MarketStrip({ onAddWatch, watchingTickers }: {
  onAddWatch: (ticker: string) => void;
  watchingTickers: Set<string>;
}) {
  const [data, setData] = useState<MarketData | null>(null);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState<PanelId>("gainers");
  const [showAll, setShowAll] = useState(false);
  const limit = showAll ? 15 : 5;

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
  const listFor = (id: PanelId) =>
    id === "gainers" ? data?.gainers : id === "losers" ? data?.losers : data?.mostActive;

  return (
    <section className="mb-4 sm:mb-5">
      {/* Breadth bar */}
      <div className="flex items-center gap-3 mb-2.5 sm:mb-3">
        <span className="label">Breadth</span>
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

      {/* Section label + plain-text expand link (not a 4th box) */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="label">Market movers</span>
        <button
          onClick={() => setShowAll(v => !v)}
          className="text-[10px] text-ink-3 hover:text-sky-2 transition-colors cursor-pointer"
        >
          {showAll ? "Show less" : "View all →"}
        </button>
      </div>

      {/* Mobile: one compact card with segmented switcher */}
      <div className="sm:hidden card py-2.5 px-3">
        <div className="flex gap-1 mb-1.5 bg-inset rounded-lg p-0.5">
          {PANELS.map(p => (
            <button
              key={p.id}
              onClick={() => setPanel(p.id)}
              className={`flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-colors cursor-pointer
                ${panel === p.id ? "bg-raised text-ink" : "text-ink-3"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <MoverList movers={listFor(panel)} onAdd={onAddWatch} watching={watchingTickers} limit={limit} />
        <div className="text-[9px] text-ink-3 mt-1">tap ＋ to watchlist</div>
      </div>

      {/* Desktop: ONE bordered container, three cells split by hairline dividers */}
      <div className="hidden sm:grid card p-0 grid-cols-3 divide-x divide-line overflow-hidden">
        {PANELS.map(p => (
          <div key={p.id} className="py-3 px-3.5 min-w-0">
            <div className="label mb-1.5">{p.title}</div>
            <MoverList movers={listFor(p.id)} onAdd={onAddWatch} watching={watchingTickers} limit={limit} />
            {p.id === "active" && data?.mostActive?.[0] && (
              <div className="text-[9px] text-ink-3 mt-1.5">
                Top turnover {fmtVol(data.mostActive[0].volume)} shares · tap ＋ to watchlist
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
