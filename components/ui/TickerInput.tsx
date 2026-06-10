"use client";
import { useEffect, useRef, useState } from "react";
import { resolveSectorName } from "@/lib/sectors";

export interface SymbolEntry { s: string; sec: string; p: number; }

// Module-level cache so the symbol list is fetched once per session.
let symbolsCache: SymbolEntry[] | null = null;
let symbolsPromise: Promise<SymbolEntry[]> | null = null;

export function loadSymbols(): Promise<SymbolEntry[]> {
  if (symbolsCache) return Promise.resolve(symbolsCache);
  if (!symbolsPromise) {
    symbolsPromise = fetch("/api/symbols")
      .then(r => (r.ok ? r.json() : []))
      .then((list: SymbolEntry[]) => { symbolsCache = Array.isArray(list) ? list : []; return symbolsCache; })
      .catch(() => { symbolsPromise = null; return []; });
  }
  return symbolsPromise;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}

/** Ticker text input with PSX symbol autocomplete. */
export default function TickerInput({ value, onChange, onSubmit, placeholder = "Ticker", className = "" }: Props) {
  const [symbols, setSymbols] = useState<SymbolEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadSymbols().then(setSymbols); }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = value.trim().toUpperCase();
  const matches = q.length >= 1
    ? [
        ...symbols.filter(x => x.s.startsWith(q)),
        ...symbols.filter(x => !x.s.startsWith(q) && x.s.includes(q)),
      ].slice(0, 8)
    : [];
  const showList = open && matches.length > 0 && q !== matches[0]?.s;

  const choose = (sym: string) => {
    onChange(sym);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        className="input uppercase"
        placeholder={placeholder}
        value={value}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onChange={e => { onChange(e.target.value.toUpperCase()); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (showList && e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, matches.length - 1)); }
          else if (showList && e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") {
            if (showList && matches[hi]) { e.preventDefault(); choose(matches[hi].s); }
            else onSubmit?.();
          }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {showList && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-raised border border-line-2 rounded-lg overflow-hidden shadow-xl shadow-black/50 animate-fade-in">
          {matches.map((m, i) => (
            <button
              key={m.s}
              onMouseDown={e => { e.preventDefault(); choose(m.s); }}
              onMouseEnter={() => setHi(i)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left cursor-pointer ${i === hi ? "bg-inset" : ""}`}
            >
              <span className="text-xs font-semibold text-ink">{m.s}</span>
              <span className="text-[10px] text-ink-3 truncate flex-1 text-right">{resolveSectorName(m.sec)}</span>
              <span className="text-[10px] text-ink-2 num">{m.p.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
