"use client";
import { useState, useEffect, useCallback, useRef } from "react";

/** Tracks window width and re-renders on resize */
function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}
import Settings, { loadSettings, type UserSettings } from "./Settings";
import type { AISignal, NewsAnalysis } from "@/lib/providers/types";
import type { StockQuote } from "@/lib/psx";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";

// ─── Colour palette ────────────────────────────────────────────────────────
const C = {
  bg: "#0f0f0f", card: "#181818", border: "#222", border2: "#2a2a2a",
  text: "#e8e8e8", muted: "#888", dim: "#555",
  green: "#4a9966", greenDim: "#1a3020", greenText: "#5dbf7f",
  red: "#c05050", redDim: "#2a1515", redText: "#e06060",
  amber: "#c8a060", amberDim: "#2a2010", amberText: "#e0b870",
  blue: "#4a80c0", blueDim: "#12202a", blueText: "#6aa0e0",
  purple: "#8a6fd0", purpleDim: "#1a1228", purpleText: "#b09ff0",
};

// ─── Signal pill ───────────────────────────────────────────────────────────
const PILL_MAP: Record<string, { bg: string; color: string; border: string }> = {
  STRONG_BUY: { bg: C.greenDim, color: C.greenText, border: C.green },
  BUY:        { bg: C.greenDim, color: C.greenText, border: C.green },
  WATCH:      { bg: C.blueDim,  color: C.blueText,  border: C.blue  },
  HOLD:       { bg: C.amberDim, color: C.amberText, border: C.amber },
  SELL:       { bg: C.redDim,   color: C.redText,   border: C.red   },
  AVOID:      { bg: C.redDim,   color: C.redText,   border: C.red   },
};
function Pill({ signal, small, onClick }: { signal?: string; small?: boolean; onClick?: () => void }) {
  const s = PILL_MAP[signal?.toUpperCase() ?? ""] ?? PILL_MAP.WATCH;
  return (
    <span onClick={onClick} style={{
      background: s.bg, color: s.color, border: `0.5px solid ${s.border}`,
      borderRadius: 20, padding: small ? "1px 7px" : "2px 9px",
      fontSize: small ? 9 : 10, fontWeight: 600, letterSpacing: 0.3, whiteSpace: "nowrap",
      ...(onClick ? { cursor: "pointer" } : {}),
    }}>{signal?.toUpperCase() ?? "—"}</span>
  );
}

function ConfBar({ pct, signal, label }: { pct: number; signal?: string; label?: string }) {
  const col = signal === "BUY" || signal === "STRONG_BUY" ? C.green
            : signal === "SELL" || signal === "AVOID" ? C.red
            : signal === "HOLD" ? C.amber : C.blue;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <span style={{ fontSize: 9, color: C.dim, whiteSpace: "nowrap" }}>{label ?? "AI confidence"}</span>
      <div style={{ flex: 1, height: 2, background: C.border2, borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: 2, background: col, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 9, color: C.muted, minWidth: 28, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

// ─── Fundamentals row (AskAnalyst data) ────────────────────────────────────
function FundamentalsRow({ f }: { f: AskAnalystFundamentals | undefined }) {
  if (!f) return null;

  const pos52w =
    f.fiftyTwoWeekHigh !== null &&
    f.fiftyTwoWeekLow !== null &&
    f.fiftyTwoWeekHigh > f.fiftyTwoWeekLow
      ? Math.round(
          ((f.currentPrice - f.fiftyTwoWeekLow) /
            (f.fiftyTwoWeekHigh - f.fiftyTwoWeekLow)) *
            100
        )
      : null;

  const chips: [string, string, string][] = [];
  if (f.pe !== null)
    chips.push(["P/E", `${f.pe.toFixed(1)}x`, f.pe < 8 ? C.greenText : f.pe > 20 ? C.amberText : C.text]);
  if (f.pbv !== null)
    chips.push(["PBV", `${f.pbv.toFixed(1)}x`, C.muted]);
  if (f.dividendYield !== null && f.dividendYield > 0)
    chips.push(["Div", `${f.dividendYield.toFixed(1)}%`, C.greenText]);
  if (f.totalReturn1M !== null)
    chips.push(["1M", `${f.totalReturn1M >= 0 ? "+" : ""}${f.totalReturn1M.toFixed(1)}%`,
      f.totalReturn1M >= 0 ? C.greenText : C.redText]);
  if (f.totalReturn1Y !== null)
    chips.push(["1Y", `${f.totalReturn1Y >= 0 ? "+" : ""}${f.totalReturn1Y.toFixed(1)}%`,
      f.totalReturn1Y >= 0 ? C.greenText : C.redText]);

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `0.5px solid ${C.border}` }}>
      <div style={{ fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>Fundamentals</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {chips.map(([lbl, val, col]) => (
          <div key={lbl} style={{ background: "#111", borderRadius: 4, padding: "3px 7px", display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 8, color: C.dim }}>{lbl}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: col }}>{val}</span>
          </div>
        ))}
        {pos52w !== null && (
          <div style={{ background: "#111", borderRadius: 4, padding: "3px 7px", display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ fontSize: 8, color: C.dim }}>52W</span>
            <div style={{ width: 38, height: 3, background: C.border2, borderRadius: 2, position: "relative" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, borderRadius: 2,
                width: `${Math.min(100, pos52w)}%`, height: 3,
                background: pos52w > 70 ? C.green : pos52w < 30 ? C.red : C.amber,
              }} />
            </div>
            <span style={{ fontSize: 9, color: C.muted, minWidth: 24 }}>{pos52w}%</span>
          </div>
        )}
        {f.marketCap !== null && f.marketCap > 0 && (
          <div style={{ background: "#111", borderRadius: 4, padding: "3px 7px", display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 8, color: C.dim }}>MCap</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: C.muted }}>
              {f.marketCap >= 1_000 ? `${(f.marketCap / 1_000).toFixed(0)}B` : `${Math.round(f.marketCap)}M`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Metrics Guide modal ────────────────────────────────────────────────────
const TECH_GUIDE = [
  {
    name: "RSI",
    full: "Relative Strength Index",
    desc: "Momentum oscillator measuring speed and size of recent price moves. Scale: 0–100.",
    bands: [
      { range: "< 30",   label: "Deeply oversold — reversal zone",   col: C.greenText  },
      { range: "30–45",  label: "Oversold — good entry territory",    col: C.greenText  },
      { range: "45–60",  label: "Neutral — room to run",              col: C.muted      },
      { range: "60–70",  label: "Approaching overbought",             col: C.amberText  },
      { range: "> 70",   label: "Overbought — avoid chasing",         col: C.redText    },
    ],
  },
  {
    name: "EMA20 / EMA50",
    full: "Exponential Moving Averages",
    desc: "Trend-following lines that weight recent prices more heavily. EMA20 = short-term (4 wks), EMA50 = medium-term (10 wks).",
    bands: [
      { range: "Price > both",  label: "Strong uptrend — most bullish",      col: C.greenText },
      { range: "Price > EMA20", label: "Short-term bullish",                  col: C.greenText },
      { range: "Price < both",  label: "Downtrend — avoid or wait",           col: C.redText   },
      { range: "Golden cross",  label: "EMA20 crosses above EMA50 — buy signal", col: C.greenText },
      { range: "Death cross",   label: "EMA20 crosses below EMA50 — sell signal", col: C.redText },
    ],
  },
  {
    name: "Vol",
    full: "Volume Ratio (today vs 20-day avg)",
    desc: "Compares today's traded volume to the 20-day average. High volume on a price move confirms conviction.",
    bands: [
      { range: "> 2.0×",    label: "Strong buying interest — high conviction", col: C.greenText },
      { range: "1.3–2.0×",  label: "Above-average activity",                   col: C.greenText },
      { range: "0.8–1.3×",  label: "Normal participation",                     col: C.muted     },
      { range: "< 0.8×",    label: "Thin market — weak conviction",            col: C.redText   },
    ],
  },
  {
    name: "Score",
    full: "Composite Technical Score",
    desc: "Weighted combination of RSI (30 pts), EMA trend (25 pts), EMA crossover (25 pts), and volume (20 pts).",
    bands: [
      { range: "75–100", label: "STRONG BUY",                    col: C.greenText },
      { range: "50–74",  label: "BUY — technically sound",       col: C.greenText },
      { range: "30–49",  label: "NEUTRAL — watch closely",       col: C.amberText },
      { range: "0–29",   label: "AVOID — weak technical setup",  col: C.redText   },
    ],
  },
];

const FUND_GUIDE = [
  {
    name: "P/E",
    full: "Price-to-Earnings Ratio",
    desc: "How many rupees you pay for every PKR 1 of annual profit. PSX market average is typically 8–12×.",
    bands: [
      { range: "< 8×",     label: "Potentially undervalued — cheap",    col: C.greenText },
      { range: "8–15×",    label: "Fair value range for PSX",           col: C.muted     },
      { range: "15–20×",   label: "Slightly premium — growth priced in",col: C.amberText },
      { range: "> 20×",    label: "Expensive — high expectations baked in", col: C.redText },
      { range: "Negative", label: "Loss-making company this year",      col: C.redText   },
    ],
  },
  {
    name: "PBV",
    full: "Price-to-Book Value",
    desc: "Price vs the company's net assets per share. A value of 1× means you pay exactly what the assets are worth.",
    bands: [
      { range: "< 1×",  label: "Trading below net assets — deep value (or distressed)", col: C.greenText },
      { range: "1–2×",  label: "Reasonable valuation",                                  col: C.muted     },
      { range: "2–3×",  label: "Moderate premium — quality company",                   col: C.amberText },
      { range: "> 3×",  label: "High premium — must justify with strong ROE",           col: C.redText   },
    ],
  },
  {
    name: "Div %",
    full: "Dividend Yield",
    desc: "Annual cash dividend paid to shareholders as a percentage of the current share price. Income return on your investment.",
    bands: [
      { range: "0%",    label: "No dividend — profits reinvested in growth", col: C.muted     },
      { range: "1–3%",  label: "Low yield — growth-oriented stock",          col: C.muted     },
      { range: "3–6%",  label: "Good yield — typical for PSX blue chips",    col: C.greenText },
      { range: "> 6%",  label: "High yield — income stock or price has fallen", col: C.greenText },
    ],
  },
  {
    name: "1M / 1Y",
    full: "Periodic Price Returns",
    desc: "Actual price change over the last 1 month and 1 year, shown as a percentage. Reflects momentum and long-term trend.",
    bands: [
      { range: "1Y > +20%",  label: "Strong long-term momentum",    col: C.greenText },
      { range: "1Y 0–20%",   label: "Positive but moderate trend",  col: C.greenText },
      { range: "1Y negative",label: "Underperformed — check why",   col: C.redText   },
    ],
  },
  {
    name: "52W Bar",
    full: "52-Week Price Position",
    desc: "Where the current price sits within the stock's 52-week high-low range. Shows if the stock is near a yearly high or low.",
    bands: [
      { range: "0–30%",  label: "Near 52-week low — beaten down, possible value entry", col: C.redText   },
      { range: "30–70%", label: "Mid-range — balanced momentum",                        col: C.amberText },
      { range: "70–100%",label: "Near 52-week high — strong momentum, watch resistance",col: C.greenText },
    ],
  },
  {
    name: "MCap",
    full: "Market Capitalisation",
    desc: "Total value of all outstanding shares (shares × price). Indicates company size and liquidity.",
    bands: [
      { range: "> 100B",   label: "Large cap — highly liquid, lower risk",   col: C.greenText },
      { range: "10–100B",  label: "Mid cap — good balance of growth & size", col: C.muted     },
      { range: "1–10B",    label: "Small cap — higher potential, more risk", col: C.amberText },
      { range: "< 1B",     label: "Micro cap — illiquid, speculative",       col: C.redText   },
    ],
  },
];

function MetricsGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.card, border: `0.5px solid ${C.border2}`, borderRadius: 10, padding: "18px 20px", width: "100%", maxWidth: 780, position: "relative" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Metrics Guide</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>What each indicator measures and how to read it</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Left: Technical */}
          <div>
            <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, paddingBottom: 6, borderBottom: `0.5px solid ${C.border}` }}>
              Technical Indicators
            </div>
            {TECH_GUIDE.map((m) => (
              <div key={m.name} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{m.name}</span>
                  <span style={{ fontSize: 9, color: C.dim }}>{m.full}</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, marginBottom: 5 }}>{m.desc}</div>
                {m.bands.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 3 }}>
                    <span style={{ fontSize: 9, color: C.dim, minWidth: 58, flexShrink: 0, paddingTop: 1 }}>{b.range}</span>
                    <span style={{ fontSize: 9, color: b.col, lineHeight: 1.4 }}>{b.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Right: Fundamentals */}
          <div>
            <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, paddingBottom: 6, borderBottom: `0.5px solid ${C.border}` }}>
              Fundamental Indicators
            </div>
            {FUND_GUIDE.map((m) => (
              <div key={m.name} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{m.name}</span>
                  <span style={{ fontSize: 9, color: C.dim }}>{m.full}</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, marginBottom: 5 }}>{m.desc}</div>
                {m.bands.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 3 }}>
                    <span style={{ fontSize: 9, color: C.dim, minWidth: 58, flexShrink: 0, paddingTop: 1 }}>{b.range}</span>
                    <span style={{ fontSize: 9, color: b.col, lineHeight: 1.4 }}>{b.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 9, color: C.dim, borderTop: `0.5px solid ${C.border}`, paddingTop: 10 }}>
          Technical data computed from PSX price history · Fundamental data sourced from askanalyst.com.pk · Not financial advice
        </div>
      </div>
    </div>
  );
}

