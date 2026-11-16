"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Bell, BookOpen, Briefcase, Calculator, ChevronRight, Clipboard, Ellipsis, Newspaper,
  Settings as SettingsIcon, SlidersHorizontal, Smartphone, Telescope, TrendingUp, type LucideIcon,
} from "lucide-react";
import { SET_TAB_EVENT } from "@/components/CommandPalette";
import { Modal, ModalHeader } from "@/components/ui/primitives";
import { useDashboardTab } from "@/lib/nav-state";
import {
  COPY_SNAPSHOT_EVENT, OPEN_ALERTS_EVENT, OPEN_METRICS_EVENT, OPEN_SETTINGS_EVENT, OPEN_TOOLS_EVENT,
  type DashboardTab,
} from "@/lib/nav";

interface Item {
  id: "signals" | "markets" | "portfolio" | "news";
  label: string;
  icon: LucideIcon;
  href: string;
  tab?: DashboardTab;
}

const ITEMS: Item[] = [
  { id: "signals", label: "Signals", icon: TrendingUp, href: "/", tab: "opportunities" },
  { id: "markets", label: "Markets", icon: Activity, href: "/market" },
  { id: "portfolio", label: "Portfolio", icon: Briefcase, href: "/?tab=holdings", tab: "holdings" },
  { id: "news", label: "News", icon: Newspaper, href: "/?tab=news", tab: "news" },
];

/**
 * The phone navigation: four destinations and "More", fixed at the bottom
 * where a thumb reaches. Phones only — wider screens keep the header row.
 * Rendered once for every route (GlobalClient), with a spacer so page content
 * never ends up underneath it.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const dashTab = useDashboardTab();
  const [moreOpen, setMoreOpen] = useState(false);
  const onDashboard = pathname === "/";

  const activeId: Item["id"] | "more" | null =
    onDashboard
      ? dashTab === "holdings" || dashTab === "watching" ? "portfolio" : dashTab === "news" ? "news" : "signals"
      : pathname.startsWith("/market") || pathname.startsWith("/screener") ? "markets"
      : pathname.startsWith("/deep-dive") || pathname.startsWith("/widget") ? "more"
      : null;

  const cls = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 min-h-[52px] text-[10px] font-medium transition-colors cursor-pointer
     ${active ? "text-ink" : "text-ink-3 active:text-ink-2"}`;

  return (
    <>
      <div aria-hidden className="md:hidden shrink-0 h-[calc(52px+env(safe-area-inset-bottom))]" />
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/92 backdrop-blur-md border-t border-line pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-[52px]">
          {ITEMS.map((item) => {
            const active = activeId === item.id;
            const inner = (
              <>
                <item.icon size={19} strokeWidth={active ? 2.25 : 1.75} className={active ? "text-up-2" : ""} aria-hidden />
                {item.label}
              </>
            );
            // On the dashboard the tabs switch in place: no reload, scan and prices stay put.
            return onDashboard && item.tab ? (
              <button
                key={item.id}
                type="button"
                className={cls(active)}
                aria-current={active ? "page" : undefined}
                onClick={() => { window.dispatchEvent(new CustomEvent(SET_TAB_EVENT, { detail: item.tab })); window.scrollTo({ top: 0 }); }}
              >
                {inner}
              </button>
            ) : (
              <Link key={item.id} href={item.href} className={cls(active)} aria-current={active ? "page" : undefined}>
                {inner}
              </Link>
            );
          })}
          <button type="button" className={cls(activeId === "more")} onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
            <Ellipsis size={19} strokeWidth={activeId === "more" ? 2.25 : 1.75} className={activeId === "more" ? "text-up-2" : ""} aria-hidden />
            More
          </button>
        </div>
      </nav>
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} onDashboard={onDashboard} />}
    </>
  );
}

function MoreSheet({ onClose, onDashboard }: { onClose: () => void; onDashboard: boolean }) {
  // Run after the sheet closes, so a dialog opened from here isn't stacked on it.
  const fire = (name: string) => () => { onClose(); setTimeout(() => window.dispatchEvent(new Event(name)), 0); };

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="More" onClose={onClose} />
      <div className="-mx-2">
        <Group>
          <Row icon={SlidersHorizontal} label="Screener" sub="Filter all 750+ PSX stocks" href="/screener" onClose={onClose} />
          <Row icon={Telescope} label="Research a stock" sub="Deep Dive: technicals, financials, news" href="/deep-dive" onClose={onClose} />
        </Group>
        <Group>
          <Row icon={Bell} label="Price alerts" onClick={fire(OPEN_ALERTS_EVENT)} />
          <Row icon={Calculator} label="Trade calculator" sub="Position size, stop and target" onClick={fire(OPEN_TOOLS_EVENT)} />
          <Row icon={Smartphone} label="iPhone widget" sub="Your holdings on the home screen" href="/widget" onClose={onClose} />
        </Group>
        <Group>
          {onDashboard ? (
            <Row icon={SettingsIcon} label="Settings" sub="AI key, backup and restore" onClick={fire(OPEN_SETTINGS_EVENT)} />
          ) : (
            <Row icon={SettingsIcon} label="Settings" sub="AI key, backup and restore" href="/?settings=1" onClose={onClose} />
          )}
          {onDashboard && <Row icon={Clipboard} label="Copy snapshot for AI" sub="Paste into Claude or ChatGPT" onClick={fire(COPY_SNAPSHOT_EVENT)} />}
          {onDashboard && <Row icon={BookOpen} label="Metrics guide" sub="What each number means" onClick={fire(OPEN_METRICS_EVENT)} />}
        </Group>
      </div>
    </Modal>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="py-1 border-b border-line last:border-0">{children}</div>;
}

function Row({ icon: Icon, label, sub, href, onClick, onClose }: {
  icon: LucideIcon; label: string; sub?: string; href?: string; onClick?: () => void; onClose?: () => void;
}) {
  const body = (
    <>
      <span className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center shrink-0">
        <Icon size={17} strokeWidth={2} className="text-ink-2" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-ink">{label}</span>
        {sub && <span className="block text-[12px] text-ink-3 mt-0.5">{sub}</span>}
      </span>
      <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden />
    </>
  );
  const cls = "flex items-center gap-3 w-full min-h-[56px] px-2 rounded-xl text-left active:bg-raised hover:bg-raised/60 cursor-pointer";
  return href
    ? <Link href={href} className={cls} onClick={onClose}>{body}</Link>
    : <button type="button" className={cls} onClick={onClick}>{body}</button>;
}
