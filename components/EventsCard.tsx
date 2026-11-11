"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, FileText, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/primitives";
import type { Announcement, AnnouncementKind } from "@/lib/psx-company";

const KIND: Record<AnnouncementKind, { text: string; cls: string }> = {
  "dividend": { text: "Payout", cls: "text-up-2 border-up/40" },
  "book-closure": { text: "Book closure", cls: "text-gold-2 border-gold/40" },
  "results": { text: "Results", cls: "text-sky-2 border-sky/40" },
  "board-meeting": { text: "Board", cls: "text-violet-2 border-violet/40" },
  "agm": { text: "AGM", cls: "text-violet-2 border-violet/40" },
  "other": { text: "Notice", cls: "text-ink-3 border-line-2" },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-28" → "28 Oct" */
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""}`;

/** What an investor acts on. Routine notices stay behind "Show all". */
const KEY_KINDS: AnnouncementKind[] = ["dividend", "book-closure", "results", "board-meeting", "agm"];

/**
 * Recent PSX filings for a set of tickers (your holdings or watchlist):
 * dividends, book closures, results and board meetings, each linking to the
 * filed PDF. Loads lazily and only when there is something to track.
 */
export default function EventsCard({ tickers, title }: { tickers: string[]; title: string }) {
  // Results are stored WITH the ticker set they answer, so a changed set
  // reads as "loading" by derivation instead of by resetting state.
  const [result, setResult] = useState<{ key: string; events: Announcement[] | null; failed: boolean } | null>(null);
  const [all, setAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const key = [...tickers].sort().join(",");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetch(`/api/events?symbols=${key}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events: Announcement[] }) => { if (alive) setResult({ key, events: d.events, failed: false }); })
      .catch(() => { if (alive) setResult({ key, events: null, failed: true }); });
    return () => { alive = false; };
  }, [key]);

  const current = result?.key === key ? result : null;
  const events = current?.events ?? null;
  const failed = current?.failed ?? false;

  if (!key) return null;

  const list = (events ?? []).filter((e) => all || KEY_KINDS.includes(e.kind));
  const shown = list.slice(0, expanded ? 40 : 6);

  return (
    <section className="card p-0 overflow-hidden mb-4">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-line">
        <h2 className="flex items-center gap-1.5 label"><CalendarClock size={12} strokeWidth={2} aria-hidden />{title}</h2>
        <button onClick={() => setAll((v) => !v)} aria-pressed={all}
          className="text-[10px] text-ink-3 hover:text-ink-2 cursor-pointer" title="Include routine notices such as director disclosures">
          {all ? "Key events only" : "Show all notices"}
        </button>
      </div>

      {!events && !failed && <div className="p-3.5 space-y-2"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-4/5" /><Skeleton className="h-3.5 w-3/5" /></div>}
      {failed && <p className="text-[11px] text-ink-3 px-3.5 py-3">Announcements couldn&apos;t be loaded from PSX right now.</p>}
      {events && list.length === 0 && <p className="text-[11px] text-ink-3 px-3.5 py-3">No recent {all ? "announcements" : "dividend, results or board announcements"} for these stocks.</p>}

      {shown.length > 0 && (
        <ul className="divide-y divide-line">
          {shown.map((a, i) => (
            <li key={`${a.symbol}-${a.date}-${i}`} className="flex items-start gap-2.5 px-3.5 py-2">
              <span className="text-[10px] text-ink-3 num w-[46px] shrink-0 pt-0.5" title={a.date}>{shortDate(a.date)}</span>
              <Link href={`/stock/${a.symbol}`} className="text-[11px] font-bold text-ink w-14 shrink-0 hover:text-sky-2">{a.symbol}</Link>
              <span className={`text-[9px] font-semibold border rounded px-1.5 py-px shrink-0 mt-px ${KIND[a.kind].cls}`}>{KIND[a.kind].text}</span>
              {a.pdfUrl ? (
                <a href={a.pdfUrl} target="_blank" rel="noreferrer" title="Open the filed document (PDF)"
                  className="text-[11px] text-ink-2 hover:text-ink leading-snug flex-1 min-w-0 inline-flex items-start gap-1.5">
                  <span className="min-w-0">{a.title}</span>
                  <FileText size={11} strokeWidth={2} className="text-ink-3 shrink-0 mt-0.5" aria-hidden />
                </a>
              ) : <span className="text-[11px] text-ink-2 leading-snug flex-1 min-w-0">{a.title}</span>}
            </li>
          ))}
        </ul>
      )}

      {list.length > 6 && (
        <button onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1 text-[10px] text-ink-3 hover:text-ink-2 py-2 border-t border-line cursor-pointer">
          {expanded ? "Show fewer" : `Show ${Math.min(list.length, 40) - 6} more`}
          <ChevronDown size={11} strokeWidth={2.5} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </section>
  );
}
