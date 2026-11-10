import {
  TrendingUp, Briefcase, Eye, Newspaper, Telescope, Activity, SlidersHorizontal, type LucideIcon,
} from "lucide-react";

/**
 * The one definition of the app's primary navigation. Dashboard ("/") owns
 * four of these as in-page tabs; the rest are routes. Both headers render
 * from this list so they cannot drift apart.
 */
export type DashboardTab = "opportunities" | "holdings" | "watching" | "news";

export interface NavItem {
  id: DashboardTab | "market" | "screener" | "deep-dive";
  label: string;
  short: string;
  icon: LucideIcon;
  href: string;
  /** Set for items that are tabs inside the dashboard rather than routes. */
  tab?: DashboardTab;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "opportunities", label: "Opportunities", short: "Signals", icon: TrendingUp, href: "/?tab=opportunities", tab: "opportunities" },
  { id: "market", label: "Market", short: "Market", icon: Activity, href: "/market" },
  { id: "screener", label: "Screener", short: "Screener", icon: SlidersHorizontal, href: "/screener" },
  { id: "watching", label: "Watchlist", short: "Watchlist", icon: Eye, href: "/?tab=watching", tab: "watching" },
  { id: "holdings", label: "Holdings", short: "Holdings", icon: Briefcase, href: "/?tab=holdings", tab: "holdings" },
  { id: "news", label: "News", short: "News", icon: Newspaper, href: "/?tab=news", tab: "news" },
  { id: "deep-dive", label: "Deep Dive", short: "Deep Dive", icon: Telescope, href: "/deep-dive" },
];

export const DASHBOARD_TABS: DashboardTab[] = ["opportunities", "holdings", "watching", "news"];

export function isDashboardTab(v: string | null | undefined): v is DashboardTab {
  return !!v && (DASHBOARD_TABS as string[]).includes(v);
}

/** Window event that opens the command palette from any header button. */
export const OPEN_PALETTE_EVENT = "psx:open-palette";
export const OPEN_ALERTS_EVENT = "psx:open-alerts";
export const OPEN_TOOLS_EVENT = "psx:open-tools";
