"use client";
import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import { OPEN_TOOLS_EVENT } from "@/lib/nav";
import { exitPlan, EXIT_PLAN_NOTE } from "@/lib/exit-plan";

/** Open the trade calculator with this stock's price, stop and target filled in. */
export function openPlanTrade(entry: number, stop?: number, target?: number) {
  window.dispatchEvent(new CustomEvent(OPEN_TOOLS_EVENT, { detail: { entry, stop, target } }));
}

/**
 * One line in an opened row: the ATR stop and 2R target from `lib/exit-plan`,
 * plus a small "Plan" chip that opens the trade calculator pre-filled.
 * Tapping "Exit plan" shows what the levels mean. Renders nothing without
 * an ATR (older scans, or no high/low in the history).
 */
export default function ExitPlanLine({ price, atr }: { price?: number | null; atr?: number | null }) {
  const plan = exitPlan(price, atr);
  const [info, setInfo] = useState(false);

  useEffect(() => {
    if (!info) return;
    const close = () => setInfo(false);
    const t = setTimeout(() => document.addEventListener("click", close), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", close); };
  }, [info]);

  if (!plan) return null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="relative flex items-center gap-2 text-[11px] num" onClick={stop}>
      <span
        role="button" tabIndex={0} aria-expanded={info}
        onClick={() => setInfo((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInfo((v) => !v); } }}
        className="text-[9px] uppercase tracking-wide text-ink-3 underline decoration-dotted underline-offset-2 cursor-pointer shrink-0"
      >
        Exit plan
      </span>
      <span className="min-w-0 truncate text-ink-2">
        Stop <span className="text-ink">{plan.stop.toFixed(2)}</span>{" "}
        <span className="text-down-2">{plan.stopPct.toFixed(1)}%</span>
        <span className="text-ink-3"> · </span>
        Target <span className="text-ink">{plan.target.toFixed(2)}</span>{" "}
        <span className="text-up-2">+{plan.targetPct.toFixed(1)}%</span>
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => openPlanTrade(plan.entry, plan.stop, plan.target)}
        className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-line-2 text-[11px] font-medium text-ink-2 cursor-pointer whitespace-nowrap shrink-0 hover:text-ink"
      >
        <Calculator size={11} strokeWidth={2} aria-hidden />Plan
      </button>
      {info && (
        <span role="tooltip"
          className="absolute left-0 top-full mt-1 z-30 w-max max-w-[260px] whitespace-normal rounded-md border border-line-2 bg-raised px-2 py-1 text-[11px] text-ink-2 shadow-lg shadow-black/50">
          {EXIT_PLAN_NOTE} Typical daily range here: {plan.atrPct.toFixed(1)}%.
        </span>
      )}
    </div>
  );
}
