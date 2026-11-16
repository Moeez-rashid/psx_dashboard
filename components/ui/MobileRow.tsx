import type { ReactNode } from "react";
import { Sparkline } from "./primitives";

/**
 * The phone list row, shared by Signals, Holdings and Watchlist so they read
 * as one app: a ticker mark, the ticker over one quiet detail line, and two
 * right-aligned figures. Flat (the list draws hairlines between rows), about
 * 52px tall. Phones only; wider screens keep the card grids.
 */
export function MobileRow({ ticker, sub, top, bottom, tone, spark }: {
  ticker: string;
  /** One line under the ticker: score and sector, or "200 × 480.00". */
  sub?: ReactNode;
  /** Right column, first line (price or value). */
  top: ReactNode;
  /** Right column, second line (change or P&L), already coloured. */
  bottom?: ReactNode;
  /** Text colour class for the ticker mark, e.g. the signal hue. */
  tone?: string;
  /** ~30 daily closes; drawn as a small trend line, green or red by direction. */
  spark?: number[];
}) {
  return (
    <div className="sm:hidden flex items-center gap-2.5 px-4 py-2 min-h-[52px]">
      <span
        aria-hidden
        className={`w-8 h-8 shrink-0 rounded-full bg-raised border border-line-2 flex items-center justify-center text-[10px] font-bold tracking-tight ${tone ?? "text-ink-2"}`}
      >
        {ticker.slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold tracking-tight leading-tight">{ticker}</div>
        {sub && <div className="text-[11px] text-ink-3 leading-tight mt-0.5 truncate">{sub}</div>}
      </div>
      {spark && spark.length >= 5 && <Sparkline data={spark} width={52} height={22} opacity={0.9} />}
      <div className="text-right shrink-0 leading-tight min-w-[64px]">
        <div className="text-[14px] font-semibold num">{top}</div>
        {bottom && <div className="text-[11px] num mt-0.5">{bottom}</div>}
      </div>
    </div>
  );
}

/** "▲ 1.24%" / "▼ 0.83%" in the right colour; "—" when unknown. */
export function Move({ pct, abs, digits = 2 }: { pct?: number | null; abs?: number | null; digits?: number }) {
  if (pct === undefined || pct === null || !Number.isFinite(pct)) return <span className="text-ink-3">—</span>;
  const up = pct >= 0;
  return (
    <span className={up ? "text-up-2" : "text-down-2"}>
      <span className="text-[9px] mr-0.5 align-[1px]">{up ? "▲" : "▼"}</span>
      {abs !== undefined && abs !== null && <>{fmtInt(Math.abs(abs))} </>}
      {abs !== undefined && abs !== null ? `(${Math.abs(pct).toFixed(digits)}%)` : `${Math.abs(pct).toFixed(digits)}%`}
    </span>
  );
}

/** 308812.4 → "308,812". */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Hairline-separated, edge-to-edge list on phones; the usual spaced cards from sm up. */
export const LIST_CLASS = "-mx-4 sm:mx-0 border-y border-line divide-y divide-line sm:border-0 sm:divide-y-0 sm:space-y-2";
