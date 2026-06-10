"use client";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";
import { fmtVol } from "@/lib/format";
import { Chip } from "./ui/primitives";

// ─── Technical score shape used across tabs (matches /api/technicals) ───────
export interface StockTech {
  symbol: string; compositeScore: number; technicalSignal: string;
  rsi: number; ema20: number; ema50: number; currentPrice: number;
  volumeRatio: number; todayVolume?: number; avgVolume20d?: number;
  crossoverSignal: string; priceVsEma20: string; priceVsEma50?: string; reasons: string[];
}

/** Display string for the Vol chip.
 *  Priority: live market-watch volume → EOD todayVolume → ratio-only fallback */
export function volLabel(tech: StockTech, liveVolume?: number): string {
  const vol = liveVolume ?? tech.todayVolume ?? null;
  return vol ? `${fmtVol(vol)} (${tech.volumeRatio.toFixed(1)}x avg)` : `${tech.volumeRatio.toFixed(1)}x avg`;
}

export function techCatalysts(t: StockTech): string[] {
  const out: string[] = [];
  if (t.rsi < 35)       out.push(`RSI ${t.rsi.toFixed(0)} — oversold, potential bounce`);
  else if (t.rsi <= 60) out.push(`RSI ${t.rsi.toFixed(0)} — neutral, room to run`);
  else                  out.push(`RSI ${t.rsi.toFixed(0)} — strong upward momentum`);
  if (t.ema20 > t.ema50)       out.push("EMA20 above EMA50 — uptrend confirmed");
  if (t.volumeRatio >= 1.5)    out.push(`Volume ${t.volumeRatio.toFixed(1)}x above average`);
  else if (t.volumeRatio >= 1) out.push(`Volume at ${t.volumeRatio.toFixed(1)}x average`);
  for (const r of t.reasons) {
    const already = out.some(o => o.slice(0, 12).toLowerCase() === r.slice(0, 12).toLowerCase());
    if (!already) { out.push(r); if (out.length >= 4) break; }
  }
  return out.slice(0, 3);
}

export function techRisks(t: StockTech): string[] {
  const out: string[] = [];
  if (t.rsi > 68) out.push(`RSI ${t.rsi.toFixed(0)} — approaching overbought`);
  if (t.volumeRatio < 0.8) out.push(`Volume ${t.volumeRatio.toFixed(1)}x avg — weak conviction`);
  if (t.ema20 < t.ema50)   out.push("EMA20 below EMA50 — bearish crossover");
  if (t.compositeScore < 55) out.push("Moderate technical score — watch closely");
  if (out.length === 0) out.push("General market volatility");
  out.push("Always verify with fundamentals");
  return out.slice(0, 3);
}

// ─── Technical chips row (RSI · EMA20 · EMA50 · Vol · Score) ────────────────
export function TechChips({ tech, liveVolume }: { tech: StockTech; liveVolume?: number }) {
  const items: [string, string, string][] = [
    ["RSI", tech.rsi.toFixed(0), tech.rsi < 30 ? "text-up-2" : tech.rsi > 70 ? "text-down-2" : "text-ink-2"],
    ["EMA20", tech.ema20.toFixed(2), "text-ink-2"],
    ["EMA50", tech.ema50.toFixed(2), "text-ink-2"],
    ["Vol", volLabel(tech, liveVolume), tech.volumeRatio >= 1.5 ? "text-up-2" : "text-ink-2"],
    ["Score", `${tech.compositeScore}/100`, tech.compositeScore >= 60 ? "text-up-2" : tech.compositeScore >= 40 ? "text-gold-2" : "text-down-2"],
  ];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {items.map(([lbl, val, tone]) => <Chip key={lbl} label={lbl} value={val} tone={tone} />)}
    </div>
  );
}

