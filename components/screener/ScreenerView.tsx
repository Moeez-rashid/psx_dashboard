"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Star, X, ArrowUp, ArrowDown, RefreshCw, SlidersHorizontal, Check, Telescope } from "lucide-react";
import { fmtPKR, fmtVol } from "@/lib/format";
import { resolveSectorName } from "@/lib/sectors";
import { addToWatchlist, removeFromWatchlist } from "@/lib/local-store";
import { useWatchSet } from "@/lib/use-local";
import { Skeleton, EmptyState } from "@/components/ui/primitives";
import { TechnicalScoreChip } from "@/components/ui/TechnicalScore";
import { toast } from "@/components/ui/Toast";
import type { ScreenerRow } from "@/app/api/screener/route";

type SortKey = "s" | "p" | "chg" | "y1" | "mc" | "pe" | "dy" | "ts" | "av";

interface Filters {
  q: string;
  shariah: boolean;
  index: string;
  sector: string;
  maxPe: string;
  minYield: string;
  minCap: string;
  minVol: string;
  minScore: string;
}

const EMPTY: Filters = { q: "", shariah: false, index: "", sector: "", maxPe: "", minYield: "", minCap: "", minVol: "", minScore: "" };

const PRESETS: { id: string; label: string; hint: string; filters: Partial<Filters>; sort: SortKey; dir: 1 | -1 }[] = [
  { id: "setups", label: "Shariah · strong technicals", hint: "KMI All Share, Technical Score ≥ 60, liquid",
    filters: { shariah: true, minScore: "60", minVol: "200000" }, sort: "ts", dir: -1 },
  { id: "dividend", label: "High dividend", hint: "Yield ≥ 8%, market cap ≥ PKR 5B",
    filters: { minYield: "8", minCap: "5000000000" }, sort: "dy", dir: -1 },
  { id: "value", label: "Low P/E", hint: "Profitable, P/E ≤ 6, market cap ≥ PKR 5B",
    filters: { maxPe: "6", minCap: "5000000000" }, sort: "pe", dir: 1 },
  { id: "kse100", label: "KSE-100 by size", hint: "Index constituents, largest first",
    filters: { index: "KSE100" }, sort: "mc", dir: -1 },
  { id: "kmi30", label: "KMI-30", hint: "The 30 Shariah blue chips",
    filters: { index: "KMI30" }, sort: "ts", dir: -1 },
];

const INDEX_OPTIONS = [["", "Any index"], ["KSE100", "KSE-100"], ["KMI30", "KMI-30"], ["KSE30", "KSE-30"], ["PSXDIV20", "Dividend 20"]] as const;
const CAP_OPTIONS = [["", "Any size"], ["1000000000", "≥ PKR 1B"], ["5000000000", "≥ PKR 5B"], ["25000000000", "≥ PKR 25B"], ["100000000000", "≥ PKR 100B"]] as const;
const VOL_OPTIONS = [["", "Any liquidity"], ["50000", "≥ 50K / day"], ["200000", "≥ 200K / day"], ["1000000", "≥ 1M / day"]] as const;

const PAGE = 50;
const tone = (v: number) => (v > 0 ? "text-up-2" : v < 0 ? "text-down-2" : "text-ink-3");
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

const GRID = "grid-cols-[22px_minmax(0,1.5fr)_76px_70px_70px_78px_56px_60px_86px_28px]";

function HeaderCell({ label, k, sort, dir, onSort, right = true }: {
  label: string; k: SortKey; sort: SortKey; dir: 1 | -1; onSort: (k: SortKey) => void; right?: boolean;
}) {
  const active = sort === k;
  return (
    <button onClick={() => onSort(k)}
      className={`label inline-flex items-center gap-0.5 cursor-pointer hover:text-ink-2 ${right ? "justify-end" : ""} ${active ? "text-ink-2" : ""}`}>
      {label}
      {active && (dir === -1 ? <ArrowDown size={10} strokeWidth={2.5} aria-hidden /> : <ArrowUp size={10} strokeWidth={2.5} aria-hidden />)}
    </button>
  );
}

