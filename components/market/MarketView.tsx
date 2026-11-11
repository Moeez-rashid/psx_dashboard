"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Plus, Check, ChevronDown, ArrowUpToLine, ArrowDownToLine, RefreshCw } from "lucide-react";
import { fmtPKR, fmtVol, timeAgo } from "@/lib/format";
import { resolveSectorName } from "@/lib/sectors";
import { addToWatchlist } from "@/lib/local-store";
import { useWatchSet } from "@/lib/use-local";
import { Skeleton, EmptyState } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toast";
import type { MarketMover, SectorPerformance } from "@/app/api/market/route";
import type { IndexRow, MarketStatus, CircuitBoard } from "@/lib/psx-market";

interface MarketData {
  breadth: { advancing: number; declining: number; unchanged: number; total: number };
  gainers: MarketMover[];
  losers: MarketMover[];
  mostActive: MarketMover[];
  indices: IndexRow[];
  status: MarketStatus | null;
  sectors: SectorPerformance[];
  circuit: CircuitBoard | null;
  sessionDate: string | null;
  timestamp: string;
}

const INDEX_NAMES: Record<string, string> = {
  KSE100: "KSE-100", KMI30: "KMI-30 · Shariah", KSE30: "KSE-30", ALLSHR: "All Share",
  KMIALLSHR: "KMI All Share · Shariah", KSE100PR: "KSE-100 Price Return", PSXDIV20: "Dividend 20",
  BKTI: "Banks Tradable", OGTI: "Oil & Gas Tradable", MII30: "Meezan Islamic 30", UPP9: "UBL Pakistan Pension 9",
  NITPGI: "NIT Pakistan Gateway", NBPPGI: "NBP Pakistan Growth", MZNPI: "Meezan Pakistan", JSMFI: "JS Momentum Factor",
  ACI: "Alfalah Consumer", JSGBKTI: "JS Global Banking", HBLTTI: "HBL Total Treasury",
};
const HEADLINE = ["KSE100", "KMI30", "KSE30", "ALLSHR"];

const tone = (v: number) => (v > 0 ? "text-up-2" : v < 0 ? "text-down-2" : "text-ink-3");
const signed = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;

/** Heat-tile background: hue by direction, strength by size of move (saturating at ±3%). */
function heat(changePercent: number): string {
  const strength = Math.min(1, Math.abs(changePercent) / 3);
  if (strength < 0.03) return "var(--color-card)";
  const color = changePercent > 0 ? "var(--color-up)" : "var(--color-down)";
  return `color-mix(in srgb, ${color} ${Math.round(10 + strength * 38)}%, var(--color-card))`;
}

