"use client";
import { useState, useSyncExternalStore, type ReactNode } from "react";

export interface StockTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Splits the stock page into Overview / Technicals / Financials / News.
 * Every panel is rendered (server components stream in as before) and the
 * inactive ones are hidden, so switching is instant and nothing re-fetches.
 * The tab is kept in the URL hash, so a shared or reloaded link reopens it.
 */
export default function StockTabs({ tabs }: { tabs: StockTab[] }) {
  // The hash picks the opening tab (empty on the server, so hydration matches);
  // after that the reader's own choice wins.
  const hash = useSyncExternalStore(
    (cb) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); },
    () => window.location.hash.slice(1),
    () => ""
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const active = chosen ?? (tabs.some((t) => t.id === hash) ? hash : tabs[0]?.id ?? "");

  const choose = (id: string) => {
    setChosen(id);
    window.history.replaceState(null, "", id === tabs[0]?.id ? window.location.pathname : `#${id}`);
    // Keep the tab bar in view rather than leaving the reader mid-way down the old panel.
    // The bar is sticky, so measure an anchor just above it instead.
    const anchor = document.getElementById("stock-tabs-anchor");
    if (anchor && anchor.getBoundingClientRect().top < 0) anchor.scrollIntoView();
  };

  return (
    <>
      <div id="stock-tabs-anchor" aria-hidden className="scroll-mt-[calc(52px+env(safe-area-inset-top))] md:scroll-mt-[89px]" />
      <div
        id="stock-tabs"
        role="tablist"
        aria-label="Stock sections"
        className="sticky z-30 top-[calc(52px+env(safe-area-inset-top))] md:top-[89px] -mx-4 px-4 mt-4 sm:mt-6 bg-surface/92 backdrop-blur-md border-b border-line flex"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              onClick={() => choose(t.id)}
              className={`relative flex-1 sm:flex-none sm:px-5 min-h-10 text-[13px] font-medium transition-colors cursor-pointer
                ${on ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
            >
              {t.label}
              {on && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-up" />}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={t.id !== active} className="pt-4 sm:pt-6">
          {t.content}
        </div>
      ))}
    </>
  );
}