// ─── Catalysts / Risks two-column block ─────────────────────────────────────
export function CatalystsRisks({ catalysts, risks }: { catalysts: string[]; risks: string[] }) {
  if (catalysts.length === 0 && risks.length === 0) return null;
  return (
    <div className="hidden sm:grid grid-cols-2 gap-3 mt-3">
      {catalysts.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-up-2 mb-1">Catalysts</div>
          {catalysts.map((c, j) => (
            <div key={j} className="text-[11px] text-ink-2 leading-relaxed">▲ {c}</div>
          ))}
        </div>
      )}
      {risks.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-down-2 mb-1">Risks</div>
          {risks.map((r, j) => (
            <div key={j} className="text-[11px] text-ink-2 leading-relaxed">▼ {r}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Fundamentals chips (AskAnalyst data) ───────────────────────────────────
export function FundamentalsRow({ f }: { f: AskAnalystFundamentals | undefined }) {
  if (!f) return null;

  const pos52w =
    f.fiftyTwoWeekHigh !== null && f.fiftyTwoWeekLow !== null && f.fiftyTwoWeekHigh > f.fiftyTwoWeekLow
      ? Math.round(((f.currentPrice - f.fiftyTwoWeekLow) / (f.fiftyTwoWeekHigh - f.fiftyTwoWeekLow)) * 100)
      : null;

  const chips: [string, string, string][] = [];
  if (f.pe !== null)
    chips.push(["P/E", `${f.pe.toFixed(1)}x`, f.pe < 8 ? "text-up-2" : f.pe > 20 ? "text-gold-2" : "text-ink"]);
  if (f.pbv !== null) chips.push(["PBV", `${f.pbv.toFixed(1)}x`, "text-ink-2"]);
  if (f.dividendYield !== null && f.dividendYield > 0)
    chips.push(["Div", `${f.dividendYield.toFixed(1)}%`, "text-up-2"]);
  if (f.totalReturn1M !== null)
    chips.push(["1M", `${f.totalReturn1M >= 0 ? "+" : ""}${f.totalReturn1M.toFixed(1)}%`, f.totalReturn1M >= 0 ? "text-up-2" : "text-down-2"]);
  if (f.totalReturn1Y !== null)
    chips.push(["1Y", `${f.totalReturn1Y >= 0 ? "+" : ""}${f.totalReturn1Y.toFixed(1)}%`, f.totalReturn1Y >= 0 ? "text-up-2" : "text-down-2"]);
  if (f.marketCap !== null && f.marketCap > 0)
    chips.push(["MCap", f.marketCap >= 1_000 ? `${(f.marketCap / 1_000).toFixed(0)}B` : `${Math.round(f.marketCap)}M`, "text-ink-2"]);

  return (
    <div className="mt-3 pt-2.5 border-t border-line">
      <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-1.5">Fundamentals</div>
      <div className="flex gap-1.5 flex-wrap items-center">
        {chips.map(([lbl, val, tone]) => <Chip key={lbl} label={lbl} value={val} tone={tone} />)}
        {pos52w !== null && (
          <div className="chip">
            <span className="text-[9px] uppercase tracking-wide text-ink-3">52W</span>
            <div className="w-10 h-1 bg-line-2 rounded-full relative">
              <div
                className={`absolute left-0 top-0 h-1 rounded-full ${pos52w > 70 ? "bg-up" : pos52w < 30 ? "bg-down" : "bg-gold"}`}
                style={{ width: `${Math.min(100, pos52w)}%` }}
              />
            </div>
            <span className="text-[10px] text-ink-2 num">{pos52w}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Fundamentals with loading / no-data sentinel handling.
 *  `data === undefined` → never fetched (loading), `null` → fetched but unavailable. */
export function FundamentalsState({ data }: { data: AskAnalystFundamentals | null | undefined }) {
  if (data === undefined) return <div className="mt-2 text-[10px] text-ink-3">Loading fundamentals…</div>;
  if (data === null) return <div className="mt-2 text-[10px] text-ink-3">No fundamentals available</div>;
  return <FundamentalsRow f={data} />;
}
