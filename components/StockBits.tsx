"use client";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";
import { fmtVol } from "@/lib/format";
import { Chip } from "./ui/primitives";

// ─── Technical score shape used across tabs (matches /api/technicals) ───────
export interface StockTech {
  symbol: string; technicalScore: number; technicalSignal: string;
  rsi: number; ema20: number; ema50: number; currentPrice: number;
  volumeRatio: number; todayVolume?: number; avgVolume20d?: number;
  crossoverSignal: string; priceVsEma20: string; priceVsEma50?: string; reasons: string[];
  extensionPct?: number; trendRegime?: string;
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
  if (t.technicalScore < 55) out.push("Moderate technical score — watch closely");
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
    ["Tech score", `${tech.technicalScore}/100`, tech.technicalScore >= 60 ? "text-up-2" : tech.technicalScore >= 40 ? "text-gold-2" : "text-down-2"],
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
/** Build the P/E · ROE · D/E · Div · PBV chip set from rationew fundamentals.
 *  `price` lets us derive a trailing P/E for banks (which don't report PER). */
export function fundamentalChips(f: AskAnalystFundamentals, price?: number): [string, string, string][] {
  const pe = f.pe ?? (f.eps && f.eps > 0 && price ? price / f.eps : null);
  const chips: [string, string, string][] = [];
  if (pe !== null && pe > 0)
    chips.push(["P/E", `${pe.toFixed(1)}x`, pe < 8 ? "text-up-2" : pe > 20 ? "text-gold-2" : "text-ink"]);
  if (f.roe !== null)
    chips.push(["ROE", `${f.roe.toFixed(0)}%`, f.roe >= 15 ? "text-up-2" : f.roe < 8 ? "text-down-2" : "text-ink"]);
  if (f.debtToEquity !== null)
    chips.push(["D/E", f.debtToEquity.toFixed(2), f.debtToEquity <= 0.5 ? "text-up-2" : f.debtToEquity > 1.5 ? "text-down-2" : "text-ink"]);
  if (f.dividendYield !== null && f.dividendYield > 0)
    chips.push(["Div", `${f.dividendYield.toFixed(1)}%`, f.dividendYield >= 5 ? "text-up-2" : "text-ink-2"]);
  if (f.pbv !== null)
    chips.push(["PBV", `${f.pbv.toFixed(1)}x`, "text-ink-2"]);
  return chips;
}

export function FundamentalsRow({ f, price, bare }: { f: AskAnalystFundamentals | undefined; price?: number; bare?: boolean }) {
  if (!f) return null;
  const chips = fundamentalChips(f, price);
  if (chips.length === 0) return null;
  return (
    <div className={bare ? "" : "mt-3 pt-2.5 border-t border-line"}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[9px] uppercase tracking-wide text-ink-3">Fundamentals</span>
        {f.fiscalYear && <span className="text-[9px] text-violet-2 num bg-violet-dim border border-violet/30 rounded px-1 leading-tight">FY{f.fiscalYear}</span>}
      </div>
      {/* Distinct (violet) chip styling so fundamentals read apart from the neutral technicals chips */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {chips.map(([lbl, val, tone]) => (
          <div key={lbl} className="inline-flex items-center gap-1.5 bg-violet-dim border border-violet/25 rounded-md px-2 py-1">
            <span className="text-[9px] uppercase tracking-wide text-violet-2/80">{lbl}</span>
            <span className={`text-[11px] font-medium num ${tone}`}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fundamentals with loading / no-data sentinel handling.
 *  `data === undefined` → never fetched (loading), `null` → fetched but unavailable. */
export function FundamentalsState({ data, price, bare }: { data: AskAnalystFundamentals | null | undefined; price?: number; bare?: boolean }) {
  const wrap = bare ? "" : "mt-3 pt-2.5 border-t border-line";
  if (data === undefined)
    return <div className={`${wrap} text-[10px] text-ink-3`}>Loading fundamentals…</div>;
  if (data === null)
    return <div className={`${wrap} text-[10px] text-ink-3`}>Fundamentals unavailable for this ticker</div>;
  return <FundamentalsRow f={data} price={price} bare={bare} />;
}
