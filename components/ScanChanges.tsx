"use client";
import { useEffect, useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""}`; };

/**
 * One line under "Today's picks": how today's slate differs from the previous
 * successful scan — which picks are new and which dropped off. Both lists come
 * from stored scans; nothing is inferred. Renders nothing when there is no
 * earlier scan to compare with.
 */
export default function ScanChanges({ scanDate, tickers, className = "" }: {
  scanDate: string | null | undefined;
  tickers: string[];
  className?: string;
}) {
  const [prev, setPrev] = useState<{ scanDate: string; tickers: string[] } | null>(null);

  useEffect(() => {
    if (!scanDate) return;
    let alive = true;
    fetch(`/api/scan/previous?before=${scanDate}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.scanDate && Array.isArray(d.tickers)) setPrev(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [scanDate]);

  if (!prev || tickers.length === 0) return null;
  const before = new Set(prev.tickers);
  const now = new Set(tickers);
  const added = tickers.filter((t) => !before.has(t));
  const dropped = prev.tickers.filter((t) => !now.has(t));

  return (
    <p className={`text-[11px] text-ink-3 leading-snug ${className}`}>
      <span>vs {short(prev.scanDate)}</span>
      {added.length === 0 && dropped.length === 0 ? (
        <span> · same {tickers.length} picks</span>
      ) : (
        <>
          {added.length > 0 && <> · New <span className="text-up-2 font-medium">{added.join(", ")}</span></>}
          {dropped.length > 0 && <> · Dropped <span className="text-ink-2">{dropped.join(", ")}</span></>}
        </>
      )}
    </p>
  );
}