// ─── Signal detail popup ────────────────────────────────────────────────────
function buildSignalNarrative(data: { tech?: StockTechLocal; fundamentals?: AskAnalystFundamentals }): { technical: string; valuation: string } {
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
      if (f.pe < 0)         valuation += `The company is currently loss-making (negative PE). `;
      else if (f.pe < 8)    valuation += `At PE ${f.pe.toFixed(1)}×, the stock is trading at a meaningful discount to the PSX average — a potentially undervalued setup. `;
      else if (f.pe < 15)   valuation += `PE of ${f.pe.toFixed(1)}× sits within fair-value range for PSX. `;
      else                  valuation += `PE of ${f.pe.toFixed(1)}× is above the PSX norm — growth expectations are already priced in. `;
    }
    if (f.dividendYield !== null && f.dividendYield >= 3)
      valuation += `The ${f.dividendYield.toFixed(1)}% dividend yield adds an income buffer to the position. `;
    if (f.totalReturn1Y !== null) {
      if (f.totalReturn1Y > 20)      valuation += `The stock has returned +${f.totalReturn1Y.toFixed(0)}% over the past year, reflecting sustained market interest.`;
      else if (f.totalReturn1Y > 0)  valuation += `With a +${f.totalReturn1Y.toFixed(0)}% 1-year return, the medium-term trend remains constructive.`;
      else                           valuation += `The stock is down ${Math.abs(f.totalReturn1Y).toFixed(0)}% over 12 months — contrarian setup if technicals confirm a reversal.`;
    }
  }
  return { technical, valuation };
}

interface SignalDetail {
  ticker: string;
  signal?: string;
  confidence?: number;
  reason?: string;
  newsHeadline?: string;
  catalysts?: string[];
  risks?: string[];
  suggestedEntry?: string;
  tech?: StockTechLocal;
  fundamentals?: AskAnalystFundamentals;
  currentPrice?: number;
  changePercent?: number;
}