export default function ScreenerView({ initialSector = "" }: { initialSector?: string }) {
  const [rows, setRows] = useState<ScreenerRow[] | null>(null);
  const [technicals, setTechnicals] = useState(true);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [f, setF] = useState<Filters>({ ...EMPTY, sector: initialSector });
  const [sort, setSort] = useState<SortKey>("mc");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [preset, setPreset] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [more, setMore] = useState(false);
  const watching = useWatchSet();

  const fetchRows = useCallback(() =>
    fetch("/api/screener")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { rows: ScreenerRow[]; technicals: boolean; sessionDate: string | null }) => {
        setRows(d.rows); setTechnicals(d.technicals); setSessionDate(d.sessionDate); setFailed(false);
      })
      .catch(() => setFailed(true)), []);

  const load = () => { setFailed(false); fetchRows(); };

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const sectors = useMemo(() => {
    const codes = [...new Set((rows ?? []).map((r) => r.sec).filter(Boolean))];
    return codes.map((c) => [c, resolveSectorName(c)] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = f.q.trim().toUpperCase();
    const n = (s: string) => (s === "" ? null : Number(s));
    const maxPe = n(f.maxPe), minYield = n(f.minYield), minCap = n(f.minCap), minVol = n(f.minVol), minScore = n(f.minScore);
    const out = rows.filter((r) => {
      if (q && !r.s.includes(q) && !r.n.toUpperCase().includes(q)) return false;
      if (f.shariah && !r.sh) return false;
      if (f.index && !r.idx.includes(f.index)) return false;
      if (f.sector && r.sec !== f.sector) return false;
      if (maxPe !== null && !(r.pe > 0 && r.pe <= maxPe)) return false;
      if (minYield !== null && r.dy < minYield) return false;
      if (minCap !== null && r.mc < minCap) return false;
      if (minVol !== null && r.av < minVol) return false;
      if (minScore !== null && (r.ts === null || r.ts < minScore)) return false;
      return true;
    });
    // Unknown values (no P/E, no score) always sort last, whichever direction.
    const val = (r: ScreenerRow): number | string | null =>
      sort === "s" ? r.s : sort === "pe" ? (r.pe > 0 ? r.pe : null) : sort === "ts" ? r.ts : r[sort];
    return out.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va === null && vb === null) return a.s.localeCompare(b.s);
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return va === vb ? a.s.localeCompare(b.s) : (va - vb) * dir;
    });
  }, [rows, f, sort, dir]);

  const set = (patch: Partial<Filters>) => { setF((prev) => ({ ...prev, ...patch })); setPreset(null); setLimit(PAGE); };
  const onSort = (k: SortKey) => {
    if (sort === k) setDir((d) => (d === 1 ? -1 : 1));
    else { setSort(k); setDir(k === "s" || k === "pe" ? 1 : -1); }
    setLimit(PAGE);
  };
  const applyPreset = (p: typeof PRESETS[number]) => {
    if (preset === p.id) { setPreset(null); setF(EMPTY); setSort("mc"); setDir(-1); return; }
    setF({ ...EMPTY, ...p.filters }); setSort(p.sort); setDir(p.dir); setPreset(p.id); setLimit(PAGE);
    if (p.filters.maxPe || p.filters.minYield || p.filters.minCap || p.filters.minVol || p.filters.minScore) setMore(true);
  };
  const toggleStar = (r: ScreenerRow) => {
    if (watching.has(r.s)) { removeFromWatchlist(r.s); toast(`${r.s} removed from watchlist`); }
    else if (addToWatchlist(r.s, `${r.s} · ${resolveSectorName(r.sec)}`)) toast(`${r.s} added to watchlist`);
  };
  const activeCount = Object.entries(f).filter(([k, v]) => k !== "q" && v !== "" && v !== false).length;

  if (failed && !rows) {
    return (
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5">
        <EmptyState icon={RefreshCw} title="The screener couldn't load"
          description="PSX's data portal didn't answer. This usually clears within a few minutes."
          action={{ label: "Try again", icon: RefreshCw, onClick: load }} />
      </main>
    );
  }

  const shown = filtered.slice(0, limit);

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 text-[13px]">
      {/* Presets */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => applyPreset(p)} title={p.hint} aria-pressed={preset === p.id}
            className={`btn text-[11px] px-3 py-1.5 shrink-0 ${preset === p.id ? "border-up/60 text-up-2 bg-up-dim" : ""}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card py-3 px-3.5 mb-3">
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-44">
            <Search size={13} strokeWidth={2} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <input className="input pl-8 text-xs" placeholder="Symbol or company" value={f.q}
              onChange={(e) => set({ q: e.target.value })} aria-label="Search by symbol or company name" />
          </div>
          <button onClick={() => set({ shariah: !f.shariah })} aria-pressed={f.shariah}
            title="KMI All Share constituents — PSX's Shariah-compliant universe"
            className={`btn text-[11px] ${f.shariah ? "border-up/60 text-up-2 bg-up-dim" : ""}`}>
            {f.shariah && <Check size={12} strokeWidth={2.5} aria-hidden />}Shariah
          </button>
          <select className="input w-auto text-xs cursor-pointer" value={f.index} onChange={(e) => set({ index: e.target.value })} aria-label="Index">
            {INDEX_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="input w-auto max-w-44 text-xs cursor-pointer" value={f.sector} onChange={(e) => set({ sector: e.target.value })} aria-label="Sector">
            <option value="">Any sector</option>
            {sectors.map(([c, name]) => <option key={c} value={c}>{name}</option>)}
          </select>
          <button onClick={() => setMore((v) => !v)} aria-expanded={more}
            className={`btn text-[11px] ${more ? "bg-raised text-ink" : ""}`}>
            <SlidersHorizontal size={12} strokeWidth={2} aria-hidden />More
          </button>
          {(activeCount > 0 || f.q) && (
            <button onClick={() => { setF(EMPTY); setPreset(null); setLimit(PAGE); }} className="btn-ghost text-[11px] px-2">
              <X size={12} strokeWidth={2.5} aria-hidden />Clear
            </button>
          )}
        </div>
        {more && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2.5 pt-2.5 border-t border-line">
            <label className="flex flex-col gap-1"><span className="label">Max P/E</span>
              <input className="input text-xs" inputMode="decimal" placeholder="e.g. 8" value={f.maxPe}
                onChange={(e) => set({ maxPe: e.target.value.replace(/[^0-9.]/g, "") })} /></label>
            <label className="flex flex-col gap-1"><span className="label">Min yield %</span>
              <input className="input text-xs" inputMode="decimal" placeholder="e.g. 6" value={f.minYield}
                onChange={(e) => set({ minYield: e.target.value.replace(/[^0-9.]/g, "") })} /></label>
            <label className="flex flex-col gap-1"><span className="label">Min Technical Score</span>
              <input className="input text-xs" inputMode="numeric" placeholder="0–100" value={f.minScore}
                onChange={(e) => set({ minScore: e.target.value.replace(/[^0-9]/g, "") })} /></label>
            <label className="flex flex-col gap-1"><span className="label">Market cap</span>
              <select className="input text-xs cursor-pointer" value={f.minCap} onChange={(e) => set({ minCap: e.target.value })}>
                {CAP_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="flex flex-col gap-1"><span className="label">Avg volume (30d)</span>
              <select className="input text-xs cursor-pointer" value={f.minVol} onChange={(e) => set({ minVol: e.target.value })}>
                {VOL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
        <span className="text-[11px] text-ink-2 num">
          {rows ? <>{filtered.length} of {rows.length} stocks</> : "Loading the market…"}
        </span>
        <span className="text-[10px] text-ink-3">
          {rows && !technicals ? "Technical Scores unavailable right now — price history didn't load" : sessionDate ? `Technical Score as of session ${sessionDate}` : ""}
        </span>
      </div>

      {/* Desktop header */}
      <div className={`hidden md:grid ${GRID} gap-x-3 items-center px-3.5 py-1.5`}>
        <span />
        <HeaderCell label="Stock" k="s" sort={sort} dir={dir} onSort={onSort} right={false} />
        <HeaderCell label="Price" k="p" sort={sort} dir={dir} onSort={onSort} />
        <HeaderCell label="Day" k="chg" sort={sort} dir={dir} onSort={onSort} />
        <HeaderCell label="1 year" k="y1" sort={sort} dir={dir} onSort={onSort} />
        <HeaderCell label="Mkt cap" k="mc" sort={sort} dir={dir} onSort={onSort} />
        <HeaderCell label="P/E" k="pe" sort={sort} dir={dir} onSort={onSort} />
        <HeaderCell label="Yield" k="dy" sort={sort} dir={dir} onSort={onSort} />
        <HeaderCell label="Tech score" k="ts" sort={sort} dir={dir} onSort={onSort} right={false} />
        <span />
      </div>
      {/* Mobile sort */}
      <div className="md:hidden flex items-center gap-2 mb-2">
        <span className="text-[10px] text-ink-3">Sort</span>
        <select className="input w-auto text-xs cursor-pointer" value={sort} aria-label="Sort by"
          onChange={(e) => { const k = e.target.value as SortKey; setSort(k); setDir(k === "s" || k === "pe" ? 1 : -1); }}>
          <option value="mc">Market cap</option><option value="ts">Technical Score</option><option value="chg">Day change</option>
          <option value="y1">1-year change</option><option value="dy">Dividend yield</option><option value="pe">P/E (low first)</option>
          <option value="av">Avg volume</option><option value="s">Symbol</option>
        </select>
      </div>

      {!rows && <div className="space-y-1.5">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>}

      {rows && filtered.length === 0 && (
        <EmptyState icon={SlidersHorizontal} title="No stocks match these filters"
          description="Loosen a filter or clear them all to see the whole market." />
      )}

      <div className="space-y-1.5">
        {shown.map((r) => (
          <div key={r.s} className="bg-card border border-line hover:border-line-2 rounded-lg transition-colors">
            <div className="grid grid-cols-[22px_minmax(0,1fr)_auto] gap-x-2 items-center px-3.5 py-2.5 md:hidden">
              <StarBtn on={watching.has(r.s)} onClick={() => toggleStar(r)} symbol={r.s} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-bold tracking-tight">{r.s}</span>
                  {r.sh && <span className="text-[8px] font-bold tracking-wide text-up-2 border border-up/40 rounded px-1 py-px shrink-0">SHARIAH</span>}
                  {r.fl.map((x) => <span key={x} className="text-[8px] font-bold text-gold-2 border border-gold/40 rounded px-1 py-px shrink-0">{x}</span>)}
                </div>
                <div className="text-[10px] text-ink-3 truncate">{r.n}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] num text-ink-3 flex-wrap">
                  {r.ts !== null && <span className="text-ink-2">Tech {r.ts}/100</span>}
                  {r.pe > 0 && <span>P/E {r.pe.toFixed(1)}</span>}
                  {r.dy > 0 && <span>Yield {r.dy.toFixed(1)}%</span>}
                  <span>{fmtPKR(r.mc)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="text-right leading-tight">
                  <div className="text-[14px] font-semibold num">{r.p.toFixed(2)}</div>
                  <div className={`text-[10px] num ${tone(r.chg)}`}>{pct(r.chg)}</div>
                </div>
                <DeepDiveBtn symbol={r.s} />
              </div>
            </div>
            <div className={`hidden md:grid ${GRID} gap-x-3 items-center px-3.5 py-2`}>
              <StarBtn on={watching.has(r.s)} onClick={() => toggleStar(r)} symbol={r.s} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-bold tracking-tight">{r.s}</span>
                  {r.sh && <span className="text-[8px] font-bold tracking-wide text-up-2 border border-up/40 rounded px-1 py-px shrink-0" title="KMI All Share constituent">SHARIAH</span>}
                  {r.fl.map((x) => <span key={x} className="text-[8px] font-bold text-gold-2 border border-gold/40 rounded px-1 py-px shrink-0" title={x === "XD" ? "Ex-dividend" : x === "XB" ? "Ex-bonus" : "Ex-right"}>{x}</span>)}
                </div>
                <div className="text-[10px] text-ink-3 truncate">{r.n} · {resolveSectorName(r.sec)}</div>
              </div>
              <span className="text-[12px] font-medium num text-right">{r.p.toFixed(2)}</span>
              <span className={`text-[11px] num text-right ${tone(r.chg)}`}>{pct(r.chg)}</span>
              <span className={`text-[11px] num text-right ${tone(r.y1)}`}>{r.y1 === 0 ? "—" : pct(r.y1)}</span>
              <span className="text-[11px] num text-right text-ink-2" title={`30-day avg volume ${fmtVol(r.av)}`}>{r.mc > 0 ? fmtPKR(r.mc) : "—"}</span>
              <span className="text-[11px] num text-right text-ink-2">{r.pe > 0 ? r.pe.toFixed(1) : "—"}</span>
              <span className="text-[11px] num text-right text-ink-2">{r.dy > 0 ? `${r.dy.toFixed(1)}%` : "—"}</span>
              <span>{r.ts !== null ? <TechnicalScoreChip score={r.ts} /> : <span className="text-[11px] text-ink-3">—</span>}</span>
              <DeepDiveBtn symbol={r.s} />
            </div>
          </div>
        ))}
      </div>

      {rows && filtered.length > limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="btn w-full mt-3 py-2">
          Show {Math.min(PAGE, filtered.length - limit)} more · {filtered.length - limit} remaining
        </button>
      )}

      {rows && (
        <p className="text-[10px] text-ink-3 mt-4 leading-relaxed">
          Prices, valuation and index membership from the Pakistan Stock Exchange data portal. Shariah = KMI All Share constituent.
          Use the telescope button on a row to open its Deep Dive. Technical Score is this app&apos;s deterministic 0–100 setup score from price and volume — not a recommendation. Not financial advice.
        </p>
      )}
    </main>
  );
}

/** The only way from a screener row into research — rows themselves are not
 *  clickable, so selecting or double-clicking text never navigates away. */
function DeepDiveBtn({ symbol }: { symbol: string }) {
  return (
    <Link href={`/stock/${symbol}`} title={`Open Deep Dive for ${symbol}`} aria-label={`Open Deep Dive for ${symbol}`}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-line-2 text-ink-3 hover:text-sky-2 hover:border-sky/60 transition-colors shrink-0">
      <Telescope size={13} strokeWidth={2} aria-hidden />
    </Link>
  );
}

function StarBtn({ on, onClick, symbol }: { on: boolean; onClick: () => void; symbol: string }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      title={on ? "Remove from watchlist" : "Add to watchlist"}
      aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      className={`inline-flex justify-center cursor-pointer ${on ? "text-gold-2" : "text-ink-3 hover:text-gold-2"}`}>
      <Star size={14} strokeWidth={2} fill={on ? "currentColor" : "none"} />
    </button>
  );
}
