import Link from "next/link";
import { TrendingUp, Briefcase, Eye, Newspaper as NewspaperIcon, Telescope } from "lucide-react";

/**
 * Shared header for every route OTHER than the main dashboard ("/"), which
 * has its own copy of this row (components/Dashboard.tsx) because its four
 * tabs are client-side view state, not routes — clicking them here just
 * navigates back to "/", where Dashboard's own nav takes over.
 *
 * Kept visually identical to Dashboard's nav row (same classes, sizes,
 * active-underline treatment) so Deep Dive doesn't feel like a different
 * product bolted on. No settings/refresh/snapshot buttons here — those are
 * Dashboard-specific actions with no meaning on a Deep Dive page.
 */

const NAV_ITEMS = [
  { id: "opportunities", label: "Buy Opportunities", short: "Signals", icon: TrendingUp, href: "/" },
  { id: "holdings", label: "My Holdings", short: "Holdings", icon: Briefcase, href: "/" },
  { id: "watching", label: "Watchlist", short: "Watchlist", icon: Eye, href: "/" },
  { id: "news", label: "News", short: "News", icon: NewspaperIcon, href: "/" },
  { id: "deep-dive", label: "Deep Dive", short: "Deep Dive", icon: Telescope, href: "/deep-dive" },
] as const;

export default function TopNav({ active }: { active: "deep-dive" }) {
  return (
    <header className="sticky top-0 z-50 bg-surface/85 backdrop-blur-md border-b border-line">
      <div className="max-w-5xl mx-auto px-4 h-13 flex items-center py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="rounded-md">
            <rect width="24" height="24" rx="6" fill="var(--color-up-dim)" />
            <polyline points="4,16 9,11 13,14 20,7" fill="none" stroke="var(--color-up-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="15,7 20,7 20,12" fill="none" stroke="var(--color-up-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-bold tracking-tight">PSX Scanner</span>
        </Link>
      </div>

      <nav className="max-w-5xl mx-auto px-4 flex overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium transition-colors shrink-0
                ${isActive ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
            >
              <item.icon size={13} strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">{item.label}</span>
              <span className="sm:hidden">{item.short}</span>
              {isActive && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-up rounded-full" />}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