function SignalDetailModal({ data, onClose }: { data: SignalDetail; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const { ticker, signal, confidence, reason, newsHeadline, catalysts, risks, suggestedEntry, tech, fundamentals, currentPrice, changePercent } = data;
  const pillStyle = PILL_MAP[signal?.toUpperCase() ?? ""] ?? PILL_MAP.WATCH;
  const narrative = buildSignalNarrative({ tech, fundamentals });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 12px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `0.5px solid ${C.border2}`, borderRadius: 10, padding: "16px 18px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{ticker}</span>
            {signal && (
              <span style={{ background: pillStyle.bg, color: pillStyle.color, border: `0.5px solid ${pillStyle.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
                {signal.toUpperCase()}
              </span>
            )}
            {currentPrice !== undefined && (
              <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>PKR {currentPrice.toFixed(2)}</span>
            )}
            {changePercent !== undefined && (
              <span style={{ fontSize: 10, color: changePercent >= 0 ? C.greenText : C.redText }}>
                {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        {/* AI reason as a highlighted headline */}
        {reason && (
          <p style={{ fontSize: 12, color: C.text, lineHeight: 1.5, margin: "0 0 10px", borderLeft: `2px solid ${pillStyle.border}`, paddingLeft: 9, fontStyle: "italic" }}>
            {reason}
          </p>
        )}

        {/* Confidence bar */}
        {confidence !== undefined && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 9, color: C.dim }}>AI Confidence</span>
              <span style={{ fontSize: 9, color: C.muted }}>{confidence}%</span>
            </div>
            <div style={{ height: 3, background: C.border2, borderRadius: 2 }}>
              <div style={{ width: `${confidence}%`, height: 3, background: pillStyle.border, borderRadius: 2 }} />
            </div>
          </div>
        )}

        {/* Technical setup narrative */}
        {narrative.technical && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Technical Setup</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.75, margin: 0 }}>{narrative.technical}</p>
          </div>
        )}

        {/* Valuation narrative */}
        {narrative.valuation && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Valuation</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.75, margin: 0 }}>{narrative.valuation}</p>
          </div>
        )}

        {/* News catalyst */}
        {newsHeadline && newsHeadline !== "No recent news" && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>News Catalyst</div>
            <div style={{ fontSize: 11, color: C.blueText, fontStyle: "italic" }}>📰 {newsHeadline}</div>
          </div>
        )}

        {/* Catalysts + Risks */}
        {((catalysts?.length ?? 0) > 0 || (risks?.length ?? 0) > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12, paddingTop: 10, borderTop: `0.5px solid ${C.border}` }}>
            {(catalysts?.length ?? 0) > 0 && (
              <div>
                <div style={{ fontSize: 9, color: C.greenText, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>Why it works</div>
                {catalysts!.map((c, i) => <div key={i} style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>✓ {c}</div>)}
              </div>
            )}
            {(risks?.length ?? 0) > 0 && (
              <div>
                <div style={{ fontSize: 9, color: C.redText, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>Watch out for</div>
                {risks!.map((r, i) => <div key={i} style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>⚠ {r}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Suggested entry */}
        {suggestedEntry && (
          <div style={{ background: C.amberDim, border: `0.5px solid ${C.amber}40`, borderRadius: 6, padding: "7px 12px", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4 }}>Suggested entry</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.amberText }}>{suggestedEntry}</span>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 9, color: C.dim }}>
          Fundamentals from askanalyst.com.pk · Technicals from PSX price history · Not financial advice
        </div>
      </div>
    </div>
  );
}

// ─── Derive catalysts & risks from raw technical data ──────────────────────
interface StockTechLocal {
  symbol: string; compositeScore: number; technicalSignal: string;
  rsi: number; ema20: number; ema50: number; currentPrice: number;
  volumeRatio: number; todayVolume?: number; avgVolume20d?: number;
  crossoverSignal: string; priceVsEma20: string; priceVsEma50?: string; reasons: string[];
}
/** Format a raw share-volume number: 1234567 → "1.2M", 70435 → "70K" */
function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return `${Math.round(n)}`;
}
/** Display string for the Vol chip.
 *  Priority: live market-watch volume → EOD todayVolume → ratio-only fallback */
function volLabel(tech: StockTechLocal, liveVolume?: number): string {
  const vol = liveVolume ?? tech.todayVolume ?? null;
  return vol ? `${fmtVol(vol)} (${tech.volumeRatio.toFixed(1)}x avg)` : `${tech.volumeRatio.toFixed(1)}x avg`;
}
function techCatalysts(t: StockTechLocal): string[] {
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
function techRisks(t: StockTechLocal): string[] {
  const out: string[] = [];
  if (t.rsi > 68) out.push(`RSI ${t.rsi.toFixed(0)} — approaching overbought`);
  if (t.volumeRatio < 0.8) out.push(`Volume ${t.volumeRatio.toFixed(1)}x avg — weak conviction`);
  if (t.ema20 < t.ema50)   out.push("EMA20 below EMA50 — bearish crossover");
  if (t.compositeScore < 55) out.push("Moderate technical score — watch closely");
  if (out.length === 0) out.push("General market volatility");
  out.push("Always verify with fundamentals");
  return out.slice(0, 3);
}

// ─── PKT clock ─────────────────────────────────────────────────────────────
function isPKTOpen() {
  const pkt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
  const h = pkt.getHours(), m = pkt.getMinutes(), day = pkt.getDay();
  if (day === 0 || day === 6) return false;
  const mins = h * 60 + m;
  if (day === 5) return (mins >= 570 && mins <= 720) || (mins >= 870 && mins <= 930);
  return mins >= 570 && mins <= 930;
}
function PKTClock() {
  const [t, setT] = useState(""); const [open, setOpen] = useState(false);
  useEffect(() => {
    const tick = () => {
      const pkt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
      setT(pkt.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }));
      setOpen(isPKTOpen());
    };
    tick(); const id = setInterval(tick, 30000); return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: open ? C.green : C.dim, display: "inline-block" }} />
      <span>KSE-100 · {t} PKT · {open ? "Open" : "Closed"}</span>
    </div>
  );
}

// StockTech alias (matches StockTechLocal defined above near ConfBar)
type StockTech = StockTechLocal;

// ─── Holdings ──────────────────────────────────────────────────────────────
interface Holding { ticker: string; name: string; shares: number; avgPrice: number; shariah: boolean; }
const DEFAULT_HOLDINGS: Holding[] = [];

// ─── Watchlist ─────────────────────────────────────────────────────────────
interface WatchItem { ticker: string; name: string; }

const s_label: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 };
const cardStyle: React.CSSProperties = { background: C.card, borderRadius: 8, border: `0.5px solid ${C.border}`, padding: "10px 12px", marginBottom: 8 };
const inputSt: React.CSSProperties = { flex: 1, fontSize: 11, padding: "4px 8px", borderRadius: 5, border: `0.5px solid ${C.border2}`, background: "#111", color: C.text, outline: "none" };
const btnSt: React.CSSProperties = { fontSize: 10, padding: "4px 10px", borderRadius: 5, border: `0.5px solid ${C.border2}`, background: "transparent", color: C.muted, cursor: "pointer" };
const accentBtn: React.CSSProperties = { ...btnSt, borderColor: C.green + "80", color: C.greenText };
const dangerBtn: React.CSSProperties = { ...btnSt, borderColor: C.amber + "60", color: C.amberText };

// ─── PSX sector code → readable name ──────────────────────────────────────
const SECTOR_CODE_TO_NAME: Record<string, string> = {
  "0801": "Automobile", "0804": "Cement", "0805": "Chemicals",
  "0807": "Banking", "0808": "Engineering", "0809": "Fertilizer",
  "0810": "Food & Beverages", "0812": "Insurance", "0819": "Modaraba",
  "0820": "Oil & Gas", "0821": "OMC", "0822": "Packaging",
  "0823": "Pharmaceuticals", "0824": "Power", "0825": "Refinery",
  "0826": "Sugar", "0828": "Technology", "0829": "Textile",
  "0833": "Transport", "0836": "REIT", "0838": "Real Estate",
};
function resolveSectorName(raw: string): string {
  return SECTOR_CODE_TO_NAME[raw.trim()] ?? raw;
}

// ─── Holdings overview: donut chart + portfolio calculations table ─────────────
const PIE_COLORS = [C.green, C.blue, C.amber, C.purple, "#c08060", "#60b0c0", "#a0c060", "#c060a0"];

function polarToCart(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function donutSlicePath(cx: number, cy: number, r: number, ir: number, startDeg: number, endDeg: number): string {
  const gap = Math.min(1.5, (endDeg - startDeg) * 0.04);
  const s1 = polarToCart(cx, cy, r,  startDeg + gap);
  const e1 = polarToCart(cx, cy, r,  endDeg   - gap);
  const s2 = polarToCart(cx, cy, ir, endDeg   - gap);
  const e2 = polarToCart(cx, cy, ir, startDeg + gap);
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s1.x.toFixed(2)} ${s1.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e1.x.toFixed(2)} ${e1.y.toFixed(2)} L ${s2.x.toFixed(2)} ${s2.y.toFixed(2)} A ${ir} ${ir} 0 ${large} 0 ${e2.x.toFixed(2)} ${e2.y.toFixed(2)} Z`;
}

function HoldingsOverview({ holdings, prices, isMobile = false }: {
  holdings: Holding[];
  prices: Record<string, StockQuote>;
  isMobile?: boolean;
}) {
  if (holdings.length === 0) return null;

  const fmtPKR = (v: number) =>
    Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
    : Math.abs(v) >= 1_000   ? `${(v / 1_000).toFixed(1)}K`
    : Math.round(Math.abs(v)).toString();

  const rows = holdings.map((h, i) => {
    const livePrice  = prices[h.ticker]?.currentPrice ?? h.avgPrice;
    const changeToday = prices[h.ticker]?.changePercent;
    const marketVal  = livePrice * h.shares;
    const costBasis  = h.avgPrice * h.shares;
    const pnl        = marketVal - costBasis;
    const pnlPct     = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return { ticker: h.ticker, name: h.name, marketVal, costBasis, pnl, pnlPct, changeToday, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  const totalMV   = rows.reduce((s, r) => s + r.marketVal, 0);
  const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);
  const totalPnl  = totalMV - totalCost;
  const totalPct  = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  // Donut slices — sized for 100×100 SVG
  const cx = 50, cy = 50, R = 44, ir = 26;
  let degCursor = 0;
  const slices = rows.map(r => {
    const frac   = totalMV > 0 ? r.marketVal / totalMV : 1 / rows.length;
    const span   = frac * 360;
    const path   = donutSlicePath(cx, cy, R, ir, degCursor, degCursor + span);
    degCursor   += span;
    return { ...r, path };
  });

  // Sector map for legend
  const sectorMap: Record<string, number> = {};
  for (const r of rows) {
    const raw    = r.name.includes(" · ") ? r.name.split(" · ").slice(1).join(" · ") : "Other";
    const sector = resolveSectorName(raw);
    sectorMap[sector] = (sectorMap[sector] ?? 0) + r.marketVal;
  }
  const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ background: "#111", borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 18, alignItems: isMobile ? "stretch" : "flex-start" }}>

        {/* ── LEFT: Compact donut only ── */}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: isMobile ? "center" : "flex-start" }}>
          <svg width={100} height={100}>
            {slices.map((s, i) => (
              <path key={i} d={s.path} fill={s.color} />
            ))}
            <text x={50} y={46}  textAnchor="middle" fill={C.text}  fontSize={8}  fontWeight={700}>{fmtPKR(totalMV)}</text>
            <text x={50} y={55}  textAnchor="middle" fill={C.dim}   fontSize={6.5}>PKR total</text>
            <text x={50} y={65} textAnchor="middle" fill={totalPnl >= 0 ? C.greenText : C.redText} fontSize={7} fontWeight={600}>
              {totalPnl >= 0 ? "+" : "-"}{fmtPKR(totalPnl)}
            </text>
          </svg>
        </div>

        {/* ── RIGHT: Companies bars + separated financial panel ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* KPI summary line */}
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
              <span style={{ fontSize: 8, color: C.dim }}>Value</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>PKR {fmtPKR(totalMV)}</span>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
              <span style={{ fontSize: 8, color: C.dim }}>Invested</span>
              <span style={{ fontSize: 10, color: C.muted }}>PKR {fmtPKR(totalCost)}</span>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
              <span style={{ fontSize: 8, color: C.dim }}>P&L</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: totalPnl >= 0 ? C.greenText : C.redText }}>
                {totalPnl >= 0 ? "+" : "-"}PKR {fmtPKR(totalPnl)}
              </span>
              <span style={{ fontSize: 9, color: totalPct >= 0 ? C.greenText : C.redText }}>({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(1)}%)</span>
            </div>
          </div>

          {/* Main row: allocation bars (left) + financial panel (right) */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

            {/* ── Allocation bars column ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* "COMPANIES" heading — same height as financial panel's header row */}
              <div style={{ fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, height: 22, display: "flex", alignItems: "center" }}>Companies</div>

              {rows.map(r => {
                const alloc = totalMV > 0 ? (r.marketVal / totalMV) * 100 : 0;
                return (
                  <div key={r.ticker} style={{ display: "flex", alignItems: "center", gap: 7, height: 28, marginBottom: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.text, width: 38, flexShrink: 0 }}>{r.ticker}</span>
                    <div style={{ flex: 1, height: 6, background: C.border2, borderRadius: 3 }}>
                      <div style={{ width: `${alloc}%`, height: 6, borderRadius: 3, background: r.color }} />
                    </div>
                    <span style={{ fontSize: 9, color: C.muted, width: 38, textAlign: "right", flexShrink: 0 }}>{alloc.toFixed(1)}%</span>
                  </div>
                );
              })}

              {/* Total label — aligned with financial panel's total row */}
              <div style={{ height: 30, display: "flex", alignItems: "center", borderTop: `0.5px solid ${C.border}`, marginTop: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>Total</span>
              </div>
            </div>

            {/* ── Financial mini-panel ── */}
            <div style={{ flexShrink: 0, background: "#0d0d0d", border: `0.5px solid ${C.border2}`, borderRadius: 7, padding: "6px 12px" }}>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "74px 84px 44px 44px", gap: "0 10px", height: 22, alignItems: "center" }}>
                {["Invested", "Unrealised P&L", "P&L %", "Today"].map(h => (
                  <span key={h} style={{ fontSize: 7, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</span>
                ))}
              </div>

              {/* Per-holding rows */}
              {rows.map(r => (
                <div key={r.ticker} style={{ display: "grid", gridTemplateColumns: "74px 84px 44px 44px", gap: "0 10px", height: 28, alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: C.muted }}>PKR {fmtPKR(r.costBasis)}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: r.pnl >= 0 ? C.greenText : C.redText }}>
                    {r.pnl >= 0 ? "+" : "-"}PKR {fmtPKR(r.pnl)}
                  </span>
                  <span style={{ fontSize: 9, color: r.pnlPct >= 0 ? C.greenText : C.redText }}>
                    {r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 9, color: r.changeToday !== undefined ? (r.changeToday >= 0 ? C.greenText : C.redText) : C.dim }}>
                    {r.changeToday !== undefined ? `${r.changeToday >= 0 ? "+" : ""}${r.changeToday.toFixed(1)}%` : "—"}
                  </span>
                </div>
              ))}

              {/* Total row */}
              <div style={{ display: "grid", gridTemplateColumns: "74px 84px 44px 44px", gap: "0 10px", height: 30, alignItems: "center", borderTop: `0.5px solid ${C.border}`, marginTop: 4 }}>
                <span style={{ fontSize: 9, color: C.muted }}>PKR {fmtPKR(totalCost)}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: totalPnl >= 0 ? C.greenText : C.redText }}>
                  {totalPnl >= 0 ? "+" : "-"}PKR {fmtPKR(totalPnl)}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: totalPct >= 0 ? C.greenText : C.redText }}>
                  {totalPct >= 0 ? "+" : ""}{totalPct.toFixed(1)}%
                </span>
                <span />
              </div>
            </div>
          </div>

          {/* SECTORS row */}
          {sectors.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 7, borderTop: `0.5px solid ${C.border}`, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>Sectors</span>
              {sectors.map(([sector, val], i) => {
                const pct = totalMV > 0 ? ((val / totalMV) * 100).toFixed(0) : "0";
                return (
                  <span key={sector} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.muted }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0, display: "inline-block" }} />
                    {sector}
                    <span style={{ color: C.text, fontWeight: 500 }}>{pct}%</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Synthesise the AI sector/factor data into flowing prose for the expanded view. */
function buildExpandedNarrative(analysis: NewsAnalysis): string {
  const parts: string[] = [];
  const neg = analysis.affectedSectors.filter(s => s.impact === "NEGATIVE");
  const pos = analysis.affectedSectors.filter(s => s.impact === "POSITIVE");

  if (neg.length === 1) {
    parts.push(`The ${neg[0].sectorName} sector is under notable pressure — ${neg[0].reason.replace(/\.$/, "").toLowerCase()}.`);
  } else if (neg.length > 1) {
    const list = neg.map(s => `${s.sectorName} (${s.reason.replace(/\.$/, "").toLowerCase()})`).join("; ");
    parts.push(`Several sectors are facing headwinds: ${list}.`);
  }

  if (pos.length === 1) {
    parts.push(`Meanwhile, the ${pos[0].sectorName} sector is positioned to benefit — ${pos[0].reason.replace(/\.$/, "").toLowerCase()}.`);
  } else if (pos.length > 1) {
    const list = pos.map(s => `${s.sectorName} (${s.reason.replace(/\.$/, "").toLowerCase()})`).join("; ");
    parts.push(`Sectors with a positive outlook include ${list}.`);
  }

  if (analysis.globalFactors.length > 0) {
    parts.push(`On the global front, ${analysis.globalFactors.join(", ")} are key factors shaping the broader market backdrop.`);
  }

  if (parts.length === 0) {
    parts.push("No specific sector catalysts were identified from today's news. Market conditions appear broadly neutral based on available data.");
  }

  return parts.join(" ");
}

// ─── Main Dashboard ────────────────────────────────────────────────────────
export default function Dashboard() {
  // Persistence
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try { return JSON.parse(localStorage.getItem("psx_holdings") ?? "null") ?? DEFAULT_HOLDINGS; } catch { return DEFAULT_HOLDINGS; }
  });
  const [watching, setWatching] = useState<WatchItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("psx_watch") ?? "null") ?? []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem("psx_holdings", JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { localStorage.setItem("psx_watch", JSON.stringify(watching)); }, [watching]);

  // Prices
  const [prices, setPrices] = useState<Record<string, StockQuote>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Scan result tickers need prices too — keep a ref so allTickers stays stable
  // between renders that don't change the actual ticker list
  const scanTickersRef = useRef<string[]>([]);

  // Scanner
  const [scanResult, setScanResult] = useState<{
    signals: AISignal[];
    newsAnalysis: NewsAnalysis | null;
    expandedSectors: string[];
    totalScanned: number;
    passedTechnicals: number;
    timestamp: string;
    technicalData: StockTech[];
    newsHeadlines: string[];     // raw headlines fed to the AI
    newsSources: string[];       // which RSS sources contributed
    newsFromCache: boolean;      // true = AI reused cached analysis (news unchanged)
  } | null>(null);
  const [expandNewsPanel, setExpandNewsPanel] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanPhase, setScanPhase] = useState("");

  // Watchlist signals (from dedicated /api/watchscan call)
  const [watchSignals, setWatchSignals] = useState<Record<string, AISignal>>({});
  const [runningWatchAI, setRunningWatchAI] = useState(false);
  const [watchAIError, setWatchAIError] = useState("");
  // Watchlist + holding technical data (from /api/technicals)
  const [watchTech, setWatchTech] = useState<Record<string, StockTech>>({});
  const [holdingTech, setHoldingTech] = useState<Record<string, StockTech>>({});
  const [loadingWatchTech, setLoadingWatchTech] = useState(false);
  // AskAnalyst fundamentals (PE, PBV, div yield, 52W range, periodic returns)
  const [askAnalystData, setAskAnalystData] = useState<Record<string, AskAnalystFundamentals>>({});

  // Sort states
  const [sortOpps, setSortOpps] = useState<"confidence" | "name">("confidence");
  const [sortWatch, setSortWatch] = useState<"confidence" | "name">("confidence");

  // Settings
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showMetricsGuide, setShowMetricsGuide] = useState(false);
  const [signalDetail, setSignalDetail] = useState<SignalDetail | null>(null);

  // Responsive
  const isMobile = useWindowWidth() < 640;
  // Tracks which cards have fundamentals expanded on mobile
  const [showFunds, setShowFunds] = useState<Set<string>>(new Set());
  const toggleFunds = (ticker: string) =>
    setShowFunds(prev => { const n = new Set(prev); n.has(ticker) ? n.delete(ticker) : n.add(ticker); return n; });

  // Export for Claude
  const [exportCopied, setExportCopied] = useState(false);

  const exportForClaude = () => {
    const lines: string[] = [];
    const now = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" });
    lines.push(`=== PSX SCANNER SNAPSHOT — ${now} PKT ===`);
    lines.push(`Market: KSE-100 · ${isPKTOpen() ? "OPEN" : "CLOSED"}\n`);

    // Macro context
    if (scanResult?.newsAnalysis) {
      const na = scanResult.newsAnalysis;
      lines.push("── MACRO CONTEXT ──────────────────────────────");
      lines.push(na.summary);
      if (na.affectedSectors.length > 0) {
        lines.push("\nSector Impact:");
        na.affectedSectors.forEach(s => {
          const icon = s.impact === "POSITIVE" ? "▲" : s.impact === "NEGATIVE" ? "▼" : "–";
          lines.push(`  ${icon} ${s.sectorName}: ${s.reason}`);
        });
      }
      if (na.globalFactors.length > 0)
        lines.push(`\nGlobal Factors: ${na.globalFactors.join(" · ")}`);
      lines.push(`\nScan time: ${new Date(scanResult.timestamp).toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" })} PKT · ${scanResult.totalScanned} stocks scanned · ${scanResult.passedTechnicals} passed technicals`);
    }

    // ── Build a unified per-ticker map across all three sections ──
    // Each ticker appears exactly once; tags show which sections it belongs to.
    type TickerEntry = {
      name: string;
      shariah: boolean;
      inHoldings: boolean;
      inSignals: boolean;
      inWatching: boolean;
      holding?: typeof holdings[0];
      signal?: typeof scanResult extends null ? never : NonNullable<typeof scanResult>["signals"][0];
    };
    const tickerMap = new Map<string, TickerEntry>();

    holdings.forEach(h => {
      tickerMap.set(h.ticker, { name: h.name, shariah: !!h.shariah, inHoldings: true, inSignals: false, inWatching: false, holding: h });
    });

    scanResult?.signals.forEach(sig => {
      const ex = tickerMap.get(sig.ticker);
      if (ex) {
        ex.inSignals = true; ex.signal = sig;
      } else {
        tickerMap.set(sig.ticker, { name: sig.ticker, shariah: false, inHoldings: false, inSignals: true, inWatching: false, signal: sig });
      }
    });

    watching.forEach(w => {
      const ex = tickerMap.get(w.ticker);
      if (ex) { ex.inWatching = true; if (!ex.name || ex.name === w.ticker) ex.name = w.name; }
      else tickerMap.set(w.ticker, { name: w.name, shariah: false, inHoldings: false, inSignals: false, inWatching: true });
    });

    // Sort: holdings first, then buy signals, then watchlist-only
    const sorted = [...tickerMap.entries()].sort(([, a], [, b]) => {
      const s = (e: TickerEntry) => (e.inHoldings ? 4 : 0) + (e.inSignals ? 2 : 0) + (e.inWatching ? 1 : 0);
      return s(b) - s(a);
    });

    if (sorted.length > 0) {
      lines.push("\n── STOCKS ──────────────────────────────────────");
      sorted.forEach(([ticker, e], i) => {
        const tags: string[] = [];
        if (e.inHoldings) tags.push("HOLDING");
        if (e.inSignals) tags.push("BUY SIGNAL");
        if (e.inWatching) tags.push("WATCHING");
        lines.push(`\n${i + 1}. ${ticker}${e.shariah ? " [KMI-30]" : ""} [${tags.join(" · ")}] — ${e.name}`);

        // Live price
        const live = prices[ticker];
        if (live) lines.push(`   Price: PKR ${live.currentPrice.toFixed(2)}  (${live.changePercent >= 0 ? "+" : ""}${live.changePercent.toFixed(2)}% today)`);

        // Holdings detail
        if (e.holding) {
          const h = e.holding;
          const lp = live?.currentPrice ?? h.avgPrice;
          const cost = h.avgPrice * h.shares;
          const mv = lp * h.shares;
          const pnl = mv - cost;
          const pct = cost > 0 ? (pnl / cost) * 100 : 0;
          lines.push(`   Holding: ${h.shares.toLocaleString()} shares @ PKR ${h.avgPrice.toFixed(2)} avg cost`);
          lines.push(`   P&L: ${pnl >= 0 ? "+" : ""}PKR ${Math.round(pnl).toLocaleString()}  (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
        }

        // Buy signal detail
        const sig = e.signal ?? watchSignals[ticker] ?? scanResult?.signals.find(s => s.ticker === ticker);
        if (sig) {
          lines.push(`   Signal: ${sig.signal} (${sig.confidence}% confidence) — ${sig.reason}`);
          if (sig.suggestedEntry) lines.push(`   Entry: ${sig.suggestedEntry}`);
          if (sig.newsHeadline && sig.newsHeadline !== "No recent news") lines.push(`   News: ${sig.newsHeadline}`);
          if (sig.catalysts?.length) lines.push(`   Catalysts: ${sig.catalysts.join("; ")}`);
          if (sig.risks?.length) lines.push(`   Risks: ${sig.risks.join("; ")}`);
        }

        // Technicals — check all sources
        const tech = holdingTech[ticker] ?? watchTech[ticker] ?? scanResult?.technicalData?.find(t => t.symbol === ticker);
        if (tech) {
          const parts = [`RSI ${tech.rsi.toFixed(0)}`, `EMA20 ${tech.ema20.toFixed(2)}`, `Vol ${volLabel(tech, prices[ticker]?.volume)}`, `Score ${tech.compositeScore}/100 [${tech.technicalSignal}]`];
          lines.push(`   Technicals: ${parts.join(" | ")}`);
        }

        // Fundamentals
        const fund = askAnalystData[ticker];
        if (fund) {
          const fp: string[] = [];
          if (fund.pe !== null) fp.push(`PE ${fund.pe.toFixed(1)}x`);
          if (fund.pbv !== null) fp.push(`PBV ${fund.pbv.toFixed(1)}x`);
          if (fund.dividendYield !== null && fund.dividendYield > 0) fp.push(`Div ${fund.dividendYield.toFixed(1)}%`);
          if (fund.totalReturn1Y !== null) fp.push(`1Y ${fund.totalReturn1Y >= 0 ? "+" : ""}${fund.totalReturn1Y.toFixed(1)}%`);
          if (fund.marketCap !== null) fp.push(`MCap ${fund.marketCap >= 1000 ? `${(fund.marketCap / 1000).toFixed(0)}B` : `${Math.round(fund.marketCap)}M`}`);
          if (fp.length) lines.push(`   Fundamentals: ${fp.join(" | ")}`);
        }
      });
    }

    // Portfolio summary (holdings only)
    if (holdings.length > 0) {
      let totalCost = 0, totalVal = 0;
      holdings.forEach(h => {
        totalCost += h.avgPrice * h.shares;
        totalVal += (prices[h.ticker]?.currentPrice ?? h.avgPrice) * h.shares;
      });
      const tPnl = totalVal - totalCost;
      const tPct = totalCost > 0 ? (tPnl / totalCost) * 100 : 0;
      lines.push(`\n── PORTFOLIO SUMMARY ───────────────────────────`);
      lines.push(`Value: PKR ${Math.round(totalVal).toLocaleString()} | Invested: PKR ${Math.round(totalCost).toLocaleString()} | P&L: ${tPnl >= 0 ? "+" : ""}PKR ${Math.round(tPnl).toLocaleString()} (${tPct >= 0 ? "+" : ""}${tPct.toFixed(2)}%)`);
    }

    lines.push("\n────────────────────────────────────────────────");
    lines.push(`Data sources: PSX live prices · AskAnalyst.com.pk fundamentals · AI by ${settings.provider}`);
    lines.push("Not financial advice — for reference and analysis only.");

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2500);
    }).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = lines.join("\n");
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2500);
    });
  };

  // UI state
  const [tab, setTab] = useState<"opportunities" | "holdings" | "watching">("opportunities");
  const [newHolding, setNewHolding] = useState({ ticker: "", shares: "", avg: "" });
  const [newWatch, setNewWatch] = useState("");
  const [holdingError, setHoldingError] = useState("");
  const [watchError, setWatchError] = useState("");
  const [addingHolding, setAddingHolding] = useState(false);
  const [addingWatch, setAddingWatch] = useState(false);
  // Inline edit for holdings
  const [editingHolding, setEditingHolding] = useState<{ ticker: string; shares: string; avg: string } | null>(null);
  // Two-step delete confirmations
  const [pendingDeleteHolding, setPendingDeleteHolding] = useState<string | null>(null);
  const [pendingDeleteWatch, setPendingDeleteWatch] = useState<string | null>(null);

  // ── Price fetching ──────────────────────────────────────────────────────
  // Include scan result tickers so Buy Opportunity cards show live prices
  const allTickers = [...new Set([
    ...holdings.map(h => h.ticker),
    ...watching.map(w => w.ticker),
    ...scanTickersRef.current,
  ])];

  const fetchPrices = useCallback(async () => {
    if (!allTickers.length) return;
    setLoadingPrices(true);
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: allTickers }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrices(prev => ({ ...prev, ...data }));
        setServerOnline(true);
        const pkt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
        setLastUpdated(pkt.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) + " PKT");
      } else {
        setServerOnline(false);
      }
    } catch { setServerOnline(false); }
    setLoadingPrices(false);
  }, [allTickers.join(",")]); // eslint-disable-line

  // Fetch on mount, and whenever the ticker list changes (new holding / watch item added)
  useEffect(() => { fetchPrices(); }, [fetchPrices]); // eslint-disable-line
  // Refresh prices every 60s
  useEffect(() => { const id = setInterval(fetchPrices, 60000); return () => clearInterval(id); }, []); // eslint-disable-line

  // ── Full scanner ────────────────────────────────────────────────────────
  const runFullScan = async () => {
    if (!settings.apiKey) { setShowSettings(true); return; }
    setScanning(true); setScanError(""); setScanPhase("Searching for latest Pakistan & global news…");
    try {
      setScanPhase("Pass 1 · Analysing macro conditions & identifying sectors…");
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: settings.provider, apiKey: settings.apiKey, model: settings.model, mode: "full" }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Clean up common API errors into readable messages
        const raw = data.error ?? "Scan failed";
        if (raw.includes("quota") || raw.includes("429") || raw.includes("Too Many Requests"))
          throw new Error("API quota exceeded. Add billing to your AI provider account, or switch providers in Settings.");
        if (raw.includes("401") || raw.includes("403") || raw.includes("invalid") || raw.includes("API key"))
          throw new Error("Invalid API key. Double-check it in Settings — make sure you copied the full key.");
        throw new Error(raw.length > 200 ? raw.slice(0, 200) + "…" : raw);
      }
      setScanPhase("Pass 2 · Scoring technicals & selecting best picks…");
      const newSignals: AISignal[] = data.signals ?? [];
      // Register scan tickers so the prices hook fetches them on next tick
      scanTickersRef.current = newSignals.map((s: AISignal) => s.ticker);
      // Fundamentals come back in the scan response — merge directly (no extra fetch needed)
      if (data.fundamentals && Object.keys(data.fundamentals).length > 0) {
        setAskAnalystData(prev => ({ ...prev, ...data.fundamentals }));
      }
      setScanResult({
        signals: newSignals,
        newsAnalysis: data.newsAnalysis ?? null,
        expandedSectors: data.expandedSectors ?? [],
        totalScanned: data.totalScanned ?? 0,
        passedTechnicals: data.passedTechnicals ?? 0,
        timestamp: data.timestamp,
        technicalData: data.technicalData ?? [],
        newsHeadlines: data.newsHeadlines ?? [],
        newsSources: data.newsSources ?? [],
        newsFromCache: data.newsFromCache ?? false,
      });
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Unknown error");
    }
    setScanning(false); setScanPhase("");
  };

  const runNewsRefresh = async () => {
    if (!settings.apiKey) { setShowSettings(true); return; }
    setScanning(true); setScanError(""); setScanPhase("Refreshing news only…");
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: settings.provider, apiKey: settings.apiKey, model: settings.model }),
      });
      const news = await res.json();
      if (!res.ok) throw new Error(news.error ?? "News refresh failed");
      setScanResult(prev => prev ? {
        ...prev,
        newsAnalysis: news.newsAnalysis ?? news,       // handle both shapes
        newsHeadlines: news.newsHeadlines ?? prev.newsHeadlines,
        newsSources: news.newsSources ?? prev.newsSources,
        newsFromCache: news.newsFromCache ?? false,
      } : null);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Unknown error");
    }
    setScanning(false); setScanPhase("");
  };

  // KMI-30 list for Shariah auto-detection (client-side)
  const KMI30 = new Set([
    "MEBL","HBL","UBL","MCB","BAHL",
    "OGDC","PPL","PSO","MARI","POL",
    "LUCK","MLCF","CHCC","DGKC","PIOC",
    "ENGRO","EFERT","FFC","FATIMA","NRL",
    "HUBC","KAPCO","KEL","NCPL","PKGP",
    "SYS","TRG","AVN","COLG","EPCL",
  ]);

  /** Validate ticker exists on PSX by calling the prices API. */
  async function validateTicker(symbol: string): Promise<{ valid: boolean; quote?: StockQuote }> {
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [symbol] }),
      });
      if (!res.ok) return { valid: false };
      const data: Record<string, StockQuote> = await res.json();
      const quote = data[symbol];
      return quote ? { valid: true, quote } : { valid: false };
    } catch {
      return { valid: false };
    }
  }

  // ── Holdings helpers ────────────────────────────────────────────────────
  const addHolding = async () => {
    const t = newHolding.ticker.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
    const shares = parseFloat(newHolding.shares);
    const avg = parseFloat(newHolding.avg);
    if (!t) { setHoldingError("Enter a ticker symbol (e.g. OGDC)."); return; }
    if (!shares || shares <= 0) { setHoldingError("Enter a valid number of shares."); return; }
    if (!avg || avg <= 0) { setHoldingError("Enter a valid average purchase price."); return; }
    setHoldingError("");
    setAddingHolding(true);
    const { valid, quote } = await validateTicker(t);
    setAddingHolding(false);
    if (!valid) {
      setHoldingError(`"${t}" not found on PSX. Check the ticker symbol and try again.`);
      return;
    }
    const isShariah = KMI30.has(t);
    // Update prices immediately with the validated quote
    if (quote) setPrices(prev => ({ ...prev, [t]: quote }));
    setHoldings(prev => [...prev.filter(h => h.ticker !== t), {
      ticker: t,
      name: quote?.sector ? `${t} · ${resolveSectorName(quote.sector)}` : t,
      shares,
      avgPrice: avg,
      shariah: isShariah,
    }]);
    setNewHolding({ ticker: "", shares: "", avg: "" });
    // Load fundamentals + technicals immediately so chips show right away
    fetchAskAnalystBatch([t]);
    fetch(`/api/technicals?symbol=${t}`)
      .then(r => r.ok ? r.json() : null)
      .then(tech => { if (tech) setHoldingTech(prev => ({ ...prev, [t]: tech })); })
      .catch(() => {});
  };

  const addWatch = async () => {
    const t = newWatch.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
    if (!t) return;
    if (watching.find(w => w.ticker === t)) { setNewWatch(""); return; }
    setWatchError("");
    setAddingWatch(true);
    const { valid, quote } = await validateTicker(t);
    setAddingWatch(false);
    if (!valid) {
      setWatchError(`"${t}" not found on PSX. Check the ticker symbol.`);
      return;
    }
    if (quote) setPrices(prev => ({ ...prev, [t]: quote }));
    setWatching(prev => [...prev, {
      ticker: t,
      name: quote?.sector ? `${t} · ${resolveSectorName(quote.sector)}` : t,
    }]);
    setNewWatch("");
    // Auto-load technicals and fundamentals immediately
    fetchSingleWatchTech(t);
    fetchAskAnalystBatch([t]);
  };

  // ── Quick-add from scan results (no PSX validation needed) ─────────────
  const quickAddWatch = (ticker: string) => {
    if (!watching.find(w => w.ticker === ticker)) {
      setWatching(prev => [...prev, { ticker, name: ticker }]);
      // Auto-load technicals and fundamentals
      if (!watchTech[ticker]) fetchSingleWatchTech(ticker);
      fetchAskAnalystBatch([ticker]);
    }
  };

  // ── Fetch technicals for a single ticker (fire-and-forget) ─────────────
  const fetchSingleWatchTech = async (ticker: string) => {
    try {
      const res = await fetch(`/api/technicals?symbol=${ticker}`);
      if (res.ok) {
        const tech = await res.json();
        setWatchTech(prev => ({ ...prev, [ticker]: tech }));
      }
    } catch { /* ignore */ }
  };

  // ── Fetch AskAnalyst fundamentals for one or many tickers ─────────────────
  const fetchAskAnalystBatch = async (tickers: string[]) => {
    if (!tickers.length) return;
    const fresh = tickers.filter(t => !askAnalystData[t]);
    if (!fresh.length) return; // all already loaded
    try {
      const res = await fetch(`/api/askanalyst?symbol=${fresh.join(",")}`);
      if (!res.ok) return;
      const data = await res.json();
      if (fresh.length === 1) {
        // Single-ticker response is the object itself
        setAskAnalystData(prev => ({ ...prev, [fresh[0]]: data }));
      } else {
        // Batch response is { TICKER: {...}, ... }
        setAskAnalystData(prev => ({ ...prev, ...data }));
      }
    } catch { /* ignore */ }
  };

  // ── Fetch technicals for all watchlist tickers ───────────────────────────
  const fetchWatchTech = async () => {
    if (!watching.length) return;
    setLoadingWatchTech(true);
    const results: Record<string, StockTech> = {};
    await Promise.allSettled(
      watching.map(async (w) => {
        try {
          const res = await fetch(`/api/technicals?symbol=${w.ticker}`);
          if (res.ok) results[w.ticker] = await res.json();
        } catch { /* ignore */ }
      })
    );
    setWatchTech(prev => ({ ...prev, ...results }));
    setLoadingWatchTech(false);
    // Also refresh fundamentals for watchlist
    fetchAskAnalystBatch(watching.map(w => w.ticker));
  };

  // ── Fetch technicals for all holdings ──────────────────────────────────
  const fetchHoldingTech = useCallback(async () => {
    if (!holdings.length) return;
    const results: Record<string, StockTech> = {};
    await Promise.allSettled(
      holdings.map(async (h) => {
        try {
          const res = await fetch(`/api/technicals?symbol=${h.ticker}`);
          if (res.ok) results[h.ticker] = await res.json();
        } catch { /* ignore */ }
      })
    );
    setHoldingTech(prev => ({ ...prev, ...results }));
  }, [holdings]); // eslint-disable-line

  // Fetch fundamentals for scan result tickers whenever a new scan lands
  useEffect(() => {
    if (!scanResult?.signals.length) return;
    fetchAskAnalystBatch(scanResult.signals.map(s => s.ticker));
  }, [scanResult?.timestamp]); // eslint-disable-line

  // On first mount: load fundamentals for all existing watchlist + holdings tickers
  useEffect(() => {
    const all = [...new Set([
      ...watching.map(w => w.ticker),
      ...holdings.map(h => h.ticker),
    ])];
    if (all.length > 0) fetchAskAnalystBatch(all);
  }, []); // eslint-disable-line — intentional one-time load

  // Auto-fetch tech + fundamentals when tab changes
  const prevTabRef = useRef<string>("");
  useEffect(() => {
    if (tab === "holdings" && prevTabRef.current !== "holdings") {
      fetchHoldingTech();
      fetchAskAnalystBatch(holdings.map(h => h.ticker));
    }
    if (tab === "watching" && prevTabRef.current !== "watching") {
      fetchAskAnalystBatch(watching.map(w => w.ticker));
    }
    prevTabRef.current = tab;
  }, [tab]); // eslint-disable-line

  // ── Watchlist AI analysis (runs same two-pass pipeline on watchlist tickers) ──
  const runWatchlistAI = async () => {
    if (!watching.length) { return; }
    if (!settings.apiKey) { setShowSettings(true); return; }
    setRunningWatchAI(true); setWatchAIError("");
    try {
      const res = await fetch("/api/watchscan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: watching.map(w => w.ticker),
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const raw = data.error ?? "Watchlist AI scan failed";
        if (raw.includes("quota") || raw.includes("429")) throw new Error("API quota exceeded — check your provider.");
        if (raw.includes("401") || raw.includes("403") || raw.includes("API key")) throw new Error("Invalid API key — check Settings.");
        throw new Error(raw.length > 200 ? raw.slice(0, 200) + "…" : raw);
      }
      // Merge new AI signals into watchSignals
      const newSigs: Record<string, AISignal> = {};
      for (const sig of (data.signals ?? [])) newSigs[sig.ticker] = sig;
      setWatchSignals(prev => ({ ...prev, ...newSigs }));
      // Merge tech data into watchTech
      const newTech: Record<string, StockTech> = {};
      for (const t of (data.technicalData ?? [])) newTech[t.symbol] = t;
      setWatchTech(prev => ({ ...prev, ...newTech }));
    } catch (e) {
      setWatchAIError(e instanceof Error ? e.message : "AI analysis failed");
    } finally {
      setRunningWatchAI(false);
    }
  };

  // ── Sort helpers ────────────────────────────────────────────────────────
  const sortedOpps = (sigs: AISignal[]) => {
    const arr = [...sigs];
    if (sortOpps === "name") return arr.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return arr; // "confidence" — scanner already sorted by confidence desc
  };

  const sortedWatch = (items: typeof watching) => {
    const arr = [...items];
    if (sortWatch === "name") return arr.sort((a, b) => a.ticker.localeCompare(b.ticker));
    // "confidence" — AI confidence desc, tech score as fallback, unscored last
    return arr.sort((a, b) => {
      const activeSigA = scanResult?.signals.find(s => s.ticker === a.ticker) ?? watchSignals[a.ticker];
      const activeSigB = scanResult?.signals.find(s => s.ticker === b.ticker) ?? watchSignals[b.ticker];
      const confA = activeSigA ? activeSigA.confidence : (watchTech[a.ticker]?.compositeScore ?? -1);
      const confB = activeSigB ? activeSigB.confidence : (watchTech[b.ticker]?.compositeScore ?? -1);
      return confB - confA;
    });
  };

  // ── Holding suggestion from scan data or P&L ────────────────────────────
  const getHoldingSuggestion = (ticker: string, pnlPct: number | null) => {
    const aiSig = scanResult?.signals.find(s => s.ticker === ticker);
    if (aiSig) return { signal: aiSig.signal, text: aiSig.reason, source: "AI scan" };
    const tech = holdingTech[ticker] ?? watchTech[ticker];
    if (tech) return { signal: tech.technicalSignal, text: tech.reasons[0] ?? "Based on technicals", source: "Technicals" };
    if (pnlPct !== null) {
      if (pnlPct >= 20) return { signal: "HOLD", text: "Up 20%+ — consider booking partial profits", source: "P&L" };
      if (pnlPct >= 5)  return { signal: "HOLD", text: "In profit — hold and monitor for continuation", source: "P&L" };
      if (pnlPct >= -8) return { signal: "HOLD", text: "Near cost — hold and watch for a move", source: "P&L" };
      return { signal: "WATCH", text: "Down significantly — run a scan for full AI analysis", source: "P&L" };
    }
    return null;
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const hasKey = !!settings.apiKey;

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 13, minHeight: "100vh" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `0.5px solid ${C.border}`, position: "sticky", top: 0, background: C.bg, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.3 }}>PSX Scanner</span>
          {serverOnline === false && <span style={{ fontSize: 10, color: C.redText, background: C.redDim, padding: "2px 7px", borderRadius: 10 }}>offline</span>}
          {loadingPrices && !isMobile && <span style={{ fontSize: 10, color: C.muted }}>refreshing…</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10 }}>
          {!isMobile && <PKTClock />}
          <button onClick={fetchPrices} style={btnSt} title="Refresh prices">↻</button>
          <button
            onClick={exportForClaude}
            style={{ ...btnSt, fontSize: 10, padding: "4px 10px", borderColor: exportCopied ? C.green + "60" : C.blue + "60", color: exportCopied ? C.greenText : C.blueText }}
            title="Copy full snapshot for Claude"
          >
            {exportCopied ? "✓" : "⎘"}{!isMobile && (exportCopied ? " Copied!" : " Export")}
          </button>
          {!isMobile && (
            <button
              onClick={() => setShowMetricsGuide(true)}
              style={{ ...btnSt, fontSize: 10, padding: "4px 10px", borderColor: C.purple + "60", color: C.purpleText }}
              title="Metrics guide"
            >
              ? Guide
            </button>
          )}
          <button onClick={() => setShowSettings(true)} style={{ ...btnSt, color: hasKey ? C.greenText : C.amberText, borderColor: hasKey ? C.green + "60" : C.amber + "60" }}>
            ⚙{!isMobile && ` ${hasKey ? settings.provider : "Set API Key"}`}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", borderBottom: `0.5px solid ${C.border}`, padding: "0 16px" }}>
        {(["opportunities", "holdings", "watching"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 14px", fontSize: 11, fontWeight: 500, border: "none", background: "none", cursor: "pointer",
            color: tab === t ? C.text : C.muted,
            borderBottom: tab === t ? `2px solid ${C.green}` : "2px solid transparent",
            textTransform: "capitalize", letterSpacing: 0.3,
          }}>
            {t === "opportunities" ? (isMobile ? "Opps" : "Buy Opportunities") : t === "holdings" ? (isMobile ? "Holdings" : "My Holdings") : "Watchlist"}
            {t === "opportunities" && scanResult && (
              <span style={{ marginLeft: 6, fontSize: 9, background: C.greenDim, color: C.greenText, padding: "1px 5px", borderRadius: 8 }}>
                {scanResult.signals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

        {/* ── BUY OPPORTUNITIES TAB ── */}
        {tab === "opportunities" && (
          <div>
            {/* Scanner controls */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={runFullScan} disabled={scanning} style={{ ...accentBtn, padding: "6px 14px", fontSize: 11, fontWeight: 600 }}>
                {scanning ? `⟳ ${scanPhase || "Scanning…"}` : "↗ Full Scan · KMI-30 + News"}
              </button>
              <button onClick={runNewsRefresh} disabled={scanning} style={btnSt}>
                ↗ Refresh news only
              </button>
              {scanResult && (
                <span style={{ fontSize: 10, color: C.dim }}>
                  Last scan: {new Date(scanResult.timestamp).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })} PKT
                  · {scanResult.totalScanned} stocks scanned
                  · {scanResult.passedTechnicals} passed technicals
                  {scanResult.expandedSectors.length > 0 && ` · expanded: ${scanResult.expandedSectors.join(", ")}`}
                </span>
              )}
            </div>

            {scanError && (
              <div style={{ ...cardStyle, background: C.redDim, border: `0.5px solid ${C.red}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ color: C.redText, fontSize: 11, flex: 1, lineHeight: 1.5 }}>✗ {scanError}</span>
                <button onClick={() => setScanError("")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
              </div>
            )}

            {/* News context panel — hidden while scanning to avoid overlap with loader */}
            {scanResult?.newsAnalysis && !scanning && (
              <div style={{ ...cardStyle, marginBottom: 14 }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={s_label}>Macro Context · Today</span>
                  {scanResult.newsFromCache && (
                    <span style={{ fontSize: 8, color: C.dim, background: C.border2, padding: "1px 6px", borderRadius: 8 }}>
                      ✓ cached
                    </span>
                  )}
                </div>

                {/* AI summary */}
                <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: "0 0 8px" }}>
                  {scanResult.newsAnalysis.summary}
                </p>

                {/* Sector impact list */}
                {scanResult.newsAnalysis.affectedSectors.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {scanResult.newsAnalysis.affectedSectors.map((sec, i) => (
                      <div key={i} style={{ fontSize: 10, color: sec.impact === "POSITIVE" ? C.greenText : sec.impact === "NEGATIVE" ? C.redText : C.muted, marginBottom: 2 }}>
                        {sec.impact === "POSITIVE" ? "▲" : sec.impact === "NEGATIVE" ? "▼" : "–"} {sec.sectorName}: {sec.reason}
                      </div>
                    ))}
                  </div>
                )}

                {/* Global factor chips */}
                {scanResult.newsAnalysis.globalFactors.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                    {scanResult.newsAnalysis.globalFactors.map((f, i) => (
                      <span key={i} style={{ fontSize: 9, color: C.blueText, background: C.blueDim, padding: "2px 7px", borderRadius: 10 }}>{f}</span>
                    ))}
                  </div>
                )}

                {/* Expanded narrative */}
                {expandNewsPanel && (
                  <div style={{ marginTop: 8, paddingTop: 10, borderTop: `0.5px solid ${C.border}` }}>
                    <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.8, margin: "0 0 10px" }}>
                      {scanResult.newsAnalysis.detailedNarrative ?? buildExpandedNarrative(scanResult.newsAnalysis)}
                    </p>
                    {scanResult.newsSources.length > 0 && (
                      <div style={{ fontSize: 9, color: C.dim }}>
                        Sources: {scanResult.newsSources.join(" · ")}
                      </div>
                    )}
                  </div>
                )}

                {/* Expand / Collapse button — bottom right */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    onClick={() => setExpandNewsPanel(v => !v)}
                    style={{ ...btnSt, fontSize: 9, padding: "2px 9px" }}
                  >
                    {expandNewsPanel ? "▲ Less" : "▼ Read more"}
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!scanResult && !scanning && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>
                  {hasKey ? "Ready to scan KMI-30 + Shariah stocks" : "Set your API key to get started"}
                </div>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
                  {hasKey
                    ? "The scanner will fetch live prices, compute RSI/EMA/volume for all KMI-30 stocks,\nexpand into news-relevant sectors, and return the best 1-8 setups."
                    : "Click ⚙ in the top-right to add your Claude, Gemini, or OpenAI API key."}
                </div>
                {hasKey && (
                  <button onClick={runFullScan} style={{ ...accentBtn, marginTop: 16, padding: "8px 20px", fontSize: 12 }}>
                    ↗ Run First Scan
                  </button>
                )}
              </div>
            )}

            {/* Loading skeleton */}
            {scanning && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "30px 20px" }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>🔍</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{scanPhase}</div>
                <div style={{ fontSize: 10, color: C.dim }}>This takes 30–90 seconds — fetching RSS news, computing RSI/EMA/volume for 30+ stocks, then running AI analysis.</div>
              </div>
            )}

            {/* Sort control */}
            {scanResult && scanResult.signals.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 9, color: C.dim }}>Sort:</span>
                {(["confidence", "name"] as const).map(opt => (
                  <button key={opt} onClick={() => setSortOpps(opt)} style={{
                    ...btnSt, fontSize: 9, padding: "2px 9px",
                    background: sortOpps === opt ? C.border2 : "transparent",
                    color: sortOpps === opt ? C.text : C.muted,
                  }}>
                    {opt === "confidence" ? "AI Confidence" : "Name A–Z"}
                  </button>
                ))}
              </div>
            )}

            {/* Signal cards */}
            {scanResult && sortedOpps(scanResult.signals).map((sig, i) => {
              const sigTech = scanResult.technicalData?.find(t => t.symbol === sig.ticker);
              const liveQuote = prices[sig.ticker];
              // Fall back to EOD close from technicals if live price hasn't arrived yet
              const displayPrice = liveQuote?.currentPrice ?? sigTech?.currentPrice;
              const displayChange = liveQuote?.changePercent;
              return (
                <div key={sig.ticker} style={{ ...cardStyle }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{sig.ticker}</span>
                        <Pill signal={sig.signal} onClick={() => setSignalDetail({ ticker: sig.ticker, signal: sig.signal, confidence: sig.confidence, reason: sig.reason, newsHeadline: sig.newsHeadline, catalysts: sig.catalysts, risks: sig.risks, suggestedEntry: sig.suggestedEntry, tech: sigTech, fundamentals: askAnalystData[sig.ticker], currentPrice: displayPrice, changePercent: displayChange })} />
                        <span style={{ fontSize: 10, color: C.dim }}>#{i + 1}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>{sig.reason}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      {displayPrice && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>PKR {displayPrice.toFixed(2)}</span>
                          {displayChange !== undefined && (
                            <span style={{ fontSize: 10, color: displayChange >= 0 ? C.greenText : C.redText }}>
                              {displayChange >= 0 ? "+" : ""}{displayChange.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      )}
                      {sig.suggestedEntry && (
                        <span style={{ fontSize: 10, color: C.amberText, background: C.amberDim, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
                          Entry: {sig.suggestedEntry}
                        </span>
                      )}
                    </div>
                  </div>

                  {sig.newsHeadline && sig.newsHeadline !== "No recent news" && (
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 6, fontStyle: "italic" }}>
                      📰 {sig.newsHeadline}
                    </div>
                  )}

                  <ConfBar pct={sig.confidence} signal={sig.signal} />

                  {!isMobile && (sig.catalysts?.length > 0 || sig.risks?.length > 0) && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                      {sig.catalysts?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: C.greenText, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>Catalysts</div>
                          {sig.catalysts.map((c, j) => (
                            <div key={j} style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>▲ {c}</div>
                          ))}
                        </div>
                      )}
                      {sig.risks?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: C.redText, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>Risks</div>
                          {sig.risks.map((r, j) => (
                            <div key={j} style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>▼ {r}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Technical indicators row (same as watchlist) */}
                  {sigTech && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${C.border}` }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {([
                          ["RSI", sigTech.rsi.toFixed(0), sigTech.rsi < 30 ? C.greenText : sigTech.rsi > 70 ? C.redText : C.muted],
                          ...(!isMobile ? [["EMA20", sigTech.ema20.toFixed(2), C.muted] as [string,string,string]] : []),
                          ...(!isMobile ? [["EMA50", sigTech.ema50.toFixed(2), C.muted] as [string,string,string]] : []),
                          ["Vol", volLabel(sigTech, prices[sig.ticker]?.volume), sigTech.volumeRatio >= 1.5 ? C.greenText : C.muted],
                          ["Score", `${sigTech.compositeScore}/100`, sigTech.compositeScore >= 60 ? C.greenText : sigTech.compositeScore >= 40 ? C.amberText : C.redText],
                        ] as [string, string, string][]).map(([lbl, val, col]) => (
                          <div key={lbl} style={{ background: "#111", borderRadius: 4, padding: "3px 7px", display: "flex", gap: 4, alignItems: "center" }}>
                            <span style={{ fontSize: 8, color: C.dim }}>{lbl}</span>
                            <span style={{ fontSize: 10, fontWeight: 500, color: col }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fundamentals row (AskAnalyst) — toggled on mobile */}
                  {isMobile ? (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => toggleFunds(sig.ticker)} style={{ ...btnSt, fontSize: 9, padding: "3px 9px" }}>
                        {showFunds.has(sig.ticker) ? "▲ Hide Fundamentals" : "▼ Fundamentals"}
                      </button>
                      {showFunds.has(sig.ticker) && <FundamentalsRow f={askAnalystData[sig.ticker]} />}
                    </div>
                  ) : (
                    <FundamentalsRow f={askAnalystData[sig.ticker]} />
                  )}

                  {/* Add to watchlist */}
                  <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                    {watching.find(w => w.ticker === sig.ticker) ? (
                      <span style={{ fontSize: 9, color: C.greenText }}>✓ In Watchlist</span>
                    ) : (
                      <button onClick={() => quickAddWatch(sig.ticker)} style={{ ...btnSt, fontSize: 9, padding: "3px 10px", borderColor: C.blue + "50", color: C.blueText }}>
                        + Add to Watchlist
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Disclaimer */}
            <div style={{ fontSize: 9, color: C.dim, textAlign: "center", padding: "12px 0", lineHeight: 1.6 }}>
              ⚠ Not financial advice. Signals are AI-generated for informational purposes only.<br />
              Always do your own research. Past signals do not guarantee future returns.
            </div>
          </div>
        )}

        {/* ── HOLDINGS TAB ── */}
        {tab === "holdings" && (
          <div>
            {/* Holdings overview: donut + portfolio table */}
            {holdings.length > 0 && (
              <HoldingsOverview holdings={holdings} prices={prices} isMobile={isMobile} />
            )}
            <div style={{ ...s_label, marginBottom: 10 }}>My Holdings</div>
            {holdings.map(h => {
              const p = prices[h.ticker];
              const livePrice = p?.currentPrice;
              const cost = h.avgPrice * h.shares;
              const marketVal = livePrice ? livePrice * h.shares : null;
              const pnl = marketVal ? marketVal - cost : null;
              const pnlPct = pnl ? (pnl / cost) * 100 : null;
              const tech = holdingTech[h.ticker];
              const isEditing = editingHolding?.ticker === h.ticker;
              return (
                <div key={h.ticker} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{h.ticker}</span>
                        {h.shariah && <span style={{ fontSize: 9, color: C.greenText, background: C.greenDim, padding: "1px 5px", borderRadius: 3 }}>Shariah ✓</span>}
                        {tech && <Pill signal={tech.technicalSignal} small onClick={() => setSignalDetail({ ticker: h.ticker, signal: tech.technicalSignal, confidence: tech.compositeScore, reason: tech.reasons[0], catalysts: techCatalysts(tech), risks: techRisks(tech), tech, fundamentals: askAnalystData[h.ticker], currentPrice: livePrice ?? undefined, changePercent: p?.changePercent ?? undefined })} />}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted }}>{h.name}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {livePrice && <span style={{ fontSize: 13, fontWeight: 500 }}>PKR {livePrice.toFixed(2)}</span>}
                      {p?.changePercent !== undefined && (
                        <span style={{ fontSize: 10, color: p.changePercent >= 0 ? C.greenText : C.redText }}>
                          {p.changePercent >= 0 ? "+" : ""}{p.changePercent.toFixed(2)}%
                        </span>
                      )}
                      {/* Edit button */}
                      {!isEditing && pendingDeleteHolding !== h.ticker && (
                        <button
                          onClick={() => setEditingHolding({ ticker: h.ticker, shares: String(h.shares), avg: String(h.avgPrice) })}
                          style={{ ...btnSt, padding: "0 7px", fontSize: 11, color: C.dim }}
                          title="Edit shares / avg price">✎</button>
                      )}
                      {pendingDeleteHolding === h.ticker ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <button
                            onClick={() => { setHoldings(prev => prev.filter(x => x.ticker !== h.ticker)); setPendingDeleteHolding(null); }}
                            style={{ ...btnSt, fontSize: 9, padding: "2px 9px", borderColor: C.red + "99", color: C.redText, fontWeight: 600 }}>
                            Remove
                          </button>
                          <button onClick={() => setPendingDeleteHolding(null)}
                            style={{ ...btnSt, fontSize: 9, padding: "2px 9px" }}>
                            Keep
                          </button>
                        </div>
                      ) : (
                        !isEditing && (
                          <button onClick={() => setPendingDeleteHolding(h.ticker)}
                            style={{ ...btnSt, padding: "0 6px", fontSize: 15, color: C.dim }}>×</button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {isEditing ? (
                    <div style={{ background: "#0d0d0d", borderRadius: 6, padding: "10px 12px", marginBottom: 4 }}>
                      <div style={{ fontSize: 9, color: C.dim, marginBottom: 8 }}>Edit {h.ticker}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ fontSize: 8, color: C.dim }}>Shares</span>
                          <input
                            style={{ ...inputSt, width: 80 }}
                            type="text" inputMode="decimal"
                            value={editingHolding!.shares}
                            onChange={e => setEditingHolding(prev => prev ? { ...prev, shares: e.target.value.replace(/[^0-9.]/g, "") } : null)}
                          />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ fontSize: 8, color: C.dim }}>Avg Price (PKR)</span>
                          <input
                            style={{ ...inputSt, width: 90 }}
                            type="text" inputMode="decimal"
                            value={editingHolding!.avg}
                            onChange={e => setEditingHolding(prev => prev ? { ...prev, avg: e.target.value.replace(/[^0-9.]/g, "") } : null)}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", paddingBottom: 1 }}>
                          <button
                            onClick={() => {
                              const newShares = parseFloat(editingHolding!.shares);
                              const newAvg    = parseFloat(editingHolding!.avg);
                              if (!newShares || newShares <= 0 || !newAvg || newAvg <= 0) return;
                              setHoldings(prev => prev.map(x =>
                                x.ticker === h.ticker ? { ...x, shares: newShares, avgPrice: newAvg } : x
                              ));
                              setEditingHolding(null);
                            }}
                            style={{ ...accentBtn, fontSize: 10, padding: "4px 12px" }}>
                            Save
                          </button>
                          <button onClick={() => setEditingHolding(null)} style={{ ...btnSt, fontSize: 10 }}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                  /* P&L grid */
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {[
                      ["Shares", h.shares.toLocaleString()],
                      ["Avg cost", `PKR ${h.avgPrice.toFixed(2)}`],
                      ["Cost basis", `PKR ${Math.round(cost).toLocaleString()}`],
                      ["Market value", marketVal ? `PKR ${Math.round(marketVal).toLocaleString()}` : "—"],
                      ["P&L", pnl !== null ? `${pnl >= 0 ? "+" : ""}PKR ${Math.round(pnl).toLocaleString()}` : "—"],
                      ["P&L %", pnlPct !== null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%` : "—"],
                    ].map(([label, val], i) => (
                      <div key={i} style={{ background: "#111", borderRadius: 5, padding: "5px 7px" }}>
                        <div style={{ fontSize: 9, color: C.dim, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: label.includes("P&L") && pnl !== null ? (pnl >= 0 ? C.greenText : C.redText) : C.text }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  )}

                  {/* Technical indicators row */}
                  {tech && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${C.border}` }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {([
                          ["RSI", tech.rsi.toFixed(0), tech.rsi < 30 ? C.greenText : tech.rsi > 70 ? C.redText : C.muted],
                          ...(!isMobile ? [["EMA20", tech.ema20.toFixed(2), C.muted] as [string,string,string]] : []),
                          ...(!isMobile ? [["EMA50", tech.ema50.toFixed(2), C.muted] as [string,string,string]] : []),
                          ["Vol", volLabel(tech, prices[h.ticker]?.volume), tech.volumeRatio >= 1.5 ? C.greenText : C.muted],
                          ["Score", `${tech.compositeScore}/100`, tech.compositeScore >= 60 ? C.greenText : tech.compositeScore >= 40 ? C.amberText : C.redText],
                        ] as [string, string, string][]).map(([lbl, val, col]) => (
                          <div key={lbl} style={{ background: "#111", borderRadius: 4, padding: "3px 7px", display: "flex", gap: 4, alignItems: "center" }}>
                            <span style={{ fontSize: 8, color: C.dim }}>{lbl}</span>
                            <span style={{ fontSize: 10, fontWeight: 500, color: col }}>{val}</span>
                          </div>
                        ))}
                      </div>
                      {tech.reasons?.[0] && (
                        <div style={{ fontSize: 9, color: C.muted, marginTop: 5 }}>▲ {tech.reasons[0]}</div>
                      )}
                    </div>
                  )}

                  {/* Fundamentals row — toggled on mobile */}
                  {isMobile ? (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => toggleFunds(h.ticker)} style={{ ...btnSt, fontSize: 9, padding: "3px 9px" }}>
                        {showFunds.has(h.ticker) ? "▲ Hide Fundamentals" : "▼ Fundamentals"}
                      </button>
                      {showFunds.has(h.ticker) && <FundamentalsRow f={askAnalystData[h.ticker]} />}
                    </div>
                  ) : (
                    <FundamentalsRow f={askAnalystData[h.ticker]} />
                  )}

                  {/* AI suggestion */}
                  {(() => {
                    const s = getHoldingSuggestion(h.ticker, pnlPct);
                    if (!s) return (
                      <div style={{ marginTop: 8, fontSize: 9, color: C.dim, fontStyle: "italic" }}>
                        Run a full scan or load signals to get AI advice for this holding.
                      </div>
                    );
                    const col = s.signal === "BUY" || s.signal === "STRONG_BUY" ? C.greenText
                              : s.signal === "SELL" || s.signal === "AVOID" ? C.redText
                              : s.signal === "HOLD" ? C.amberText : C.blueText;
                    const bg  = s.signal === "BUY" || s.signal === "STRONG_BUY" ? C.greenDim
                              : s.signal === "SELL" || s.signal === "AVOID" ? C.redDim
                              : s.signal === "HOLD" ? C.amberDim : C.blueDim;
                    const aiSig = scanResult?.signals.find(sig => sig.ticker === h.ticker);
                    return (
                      <div onClick={() => setSignalDetail({ ticker: h.ticker, signal: s.signal, confidence: aiSig?.confidence ?? tech?.compositeScore, reason: s.text, newsHeadline: aiSig?.newsHeadline, catalysts: aiSig?.catalysts ?? (tech ? techCatalysts(tech) : []), risks: aiSig?.risks ?? (tech ? techRisks(tech) : []), suggestedEntry: aiSig?.suggestedEntry, tech: tech ?? undefined, fundamentals: askAnalystData[h.ticker], currentPrice: livePrice ?? undefined, changePercent: p?.changePercent ?? undefined })} style={{ marginTop: 8, background: bg, borderRadius: 6, padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                          {s.signal}
                        </span>
                        <span style={{ fontSize: 10, color: col, flex: 1 }}>{s.text}</span>
                        <span style={{ fontSize: 8, color: C.dim, whiteSpace: "nowrap" }}>{s.source} ↗</span>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            {holdingError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: C.redDim, border: `0.5px solid ${C.red}`, borderRadius: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, color: C.redText, flex: 1 }}>✗ {holdingError}</span>
                <button onClick={() => setHoldingError("")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input style={{ ...inputSt, width: 60 }} placeholder="Ticker" value={newHolding.ticker} onChange={e => setNewHolding(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} onKeyDown={e => e.key === "Enter" && addHolding()} />
              <input style={{ ...inputSt, width: 70 }} placeholder="Shares" type="text" inputMode="decimal" value={newHolding.shares} onChange={e => setNewHolding(p => ({ ...p, shares: e.target.value.replace(/[^0-9.]/g, "") }))} />
              <input style={{ ...inputSt, width: 70 }} placeholder="Avg PKR" type="text" inputMode="decimal" value={newHolding.avg} onChange={e => setNewHolding(p => ({ ...p, avg: e.target.value.replace(/[^0-9.]/g, "") }))} />
              <button onClick={addHolding} disabled={addingHolding} style={{ ...btnSt, opacity: addingHolding ? 0.5 : 1 }}>
                {addingHolding ? "…" : "Add"}
              </button>
            </div>
          </div>
        )}

        {/* ── WATCHLIST TAB ── */}
        {tab === "watching" && (
          <div>
            {/* Header row: label + action buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
              <span style={s_label}>Watchlist · KMI-30 / Shariah tickers</span>
              {watching.length > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={async () => { await fetchWatchTech(); fetchPrices(); }}
                    disabled={loadingWatchTech || runningWatchAI}
                    style={{ ...btnSt, fontSize: 9, padding: "3px 10px" }}
                    title="Refresh technicals and prices for all watchlist tickers"
                  >
                    {loadingWatchTech ? "↻ Refreshing…" : "↻ Refresh"}
                  </button>
                  <button
                    onClick={runWatchlistAI}
                    disabled={runningWatchAI || loadingWatchTech || !settings.apiKey}
                    style={{ ...accentBtn, fontSize: 9, padding: "3px 10px", opacity: (runningWatchAI || !settings.apiKey) ? 0.5 : 1 }}
                    title={!settings.apiKey ? "Set your API key in Settings first" : "Run AI analysis on your watchlist using the same pipeline as Buy Opportunities"}
                  >
                    {runningWatchAI ? "⟳ Analysing…" : "✦ AI Analysis"}
                  </button>
                </div>
              )}
            </div>

            {/* Sort controls */}
            {watching.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 9, color: C.dim }}>Sort:</span>
                {(["confidence", "name"] as const).map(opt => (
                  <button key={opt} onClick={() => setSortWatch(opt)} style={{
                    ...btnSt, fontSize: 9, padding: "2px 9px",
                    background: sortWatch === opt ? C.border2 : "transparent",
                    color: sortWatch === opt ? C.text : C.muted,
                  }}>
                    {opt === "confidence" ? "AI Confidence ↓" : "Name A–Z"}
                  </button>
                ))}
              </div>
            )}

            {/* AI Analysis error */}
            {watchAIError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: C.redDim, border: `0.5px solid ${C.red}`, borderRadius: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: C.redText, flex: 1 }}>✗ {watchAIError}</span>
                <button onClick={() => setWatchAIError("")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            )}
            {watching.length === 0 && (
              <div style={{ color: C.dim, fontSize: 11, padding: "20px 0" }}>Add tickers below to track them.</div>
            )}
            {sortedWatch(watching).map(w => {
              const p = prices[w.ticker];
              const sig = watchSignals[w.ticker];
              const tech = watchTech[w.ticker];
              const scanSig = scanResult?.signals.find(s => s.ticker === w.ticker);
              // AI signal from scan takes priority; fall back to watchSignals
              const activeSig = scanSig ?? sig;

              // When no AI signal, synthesise display data from tech indicators
              const displayReason   = activeSig ? activeSig.reason
                                    : tech       ? (tech.reasons[0] ?? "Technical analysis")
                                    : null;
              const displayCats     = activeSig?.catalysts?.length ? activeSig.catalysts
                                    : tech ? techCatalysts(tech) : [];
              const displayRisks    = activeSig?.risks?.length ? activeSig.risks
                                    : tech ? techRisks(tech) : [];
              const displayConfPct  = activeSig ? activeSig.confidence
                                    : tech ? tech.compositeScore : null;
              const displaySignal   = activeSig ? activeSig.signal
                                    : tech ? tech.technicalSignal : null;
              const confLabel       = activeSig ? "AI confidence" : "Technical score";
              const hasContent      = displayReason !== null;

              return (
                <div key={w.ticker} style={{ ...cardStyle }}>
                  {/* ── Header ── */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{w.ticker}</span>
                      {displaySignal && <Pill signal={displaySignal} onClick={() => setSignalDetail({ ticker: w.ticker, signal: displaySignal, confidence: displayConfPct ?? undefined, reason: displayReason ?? undefined, newsHeadline: activeSig?.newsHeadline, catalysts: displayCats, risks: displayRisks, suggestedEntry: activeSig?.suggestedEntry, tech: tech, fundamentals: askAnalystData[w.ticker], currentPrice: p?.currentPrice, changePercent: p?.changePercent })} />}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {p && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>PKR {p.currentPrice.toFixed(2)}</span>
                          {p.changePercent !== undefined && (
                            <span style={{ fontSize: 10, color: p.changePercent >= 0 ? C.greenText : C.redText }}>
                              {p.changePercent >= 0 ? "+" : ""}{p.changePercent.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      )}
                      {/* Two-step delete */}
                      {pendingDeleteWatch === w.ticker ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <button
                            onClick={() => { setWatching(prev => prev.filter(x => x.ticker !== w.ticker)); setPendingDeleteWatch(null); }}
                            style={{ ...btnSt, fontSize: 9, padding: "2px 9px", borderColor: C.red + "99", color: C.redText, fontWeight: 600 }}>
                            Remove
                          </button>
                          <button onClick={() => setPendingDeleteWatch(null)}
                            style={{ ...btnSt, fontSize: 9, padding: "2px 9px" }}>
                            Keep
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setPendingDeleteWatch(w.ticker)}
                          style={{ ...btnSt, padding: "0 6px", fontSize: 15, color: C.dim }}>×</button>
                      )}
                    </div>
                  </div>

                  {/* ── Signal body (AI or synthesised from tech) ── */}
                  {hasContent && (
                    <>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{displayReason}</div>
                      {activeSig?.newsHeadline && activeSig.newsHeadline !== "No recent news" && (
                        <div style={{ fontSize: 10, color: C.dim, marginBottom: 6, fontStyle: "italic" }}>
                          📰 {activeSig.newsHeadline}
                        </div>
                      )}
                      {displayConfPct !== null && (
                        <ConfBar pct={displayConfPct} signal={displaySignal ?? undefined} label={confLabel} />
                      )}
                      {(displayCats.length > 0 || displayRisks.length > 0) && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                          {displayCats.length > 0 && (
                            <div>
                              <div style={{ fontSize: 9, color: C.greenText, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>Catalysts</div>
                              {displayCats.map((c, j) => (
                                <div key={j} style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>▲ {c}</div>
                              ))}
                            </div>
                          )}
                          {displayRisks.length > 0 && (
                            <div>
                              <div style={{ fontSize: 9, color: C.redText, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>Risks</div>
                              {displayRisks.map((r, j) => (
                                <div key={j} style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>▼ {r}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Technical indicators row — always at the bottom when loaded ── */}
                  {tech && (
                    <div style={{ marginTop: hasContent ? 12 : 0, paddingTop: hasContent ? 10 : 0, borderTop: hasContent ? `0.5px solid ${C.border}` : "none" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {([
                          ["RSI", tech.rsi.toFixed(0), tech.rsi < 30 ? C.greenText : tech.rsi > 70 ? C.redText : C.muted],
                          ...(!isMobile ? [["EMA20", tech.ema20.toFixed(2), C.muted] as [string,string,string]] : []),
                          ...(!isMobile ? [["EMA50", tech.ema50.toFixed(2), C.muted] as [string,string,string]] : []),
                          ["Vol", volLabel(tech, prices[w.ticker]?.volume), tech.volumeRatio >= 1.5 ? C.greenText : C.muted],
                          ["Score", `${tech.compositeScore}/100`, tech.compositeScore >= 60 ? C.greenText : tech.compositeScore >= 40 ? C.amberText : C.redText],
                        ] as [string, string, string][]).map(([lbl, val, col]) => (
                          <div key={lbl} style={{ background: "#111", borderRadius: 4, padding: "3px 7px", display: "flex", gap: 4, alignItems: "center" }}>
                            <span style={{ fontSize: 8, color: C.dim }}>{lbl}</span>
                            <span style={{ fontSize: 10, fontWeight: 500, color: col }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Fundamentals row — toggled on mobile ── */}
                  {isMobile ? (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => toggleFunds(w.ticker)} style={{ ...btnSt, fontSize: 9, padding: "3px 9px" }}>
                        {showFunds.has(w.ticker) ? "▲ Hide Fundamentals" : "▼ Fundamentals"}
                      </button>
                      {showFunds.has(w.ticker) && <FundamentalsRow f={askAnalystData[w.ticker]} />}
                    </div>
                  ) : (
                    <FundamentalsRow f={askAnalystData[w.ticker]} />
                  )}

                  {/* ── Prompt when nothing loaded yet ── */}
                  {!tech && !activeSig && (
                    <div style={{ fontSize: 9, color: C.dim, fontStyle: "italic" }}>
                      Technicals loading… or click "↻ Refresh" to retry, "✦ AI Analysis" for full AI signals.
                    </div>
                  )}
                </div>
              );
            })}
            {watchError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: C.redDim, border: `0.5px solid ${C.red}`, borderRadius: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: C.redText, flex: 1 }}>✗ {watchError}</span>
                <button onClick={() => setWatchError("")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input style={inputSt} placeholder="e.g. PPL" value={newWatch} onChange={e => setNewWatch(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && addWatch()} />
              <button onClick={addWatch} disabled={addingWatch} style={{ ...btnSt, opacity: addingWatch ? 0.5 : 1 }}>
                {addingWatch ? "…" : "Add"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `0.5px solid ${C.border}`, padding: "6px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: C.dim }}>
        <span>{lastUpdated ? `Prices updated ${lastUpdated}` : "Connecting to PSX…"}</span>
        <span>PSX Scanner · Not financial advice</span>
      </div>

      <Settings open={showSettings} onClose={() => setShowSettings(false)} onSave={s => { setSettings(s); setShowSettings(false); }} />
      <MetricsGuide open={showMetricsGuide} onClose={() => setShowMetricsGuide(false)} />
      {signalDetail && <SignalDetailModal data={signalDetail} onClose={() => setSignalDetail(null)} />}
    </div>
  );
}