function IndexTile({ ix }: { ix: IndexRow }) {
  const span = ix.high - ix.low;
  const pos = span > 0 ? Math.min(100, Math.max(0, ((ix.value - ix.low) / span) * 100)) : 50;
  return (
    <div className="card py-3 px-3.5">
      <div className="label mb-1.5 truncate">{INDEX_NAMES[ix.code] ?? ix.code}</div>
      <div className="text-[17px] font-bold num leading-none">
        {ix.value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className={`flex items-center gap-1 text-[11px] num mt-1.5 ${tone(ix.change)}`}>
        {ix.change >= 0 ? <TrendingUp size={11} strokeWidth={2.5} aria-hidden /> : <TrendingDown size={11} strokeWidth={2.5} aria-hidden />}
        {signed(ix.change)} ({signed(ix.changePercent)}%)
      </div>
      {span > 0 && (
        <div className="mt-2.5" title={`Day range ${ix.low.toLocaleString()} – ${ix.high.toLocaleString()}`}>
          <div className="relative h-[3px] rounded-full bg-line-2/70">
            <span className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-ink" style={{ left: `calc(${pos}% - 3px)` }} />
          </div>
          <div className="flex justify-between text-[9px] text-ink-3 num mt-1">
            <span>{Math.round(ix.low).toLocaleString()}</span><span>day range</span><span>{Math.round(ix.high).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MoverList({ title, movers, watching, onAdd, showVolume }: {
  title: string; movers: MarketMover[]; watching: Set<string>; onAdd: (m: MarketMover) => void; showVolume?: boolean;
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="label px-3.5 py-2.5 border-b border-line">{title}</div>
      <div className="px-2 py-1">
        {movers.length === 0 && <p className="text-[11px] text-ink-3 px-1.5 py-3">Nothing to show.</p>}
        {movers.map((m) => (
          <div key={m.symbol} className="group flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-inset min-w-0">
            <button
              onClick={() => !watching.has(m.symbol) && onAdd(m)}
              title={watching.has(m.symbol) ? "On your watchlist" : "Add to watchlist"}
              aria-label={watching.has(m.symbol) ? `${m.symbol} is on your watchlist` : `Add ${m.symbol} to watchlist`}
              className={`w-4 shrink-0 flex justify-center cursor-pointer ${watching.has(m.symbol) ? "text-up-2" : "text-ink-3 hover:text-sky-2"}`}
            >
              {watching.has(m.symbol) ? <Check size={12} strokeWidth={2.5} /> : <Plus size={12} strokeWidth={2.5} />}
            </button>
            <Link href={`/stock/${m.symbol}`} className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-semibold text-ink shrink-0">{m.symbol}</span>
              <span className="text-[10px] text-ink-3 truncate flex-1">{resolveSectorName(m.sector)}</span>
              {showVolume && <span className="text-[10px] text-ink-3 num shrink-0">{fmtVol(m.volume)}</span>}
              <span className="text-[11px] text-ink-2 num shrink-0">{m.price.toFixed(2)}</span>
              <span className={`text-[11px] num w-14 text-right shrink-0 ${tone(m.changePercent)}`}>{signed(m.changePercent)}%</span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MarketView() {
  const [data, setData] = useState<MarketData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shariahOnly, setShariahOnly] = useState(false);
  const [allIndices, setAllIndices] = useState(false);
  const watching = useWatchSet();

  // Only ever sets state from the fetch callbacks, never synchronously.
  const fetchMarket = useCallback(() =>
    fetch("/api/market")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: MarketData) => { setData(d); setFailed(false); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false)), []);

  const load = () => { setLoading(true); fetchMarket(); };

  useEffect(() => {
    fetchMarket();
    const id = setInterval(fetchMarket, 90_000);
    return () => clearInterval(id);
  }, [fetchMarket]);

  const onAdd = (m: MarketMover) => {
    if (addToWatchlist(m.symbol, `${m.symbol} · ${resolveSectorName(m.sector)}`)) toast(`${m.symbol} added to watchlist`);
  };

  if (failed && !data) {
    return (
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5">
        <EmptyState
          icon={RefreshCw}
          title="PSX market data is unavailable right now"
          description="The exchange's data portal didn't answer. This usually clears within a few minutes."
          action={{ label: "Try again", icon: RefreshCw, onClick: load }}
        />
      </main>
    );
  }

  const st = data?.status ?? null;
  const b = data?.breadth;
  const pick = (list: MarketMover[] | undefined) =>
    (list ?? []).filter((m) => !shariahOnly || m.shariah).slice(0, 8);
  const headline = HEADLINE.map((c) => data?.indices.find((i) => i.code === c)).filter((x): x is IndexRow => !!x);
  const others = (data?.indices ?? []).filter((i) => !HEADLINE.includes(i.code));

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 space-y-6 text-[13px]">

      {/* ── Session status ── */}
      <section className="card py-3 px-3.5">
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
          {st ? (
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.isOpen ? "border-up/50 text-up-2 bg-up-dim" : "border-line-2 text-ink-2"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.isOpen ? "bg-up animate-pulse" : "bg-ink-3"}`} />
              Market {st.state.toLowerCase()}
            </span>
          ) : <Skeleton className="h-6 w-28" />}
          {st && <span className="text-[11px] text-ink-3 num">PSX summary · {st.date}, {st.time}</span>}
          <span className="flex-1" />
          {st && (
            <div className="flex gap-4 text-[11px] num">
              <span><span className="text-ink-3">Trades </span><span className="text-ink">{st.trades.toLocaleString()}</span></span>
              <span><span className="text-ink-3">Volume </span><span className="text-ink">{fmtVol(st.volume)}</span></span>
              <span><span className="text-ink-3">Value </span><span className="text-ink">PKR {fmtPKR(st.value)}</span></span>
            </div>
          )}
          <button onClick={load} className="btn p-1.5" title="Refresh" aria-label="Refresh market data">
            <RefreshCw size={13} strokeWidth={2} className={loading ? "animate-spin" : ""} aria-hidden />
          </button>
        </div>
        {b && b.total > 0 && (
          <div className="mt-3">
            <div className="flex h-1.5 rounded-full overflow-hidden bg-line-2/70" role="img"
              aria-label={`${b.advancing} advancing, ${b.declining} declining, ${b.unchanged} unchanged`}>
              <div className="bg-up" style={{ width: `${(b.advancing / b.total) * 100}%` }} />
              <div className="bg-ink-3/50" style={{ width: `${(b.unchanged / b.total) * 100}%` }} />
              <div className="bg-down" style={{ width: `${(b.declining / b.total) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[10px] num mt-1.5">
              <span className="text-up-2">{b.advancing} advancing</span>
              <span className="text-ink-3">{b.unchanged} unchanged</span>
              <span className="text-down-2">{b.declining} declining</span>
            </div>
          </div>
        )}
      </section>

      {/* ── Indices ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="label">Indices</h2>
          {others.length > 0 && (
            <button onClick={() => setAllIndices((v) => !v)} className="inline-flex items-center gap-1 text-[10px] text-ink-3 hover:text-ink-2 cursor-pointer">
              {allIndices ? "Fewer" : `All ${data?.indices.length} indices`}
              <ChevronDown size={11} strokeWidth={2.5} className={`transition-transform ${allIndices ? "rotate-180" : ""}`} aria-hidden />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {data ? headline.map((ix) => <IndexTile key={ix.code} ix={ix} />) : [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        {allIndices && (
          <div className="card p-0 mt-2.5 divide-y divide-line">
            {others.map((ix) => (
              <div key={ix.code} className="flex items-center gap-3 px-3.5 py-2">
                <span className="text-xs text-ink flex-1 truncate">{INDEX_NAMES[ix.code] ?? ix.code}</span>
                <span className="text-[11px] text-ink-2 num">{ix.value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}</span>
                <span className={`text-[11px] num w-16 text-right ${tone(ix.changePercent)}`}>{signed(ix.changePercent)}%</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Sector heatmap ── */}
      <section>
        <div className="flex items-baseline justify-between mb-2 gap-3">
          <h2 className="label">Sectors</h2>
          <span className="text-[10px] text-ink-3 text-right">cap-weighted day change<span className="hidden sm:inline"> · tap a sector to screen it</span></span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data
            ? data.sectors.slice(0, 20).map((s) => (
                <Link
                  key={s.code}
                  href={`/screener?sector=${s.code}`}
                  className="rounded-xl border border-line hover:border-line-2 px-3 py-2.5 transition-colors min-w-0"
                  style={{ background: heat(s.changePercent) }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold text-ink truncate">{s.name}</span>
                    <span className={`text-xs font-bold num shrink-0 ${tone(s.changePercent)}`}>{signed(s.changePercent)}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1 text-[10px] text-ink-2 num">
                    <span>{s.advancing}↑ {s.declining}↓ · {s.count}</span>
                    <span className="truncate">PKR {fmtPKR(s.marketCap)}</span>
                  </div>
                </Link>
              ))
            : [...Array(8)].map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </section>

      {/* ── Movers ── */}
      <section>
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <h2 className="label">
            Movers{data?.sessionDate && <span className="normal-case tracking-normal font-normal"> · session {data.sessionDate}</span>}
          </h2>
          <button
            onClick={() => setShariahOnly((v) => !v)}
            aria-pressed={shariahOnly}
            className={`btn text-[10px] px-2.5 py-1 ${shariahOnly ? "border-up/60 text-up-2 bg-up-dim" : ""}`}
            title="Limit to KMI All Share (Shariah-compliant) constituents"
          >
            {shariahOnly && <Check size={11} strokeWidth={2.5} aria-hidden />}Shariah only
          </button>
        </div>
        {data ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
            <MoverList title="Top gainers" movers={pick(data.gainers)} watching={watching} onAdd={onAdd} />
            <MoverList title="Top losers" movers={pick(data.losers)} watching={watching} onAdd={onAdd} />
            <MoverList title="Most active · by value" movers={pick(data.mostActive)} watching={watching} onAdd={onAdd} showVolume />
          </div>
        ) : <Skeleton className="h-64" />}
      </section>

      {/* ── Circuit breakers ── */}
      {data?.circuit && (data.circuit.upper.length > 0 || data.circuit.lower.length > 0) && (
        <section>
          <div className="flex items-baseline justify-between mb-2 gap-3">
            <h2 className="label">At circuit limits</h2>
            <span className="text-[10px] text-ink-3">PSX halts a share at ±10% from its previous close</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {([
              ["Upper lock", data.circuit.upper, ArrowUpToLine, "text-up-2", "border-up/40"],
              ["Lower lock", data.circuit.lower, ArrowDownToLine, "text-down-2", "border-down/40"],
            ] as const).map(([title, rows, Icon, color, border]) => (
              <div key={title} className="card py-3 px-3.5">
                <div className={`flex items-center gap-1.5 text-[11px] font-semibold mb-2 ${color}`}>
                  <Icon size={13} strokeWidth={2.25} aria-hidden />{title}
                  <span className="text-ink-3 font-normal num">· {rows.length}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[11px] text-ink-3">None this session.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {rows.slice(0, 24).map((r) => (
                      <Link key={r.symbol} href={`/stock/${r.symbol}`}
                        title={`${r.price.toFixed(2)} · ${signed(r.changePercent)}% · ${fmtVol(r.volume)} shares`}
                        className={`text-[11px] font-medium num border rounded-md px-2 py-0.5 hover:bg-inset ${border} text-ink`}>
                        {r.symbol}
                      </Link>
                    ))}
                    {rows.length > 24 && <span className="text-[10px] text-ink-3 self-center">+{rows.length - 24} more</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {data && (
        <p className="text-[10px] text-ink-3">
          Source: Pakistan Stock Exchange data portal · updated {timeAgo(data.timestamp)} · not financial advice
        </p>
      )}
    </main>
  );
}
