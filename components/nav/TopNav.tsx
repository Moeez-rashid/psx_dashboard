"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Bell, Calculator } from "lucide-react";
import { ACTIVE_EVENT, getActiveResearch } from "@/lib/recent-research";
import { NAV_ITEMS, OPEN_ALERTS_EVENT, OPEN_PALETTE_EVENT, OPEN_TOOLS_EVENT, type NavItem } from "@/lib/nav";

/** Brand mark shared by both headers. */
export function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="rounded-md">
      <rect width="24" height="24" rx="6" fill="var(--color-up-dim)" />
      <polyline points="4,16 9,11 13,14 20,7" fill="none" stroke="var(--color-up-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="15,7 20,7 20,12" fill="none" stroke="var(--color-up-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const fire = (name: string) => () => window.dispatchEvent(new Event(name));

/** Search / alerts / tools — the global actions, available from every header. */
export function GlobalActions() {
  return (
    <>
      <button
        onClick={fire(OPEN_PALETTE_EVENT)}
        className="btn px-2.5 text-ink-3"
        title="Search stocks and actions (Ctrl/⌘ K)"
        aria-label="Search stocks and actions"
      >
        <Search size={14} strokeWidth={2} aria-hidden />
        <span className="hidden lg:inline">Search</span>
        <kbd className="hidden lg:inline text-[9px] border border-line-2 rounded px-1 py-px text-ink-3">⌘K</kbd>
      </button>
      <button onClick={fire(OPEN_ALERTS_EVENT)} className="btn p-2" title="Price alerts" aria-label="Price alerts">
        <Bell size={15} strokeWidth={2} aria-hidden />
      </button>
      <button onClick={fire(OPEN_TOOLS_EVENT)} className="btn p-2 hidden sm:inline-flex" title="Trade calculator" aria-label="Trade calculator">
        <Calculator size={15} strokeWidth={2} aria-hidden />
      </button>
    </>
  );
}

const TAB_CLASS = "relative flex items-center gap-1.5 px-3 sm:px-3.5 py-2.5 text-xs font-medium transition-colors shrink-0 cursor-pointer";

/**
 * The primary nav row. Scrolls horizontally inside itself on narrow screens,
 * so no number of items or badges can ever widen the page.
 * `onTab` makes dashboard-tab items switch in place instead of navigating.
 */
export function NavRow({ active, counts, onTab }: {
  active: NavItem["id"];
  counts?: Partial<Record<NavItem["id"], number>>;
  onTab?: (item: NavItem) => void;
}) {
  // Deep Dive returns to the stock in progress; from a stock page itself it
  // goes to the search screen, so there is always a way to pick another.
  const pathname = usePathname();
  const activeTicker = useSyncExternalStore(
    (cb) => { window.addEventListener(ACTIVE_EVENT, cb); return () => window.removeEventListener(ACTIVE_EVENT, cb); },
    getActiveResearch,
    () => ""
  );
  const hrefFor = (item: NavItem) =>
    item.id === "deep-dive" && activeTicker && !pathname.startsWith("/stock/") ? `/stock/${activeTicker}` : item.href;

  return (
    <nav className="max-w-5xl mx-auto px-2 sm:px-4 flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        const count = counts?.[item.id];
        const inner = (
          <>
            <item.icon size={13} strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">{item.label}</span>
            <span className="sm:hidden">{item.short}</span>
            {count !== undefined && count > 0 && (
              <span className={`ml-0.5 text-[9px] px-1.5 py-px rounded-full num ${isActive ? "bg-up-dim text-up-2" : "bg-raised text-ink-3"}`}>
                {count}
              </span>
            )}
            {isActive && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-up rounded-full" />}
          </>
        );
        const cls = `${TAB_CLASS} ${isActive ? "text-ink" : "text-ink-3 hover:text-ink-2"}`;
        return item.tab && onTab ? (
          <button key={item.id} onClick={() => onTab(item)} className={cls} aria-current={isActive ? "page" : undefined}>{inner}</button>
        ) : (
          <Link key={item.id} href={hrefFor(item)} className={cls} aria-current={isActive ? "page" : undefined}>{inner}</Link>
        );
      })}
    </nav>
  );
}

/** Header for every route other than the dashboard, which composes the same pieces itself. */
export default function TopNav({ active }: { active: NavItem["id"] }) {
  return (
    <header className="sticky top-0 z-50 bg-surface/85 backdrop-blur-md border-b border-line">
      <div className="max-w-5xl mx-auto px-4 h-13 flex items-center justify-between py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="text-sm font-bold tracking-tight">PSX Scanner</span>
        </Link>
        <div className="flex items-center gap-1.5"><GlobalActions /></div>
      </div>
      <NavRow active={active} />
    </header>
  );
}
