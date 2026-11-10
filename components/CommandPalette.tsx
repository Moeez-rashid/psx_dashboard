"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell, Calculator, Plus, Check, CornerDownLeft, type LucideIcon } from "lucide-react";
import { loadSymbols, type SymbolEntry } from "@/components/ui/TickerInput";
import { NAV_ITEMS, OPEN_ALERTS_EVENT, OPEN_PALETTE_EVENT, OPEN_TOOLS_EVENT } from "@/lib/nav";
import { addToWatchlist, readWatchlist } from "@/lib/local-store";
import { resolveSectorName } from "@/lib/sectors";
import { toast } from "@/components/ui/Toast";

/** Asks the dashboard to switch tab in place (it owns that state). */
export const SET_TAB_EVENT = "psx:set-tab";

interface Action { id: string; label: string; hint: string; icon: LucideIcon; run: () => void }
type Item = { kind: "action"; action: Action } | { kind: "stock"; stock: SymbolEntry };

function matchStocks(symbols: SymbolEntry[], q: string): SymbolEntry[] {
  const starts = symbols.filter((s) => s.s.startsWith(q));
  const contains = symbols.filter((s) => !s.s.startsWith(q) && s.s.includes(q));
  const byName = symbols.filter((s) => !s.s.includes(q) && s.name?.toUpperCase().includes(q));
  return [...starts, ...contains, ...byName].slice(0, 8);
}

/**
 * Global quick search: jump to any stock's research page or any part of the
 * app from the keyboard. Opens with Ctrl/⌘ K, "/" outside a text field, or
 * the header search button.
 */
export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [symbols, setSymbols] = useState<SymbolEntry[]>([]);
  const [watching, setWatching] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(OPEN_PALETTE_EVENT, show); window.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(""); setHi(0);
    setWatching(new Set(readWatchlist().map((w) => w.ticker)));
    loadSymbols().then(setSymbols);
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  const close = () => setOpen(false);

  const actions: Action[] = useMemo(() => [
    ...NAV_ITEMS.map((n) => ({
      id: `nav:${n.id}`, label: `Go to ${n.label}`, hint: "Navigate", icon: n.icon,
      run: () => {
        if (n.tab && pathname === "/") window.dispatchEvent(new CustomEvent(SET_TAB_EVENT, { detail: n.tab }));
        else router.push(n.href);
      },
    })),
    { id: "alerts", label: "Price alerts", hint: "Tool", icon: Bell, run: () => window.dispatchEvent(new Event(OPEN_ALERTS_EVENT)) },
    { id: "tools", label: "Trade calculator", hint: "Tool", icon: Calculator, run: () => window.dispatchEvent(new Event(OPEN_TOOLS_EVENT)) },
  ], [pathname, router]);

  const q = query.trim().toUpperCase();
  const items: Item[] = useMemo(() => {
    if (!q) return actions.map((action) => ({ kind: "action" as const, action }));
    return [
      ...matchStocks(symbols, q).map((stock) => ({ kind: "stock" as const, stock })),
      ...actions.filter((a) => a.label.toUpperCase().includes(q)).map((action) => ({ kind: "action" as const, action })),
    ];
  }, [q, symbols, actions]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  if (!open) return null;

  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    if (item.kind === "action") item.action.run();
    else router.push(`/stock/${item.stock.s}`);
  };
  const watch = (s: SymbolEntry) => {
    if (addToWatchlist(s.s, `${s.s} · ${resolveSectorName(s.sec)}`)) {
      setWatching((prev) => new Set(prev).add(s.s));
      toast(`${s.s} added to watchlist`);
    }
  };

  return (
    <div className="fixed inset-0 z-120 bg-black/70 backdrop-blur-[2px] flex items-start justify-center px-3 pt-[12vh] animate-fade-in" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label="Quick search"
        className="w-full max-w-lg bg-card border border-line-2 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 animate-slide-up"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 border-b border-line">
          <Search size={15} strokeWidth={2} className="text-ink-3 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHi(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(items[hi]); }
              else if (e.key === "Escape") close();
            }}
            placeholder="Search a stock by symbol or company, or jump to…"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-3 py-3.5"
            autoCapitalize="off" autoCorrect="off" spellCheck={false}
            aria-label="Search stocks and actions"
          />
          <kbd className="text-[9px] text-ink-3 border border-line-2 rounded px-1.5 py-0.5 shrink-0">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="text-xs text-ink-3 px-3 py-6 text-center">
              {symbols.length === 0 ? "Loading the symbol list…" : `Nothing matches “${query.trim()}”.`}
            </p>
          )}
          {items.map((item, i) => {
            const active = i === hi;
            const base = `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer ${active ? "bg-raised" : ""}`;
            if (item.kind === "action") {
              const A = item.action;
              return (
                <button key={A.id} data-i={i} onMouseEnter={() => setHi(i)} onClick={() => choose(item)} className={base}>
                  <A.icon size={14} strokeWidth={2} className="text-ink-3 shrink-0" aria-hidden />
                  <span className="text-xs text-ink flex-1">{A.label}</span>
                  <span className="text-[10px] text-ink-3">{A.hint}</span>
                </button>
              );
            }
            const s = item.stock;
            const on = watching.has(s.s);
            return (
              <div key={s.s} data-i={i} onMouseEnter={() => setHi(i)} className={base} onClick={() => choose(item)}>
                <span className="text-xs font-bold text-ink w-16 shrink-0">{s.s}</span>
                <span className="text-[11px] text-ink-2 truncate flex-1">{s.name ?? resolveSectorName(s.sec)}</span>
                {s.sh && <span className="text-[8px] font-bold tracking-wide text-up-2 border border-up/40 rounded px-1 py-px shrink-0">SHARIAH</span>}
                <span className="text-[11px] text-ink-2 num shrink-0">{s.p.toFixed(2)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); if (!on) watch(s); }}
                  title={on ? "On your watchlist" : "Add to watchlist"}
                  aria-label={on ? `${s.s} is on your watchlist` : `Add ${s.s} to watchlist`}
                  className={`shrink-0 p-1 rounded cursor-pointer ${on ? "text-up-2" : "text-ink-3 hover:text-sky-2"}`}>
                  {on ? <Check size={13} strokeWidth={2.5} /> : <Plus size={13} strokeWidth={2.5} />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-line text-[10px] text-ink-3">
          <span className="inline-flex items-center gap-1"><CornerDownLeft size={10} strokeWidth={2.5} aria-hidden />open</span>
          <span>↑↓ move</span>
          <span className="ml-auto">Stocks open their research page</span>
        </div>
      </div>
    </div>
  );
}
