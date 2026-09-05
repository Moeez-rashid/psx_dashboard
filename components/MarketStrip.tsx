"use client";
import { useEffect, useState } from "react";
import { Check, Plus, TrendingUp, TrendingDown } from "lucide-react";
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
  kse100: { value: number; change: number; changePercent: number } | null;
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
        aria-label={added ? "Already in watchlist" : "Add to watchlist"}
        className={`w-4 flex items-center justify-center leading-none transition-colors cursor-pointer
          ${added ? "text-up-2" : "text-ink-3 hover:text-sky-2 group-hover:text-ink-2"}`}
      >
        {added ? <Check size={12} strokeWidth={2.5} /> : <Plus size={12} strokeWidth={2.5} />}
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

/** Index points strip — KSE-100 value + day change inside the movers container.
 *  Falls back to the advancing/declining counts when the index scrape fails. */
function IndexStrip({ data }: { data: MarketData | null }) {
  const k = data?.kse100;
  const b = data?.breadth;
  return (
    <div className="flex items-center gap-3 px-3.5 py-2 border-b border-line min-w-0">
      <span className="label shrink-0">KSE-100</span>
      {k ? (
        <>
          <span className="text-[13px] font-semibold num text-ink">{k.value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className={`inline-flex items-center gap-0.5 text-[11px] num ${k.change >= 0 ? "text-up-2" : "text-down-2"}`}>
            {k.change >= 0 ? <TrendingUp size={11} strokeWidth={2.5} /> : <TrendingDown size={11} strokeWidth={2.5} />}
            {k.change >= 0 ? "+" : ""}{k.change.toLocaleString("en-PK", { maximumFractionDigits: 2 })} ({k.changePercent >= 0 ? "+" : ""}{k.changePercent.toFixed(2)}%)
          </span>
          {b && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-ink-3 num ml-auto">
              {b.advancing} <TrendingUp size={10} strokeWidth={2.5} /> · {b.declining} <TrendingDown size={10} strokeWidth={2.5} />
            </span>
          )}
        </>
      ) : b ? (
        <span className="inline-flex items-center gap-1 text-[11px] num text-ink-2">
          {b.advancing} <TrendingUp size={11} strokeWidth={2.5} className="text-up-2" /> · {b.declining} <TrendingDown size={11} strokeWidth={2.5} className="text-down-2" />
        </span>
      ) : (
        <Skeleton className="flex-1 h-3.5 max-w-40" />
      )}
    </div>
  );
}

const PANELS = [
  { id: "gainers", label: "Gainers", title: "Top gainers", compactTitle: "Top gainer" },
  { id: "losers", label: "Losers", title: "Top losers", compactTitle: "Top loser" },
  { id: "active", label: "Active", title: "Most active", compactTitle: "Most active" },
] as const;
type PanelId = typeof PANELS[number]["id"];

/** Live market overview — works with zero setup, no AI key required.
 *  variant "compact" (Buy Opportunities): breadth + one mover per panel + a link to the full section.
 *  variant "full" (News): breadth + three ranked lists with quick-add and a 5⇄15 toggle. */
export default function MarketStrip({ variant = "full", onAddWatch, watchingTickers, onViewAll }: {
  variant?: "compact" | "full";
  onAddWatch?: (ticker: string) => void;
  watchingTickers?: Set<string>;
  onViewAll?: () => void;
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

  const listFor = (id: PanelId) =>
    id === "gainers" ? data?.gainers : id === "losers" ? data?.losers : data?.mostActive;

  // ── Compact: a one-glance pulse for the scanner tab ────────────────────────
  if (variant === "compact") {
    return (
      <section className="mb-4 sm:mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="label">Market movers</span>
          {onViewAll && (
            <button onClick={onViewAll} className="text-[10px] text-ink-3 hover:text-sky-2 transition-colors cursor-pointer">
              All movers →
            </button>
          )}
        </div>
        <div className="card p-0 overflow-hidden">
          <IndexStrip data={data} />
          <div className="grid grid-cols-3 divide-x divide-line">
            {PANELS.map(p => {
              const m = listFor(p.id)?.[0];
              return (
                <div key={p.id} className="py-2.5 px-3 min-w-0">
                  <div className="label mb-1">{p.compactTitle}</div>
                  {m ? (
                    <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
                      <span className="text-xs font-semibold text-ink truncate">{m.symbol}</span>
                      <span className={`text-[11px] num ${m.changePercent >= 0 ? "text-up-2" : "text-down-2"}`}>
                        {m.changePercent >= 0 ? "+" : ""}{m.changePercent.toFixed(2)}%
                      </span>
                      {p.id === "active" && (
                        <span className="text-[9px] text-ink-3 num w-full">{fmtVol(m.volume)} shares</span>
                      )}
                    </div>
                  ) : (
                    <Skeleton className="h-4 w-4/5" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  // ── Full: the ranked lists (News page) ─────────────────────────────────────
  const watching = watchingTickers ?? new Set<string>();
  const add = onAddWatch ?? (() => {});
  return (
    <section>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label">Market movers</span>
        <button
          onClick={() => setShowAll(v => !v)}
          className="text-[10px] text-ink-3 hover:text-sky-2 transition-colors cursor-pointer"
        >
          {showAll ? "Show less" : "View all →"}
        </button>
      </div>

      {/* One compact card: segmented panel switcher, 5 rows (View all → 15) */}
      <div className="card p-0 overflow-hidden">
        <IndexStrip data={data} />
        <div className="py-2.5 px-3">
          <div className="flex gap-1 mb-1.5 bg-inset rounded-lg p-0.5 sm:max-w-xs">
            {PANELS.map(p => (
              <button
                key={p.id}
                onClick={() => setPanel(p.id)}
                className={`flex-1 text-[10px] font-semibold py-1.5 px-3 rounded-md transition-colors cursor-pointer
                  ${panel === p.id ? "bg-raised text-ink" : "text-ink-3"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <MoverList movers={listFor(panel)} onAdd={add} watching={watching} limit={limit} />
          <div className="text-[9px] text-ink-3 mt-1">tap ＋ to watchlist</div>
        </div>
      </div>
    </section>
  );
}
