"use client";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";
import { Modal, Pill, PriceTag, Sparkline, signalStyle } from "./ui/primitives";
import { type StockTech } from "./StockBits";

function buildSignalNarrative(data: { tech?: StockTech; fundamentals?: AskAnalystFundamentals }): { technical: string; valuation: string } {
  const { tech, fundamentals } = data;
  let technical = "";
  if (tech) {
    if (tech.rsi < 35)      technical += `RSI at ${tech.rsi.toFixed(0)} is deeply oversold — a potential reversal zone. `;
    else if (tech.rsi < 50) technical += `RSI at ${tech.rsi.toFixed(0)} sits below midpoint — mild oversold conditions with upside room. `;
    else if (tech.rsi < 65) technical += `RSI at ${tech.rsi.toFixed(0)} shows healthy momentum without being overbought. `;
    else                    technical += `RSI at ${tech.rsi.toFixed(0)} is approaching overbought — timing of entry is critical. `;

    const above20 = tech.priceVsEma20 === "above";
    const above50 = (tech.priceVsEma50 ?? tech.priceVsEma20) === "above";
    if (above20 && above50)
      technical += `Price holds above both EMA20 (${tech.ema20.toFixed(0)}) and EMA50 (${tech.ema50.toFixed(0)}), confirming a clean uptrend. `;
    else if (above20)
      technical += `Price has reclaimed EMA20 (${tech.ema20.toFixed(0)}) but EMA50 (${tech.ema50.toFixed(0)}) is still overhead — watch for full confirmation. `;
    else
      technical += `Price is below EMA20 (${tech.ema20.toFixed(0)}) and EMA50 (${tech.ema50.toFixed(0)}) — trend is bearish, monitor for a reclaim before entry. `;

    if (tech.volumeRatio >= 2.0)      technical += `Volume surging at ${tech.volumeRatio.toFixed(1)}× the 20-day average — strong conviction behind the move.`;
    else if (tech.volumeRatio >= 1.3) technical += `Volume at ${tech.volumeRatio.toFixed(1)}× average confirms above-normal participation.`;
    else if (tech.volumeRatio >= 0.8) technical += `Volume is at ${tech.volumeRatio.toFixed(1)}× average — normal activity levels.`;
    else                              technical += `Volume thin at ${tech.volumeRatio.toFixed(1)}× average — limited conviction; wait for a pickup.`;
  }

  let valuation = "";
  if (fundamentals) {
    const f = fundamentals;
    if (f.pe !== null) {
      if (f.pe < 0)       valuation += `The company is currently loss-making (negative PE). `;
      else if (f.pe < 8)  valuation += `At PE ${f.pe.toFixed(1)}×, the stock is trading at a meaningful discount to the PSX average — a potentially undervalued setup. `;
      else if (f.pe < 15) valuation += `PE of ${f.pe.toFixed(1)}× sits within fair-value range for PSX. `;
      else                valuation += `PE of ${f.pe.toFixed(1)}× is above the PSX norm — growth expectations are already priced in. `;
    }
    if (f.dividendYield !== null && f.dividendYield >= 3)
      valuation += `The ${f.dividendYield.toFixed(1)}% dividend yield adds an income buffer to the position. `;
    if (f.totalReturn1Y !== null) {
      if (f.totalReturn1Y > 20)     valuation += `The stock has returned +${f.totalReturn1Y.toFixed(0)}% over the past year, reflecting sustained market interest.`;
      else if (f.totalReturn1Y > 0) valuation += `With a +${f.totalReturn1Y.toFixed(0)}% 1-year return, the medium-term trend remains constructive.`;
      else                          valuation += `The stock is down ${Math.abs(f.totalReturn1Y).toFixed(0)}% over 12 months — contrarian setup if technicals confirm a reversal.`;
    }
  }
  return { technical, valuation };
}

export interface SignalDetail {
  ticker: string;
  signal?: string;
  confidence?: number;
  reason?: string;
  newsHeadline?: string;
  catalysts?: string[];
  risks?: string[];
  suggestedEntry?: string;
  tech?: StockTech;
  fundamentals?: AskAnalystFundamentals;
  currentPrice?: number;
  changePercent?: number;
  spark?: number[];
}

export default function SignalDetailModal({ data, onClose }: { data: SignalDetail; onClose: () => void }) {
  const { ticker, signal, confidence, reason, newsHeadline, catalysts, risks, suggestedEntry, tech, fundamentals, currentPrice, changePercent, spark } = data;
  const s = signalStyle(signal);
  const narrative = buildSignalNarrative({ tech, fundamentals });

  return (
    <Modal onClose={onClose} maxWidth="max-w-md">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-lg font-bold tracking-tight">{ticker}</span>
          {signal && <Pill signal={signal} />}
          <PriceTag price={currentPrice} changePercent={changePercent} />
        </div>
        <div className="flex items-center gap-3">
          <Sparkline data={spark} width={72} height={26} />
          <button onClick={onClose} className="text-ink-2 hover:text-ink text-xl leading-none cursor-pointer" aria-label="Close">×</button>
        </div>
      </div>

      {/* AI reason */}
      {reason && (
        <p className={`text-[13px] text-ink leading-relaxed mb-3 border-l-2 pl-3 italic ${s.text} border-current`}>
          {reason}
        </p>
      )}

      {/* Confidence */}
      {confidence !== undefined && (
        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-ink-3">AI Confidence</span>
            <span className="text-[10px] text-ink-2 num">{confidence}%</span>
          </div>
          <div className="h-1 bg-line-2 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${confidence}%` }} />
          </div>
        </div>
      )}

      {narrative.technical && (
        <div className="mb-3">
          <div className="label mb-1.5">Technical Setup</div>
          <p className="text-xs text-ink-2 leading-relaxed">{narrative.technical}</p>
        </div>
      )}

      {narrative.valuation && (
        <div className="mb-3">
          <div className="label mb-1.5">Valuation</div>
          <p className="text-xs text-ink-2 leading-relaxed">{narrative.valuation}</p>
        </div>
      )}

      {newsHeadline && newsHeadline !== "No recent news" && (
        <div className="mb-3">
          <div className="label mb-1.5">News Catalyst</div>
          <div className="text-xs text-sky-2 italic">📰 {newsHeadline}</div>
        </div>
      )}

      {((catalysts?.length ?? 0) > 0 || (risks?.length ?? 0) > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-3 pt-3 border-t border-line">
          {(catalysts?.length ?? 0) > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-up-2 mb-1.5">Why it works</div>
              {catalysts!.map((c, i) => <div key={i} className="text-[11px] text-ink-2 mb-1 leading-snug">✓ {c}</div>)}
            </div>
          )}
          {(risks?.length ?? 0) > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-down-2 mb-1.5">Watch out for</div>
              {risks!.map((r, i) => <div key={i} className="text-[11px] text-ink-2 mb-1 leading-snug">⚠ {r}</div>)}
            </div>
          )}
        </div>
      )}

      {suggestedEntry && (
        <div className="bg-gold-dim border border-gold/40 rounded-lg px-3.5 py-2 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">Suggested entry</span>
          <span className="text-[13px] font-semibold text-gold-2">{suggestedEntry}</span>
        </div>
      )}

      <div className="mt-3 text-[10px] text-ink-3">
        Fundamentals from askanalyst.com.pk · Technicals from PSX price history · Not financial advice
      </div>
    </Modal>
  );
}
