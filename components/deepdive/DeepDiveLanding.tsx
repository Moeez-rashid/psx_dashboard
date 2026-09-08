"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Clock3, ArrowRight } from "lucide-react";
import { loadSymbols, type SymbolEntry } from "@/components/ui/TickerInput";
import { resolveSectorName } from "@/lib/sectors";
import { timeAgo } from "@/lib/format";
import { getRecentResearch, type RecentResearchEntry } from "@/lib/recent-research";

/**
 * The Deep Dive entry point: search a stock and open its research page.
 * Deliberately the only thing on this page — no widgets, no fetched Deep
 * Dive data. The symbol list it searches is the same one TickerInput uses
 * elsewhere (module-cached, one fetch per session), so opening this page
 * costs nothing beyond what the app already loads.
 */

const TICKER_RE = /^[A-Z0-9]{2,10}$/;

function matches(symbols: SymbolEntry[], query: string): SymbolEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const tickerStarts = symbols.filter((s) => s.s.startsWith(q));
  const tickerContains = symbols.filter((s) => !s.s.startsWith(q) && s.s.includes(q));
  const nameMatches = symbols.filter(
    (s) => !s.s.startsWith(q) && !s.s.includes(q) && s.name && s.name.toUpperCase().includes(q)
  );
  return [...tickerStarts, ...tickerContains, ...nameMatches].slice(0, 8);
}

export default function DeepDiveLanding() {
  const router = useRouter();
  const [symbols, setSymbols] = useState<SymbolEntry[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [notFoundMsg, setNotFoundMsg] = useState("");
  const [recent, setRecent] = useState<RecentResearchEntry[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSymbols().then((s) => {
      setSymbols(s);
      setRecent(getRecentResearch());
    });
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const results = matches(symbols, query);
  const showList = open && results.length > 0;

  const go = (ticker: string) => {
    router.push(`/stock/${ticker}`);
  };

  const submit = () => {
    if (showList && results[hi]) {
      go(results[hi].s);
      return;
    }
    const q = query.trim().toUpperCase();
    if (!q) return;
    // An exact known symbol always navigates. An unknown-but-plausible ticker
    // shape still navigates — /stock/[ticker] has its own honest 404 for a
    // symbol that truly doesn't exist, so there's no need to duplicate that
    // check here. Anything else (a partial company name never selected from
    // the dropdown) gets a nudge instead of a doomed navigation.
    if (symbols.some((s) => s.s === q) || TICKER_RE.test(q)) {
      setNotFoundMsg("");
      go(q);
    } else {
      setNotFoundMsg(`Select a match below, or enter a ticker symbol directly.`);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center px-4 relative overflow-hidden min-h-[calc(100vh-6.5rem)]">
      <DeepDiveBackground />

      <div className="relative w-full max-w-xl mx-auto text-center py-16">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-ink">Deep Dive</h1>
        <p className="text-sm text-ink-2 mt-3">Search a stock to investigate</p>

        <div ref={wrapRef} className="relative mt-9 text-left">
          <div className="relative">
            <Search size={16} strokeWidth={2} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setHi(0);
                setNotFoundMsg("");
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (showList && e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
                else if (showList && e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); submit(); }
                else if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Search ticker or company…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-card border border-line-2 rounded-2xl pl-11 pr-4 py-4 text-[15px] text-ink
                         placeholder:text-ink-3 outline-none focus:border-up/50 transition-colors shadow-2xl shadow-black/40"
            />
          </div>

          {showList && (
            <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-raised border border-line-2 rounded-xl overflow-hidden shadow-2xl shadow-black/50 animate-fade-in">
              {results.map((r, i) => (
                <button
                  key={r.s}
                  onMouseDown={(e) => { e.preventDefault(); go(r.s); }}
                  onMouseEnter={() => setHi(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors ${i === hi ? "bg-inset" : ""}`}
                >
                  <span className="text-[13px] font-semibold text-ink shrink-0 w-16">{r.s}</span>
                  <span className="text-[11px] text-ink-3 truncate flex-1">{r.name ?? resolveSectorName(r.sec)}</span>
                  <span className="text-[11px] text-ink-2 num shrink-0">{r.p.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}

          {!showList && notFoundMsg && (
            <p className="text-[11px] text-gold-2 mt-2.5 px-1">{notFoundMsg}</p>
          )}
        </div>

        {recent.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-ink-3 mb-3">
              <Clock3 size={11} strokeWidth={2} aria-hidden />
              Recent research
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {recent.map((r) => (
                <button
                  key={r.ticker}
                  onClick={() => go(r.ticker)}
                  className="group inline-flex items-center gap-1.5 bg-inset border border-line hover:border-line-2 rounded-full pl-3 pr-2.5 py-1.5 text-[11px] text-ink-2 hover:text-ink transition-colors cursor-pointer"
                  title={r.name ?? r.ticker}
                >
                  <span className="font-semibold text-ink">{r.ticker}</span>
                  <span className="text-ink-3">{timeAgo(r.at)}</span>
                  <ArrowRight size={10} strokeWidth={2.5} className="text-ink-3 group-hover:text-ink-2 transition-colors" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * Restrained architectural backdrop: a faint square grid plus a handful of
 * larger outlined modules, all well under 10% opacity so the search box stays
 * the only thing the eye actually reads. No gradients, no color beyond the
 * app's own green accent used once, very quietly, behind the search box.
 */
function DeepDiveBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-line-2) 1px, transparent 1px), linear-gradient(90deg, var(--color-line-2) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div
        className="absolute -top-16 -left-24 w-72 h-72 border rounded-3xl opacity-[0.06]"
        style={{ borderColor: "var(--color-ink-3)", transform: "rotate(8deg)" }}
      />
      <div
        className="absolute bottom-[-4rem] right-[-3rem] w-96 h-96 border rounded-[2.5rem] opacity-[0.05]"
        style={{ borderColor: "var(--color-ink-3)", transform: "rotate(-6deg)" }}
      />
      <div
        className="absolute top-1/3 right-10 w-24 h-24 border rounded-2xl opacity-[0.05] hidden sm:block"
        style={{ borderColor: "var(--color-ink-3)", transform: "rotate(20deg)" }}
      />
      <div
        className="absolute left-1/2 top-1/2 w-[36rem] h-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--color-up) 6%, transparent) 0%, transparent 70%)" }}
      />
    </div>
  );
}
