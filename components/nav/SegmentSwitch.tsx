"use client";
import Link from "next/link";

export interface Segment {
  label: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
  count?: number;
}

/**
 * Two-way switch at the top of a phone tab that holds two views
 * (Portfolio: Holdings | Watchlist, Markets: Overview | Screener).
 * Phones only: on wider screens both views are in the header nav already.
 */
export default function SegmentSwitch({ segments, label }: { segments: Segment[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="md:hidden grid grid-cols-2 gap-1 p-1 mb-4 rounded-xl bg-inset border border-line">
      {segments.map((s) => {
        const cls = `flex items-center justify-center gap-1.5 min-h-10 rounded-lg text-[14px] font-medium transition-colors cursor-pointer
          ${s.active ? "bg-raised text-ink shadow-sm shadow-black/40" : "text-ink-3 active:text-ink-2"}`;
        const inner = (
          <>
            {s.label}
            {s.count !== undefined && s.count > 0 && <span className="text-[12px] text-ink-3 num">{s.count}</span>}
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} role="tab" aria-selected={s.active} className={cls}>{inner}</Link>
        ) : (
          <button key={s.label} type="button" role="tab" aria-selected={s.active} onClick={s.onClick} className={cls}>{inner}</button>
        );
      })}
    </div>
  );
}

/** Markets tab on phones: the market overview and the screener. */
export function MarketsSwitch({ active }: { active: "overview" | "screener" }) {
  return (
    <SegmentSwitch
      label="Markets"
      segments={[
        { label: "Overview", active: active === "overview", href: "/market" },
        { label: "Screener", active: active === "screener", href: "/screener" },
      ]}
    />
  );
}
