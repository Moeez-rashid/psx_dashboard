"use client";
import { Modal, ModalHeader } from "./ui/primitives";

interface Band { range: string; label: string; tone: string; }
interface Metric { name: string; full: string; desc: string; bands: Band[]; }

const UP = "text-up-2", DOWN = "text-down-2", GOLD = "text-gold-2", MUTED = "text-ink-2";

const TECH_GUIDE: Metric[] = [
  {
    name: "RSI", full: "Relative Strength Index",
    desc: "Momentum oscillator measuring speed and size of recent price moves. Scale: 0–100.",
    bands: [
      { range: "< 30",  label: "Deeply oversold — reversal zone", tone: UP },
      { range: "30–45", label: "Oversold — good entry territory", tone: UP },
      { range: "45–60", label: "Neutral — room to run", tone: MUTED },
      { range: "60–70", label: "Approaching overbought", tone: GOLD },
      { range: "> 70",  label: "Overbought — avoid chasing", tone: DOWN },
    ],
  },
  {
    name: "EMA20 / EMA50", full: "Exponential Moving Averages",
    desc: "Trend-following lines that weight recent prices more heavily. EMA20 = short-term (4 wks), EMA50 = medium-term (10 wks).",
    bands: [
      { range: "Price > both",  label: "Strong uptrend — most bullish", tone: UP },
      { range: "Price > EMA20", label: "Short-term bullish", tone: UP },
      { range: "Price < both",  label: "Downtrend — avoid or wait", tone: DOWN },
      { range: "Golden cross",  label: "EMA20 crosses above EMA50 — buy signal", tone: UP },
      { range: "Death cross",   label: "EMA20 crosses below EMA50 — sell signal", tone: DOWN },
    ],
  },
  {
    name: "Vol", full: "Volume Ratio (today vs 20-day avg)",
    desc: "Compares today's traded volume to the 20-day average. High volume on a price move confirms conviction.",
    bands: [
      { range: "> 2.0×",   label: "Strong buying interest — high conviction", tone: UP },
      { range: "1.3–2.0×", label: "Above-average activity", tone: UP },
      { range: "0.8–1.3×", label: "Normal participation", tone: MUTED },
      { range: "< 0.8×",   label: "Thin market — weak conviction", tone: DOWN },
    ],
  },
  {
    name: "Score", full: "Composite Technical Score",
    desc: "Weighted combination of RSI (30 pts), EMA trend (25 pts), EMA crossover (25 pts), and volume (20 pts).",
    bands: [
      { range: "75–100", label: "STRONG BUY", tone: UP },
      { range: "50–74",  label: "BUY — technically sound", tone: UP },
      { range: "30–49",  label: "NEUTRAL — watch closely", tone: GOLD },
      { range: "0–29",   label: "AVOID — weak technical setup", tone: DOWN },
    ],
  },
];

const FUND_GUIDE: Metric[] = [
  {
    name: "P/E", full: "Price-to-Earnings Ratio",
    desc: "How many rupees you pay for every PKR 1 of annual profit. PSX market average is typically 8–12×.",
    bands: [
      { range: "< 8×",     label: "Potentially undervalued — cheap", tone: UP },
      { range: "8–15×",    label: "Fair value range for PSX", tone: MUTED },
      { range: "15–20×",   label: "Slightly premium — growth priced in", tone: GOLD },
      { range: "> 20×",    label: "Expensive — high expectations baked in", tone: DOWN },
      { range: "Negative", label: "Loss-making company this year", tone: DOWN },
    ],
  },
  {
    name: "PBV", full: "Price-to-Book Value",
    desc: "Price vs the company's net assets per share. A value of 1× means you pay exactly what the assets are worth.",
    bands: [
      { range: "< 1×", label: "Trading below net assets — deep value (or distressed)", tone: UP },
      { range: "1–2×", label: "Reasonable valuation", tone: MUTED },
      { range: "2–3×", label: "Moderate premium — quality company", tone: GOLD },
      { range: "> 3×", label: "High premium — must justify with strong ROE", tone: DOWN },
    ],
  },
  {
    name: "Div %", full: "Dividend Yield",
    desc: "Annual cash dividend paid to shareholders as a percentage of the current share price. Income return on your investment.",
    bands: [
      { range: "0%",   label: "No dividend — profits reinvested in growth", tone: MUTED },
      { range: "1–3%", label: "Low yield — growth-oriented stock", tone: MUTED },
      { range: "3–6%", label: "Good yield — typical for PSX blue chips", tone: UP },
      { range: "> 6%", label: "High yield — income stock or price has fallen", tone: UP },
    ],
  },
  {
    name: "1M / 1Y", full: "Periodic Price Returns",
    desc: "Actual price change over the last 1 month and 1 year, shown as a percentage. Reflects momentum and long-term trend.",
    bands: [
      { range: "1Y > +20%",   label: "Strong long-term momentum", tone: UP },
      { range: "1Y 0–20%",    label: "Positive but moderate trend", tone: UP },
      { range: "1Y negative", label: "Underperformed — check why", tone: DOWN },
    ],
  },
  {
    name: "52W Bar", full: "52-Week Price Position",
    desc: "Where the current price sits within the stock's 52-week high-low range. Shows if the stock is near a yearly high or low.",
    bands: [
      { range: "0–30%",   label: "Near 52-week low — beaten down, possible value entry", tone: DOWN },
      { range: "30–70%",  label: "Mid-range — balanced momentum", tone: GOLD },
      { range: "70–100%", label: "Near 52-week high — strong momentum, watch resistance", tone: UP },
    ],
  },
  {
    name: "MCap", full: "Market Capitalisation",
    desc: "Total value of all outstanding shares (shares × price). Indicates company size and liquidity.",
    bands: [
      { range: "> 100B",  label: "Large cap — highly liquid, lower risk", tone: UP },
      { range: "10–100B", label: "Mid cap — good balance of growth & size", tone: MUTED },
      { range: "1–10B",   label: "Small cap — higher potential, more risk", tone: GOLD },
      { range: "< 1B",    label: "Micro cap — illiquid, speculative", tone: DOWN },
    ],
  },
];

function MetricColumn({ title, metrics }: { title: string; metrics: Metric[] }) {
  return (
    <div>
      <div className="label pb-2 mb-3 border-b border-line">{title}</div>
      {metrics.map(m => (
        <div key={m.name} className="mb-4">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-xs font-semibold text-ink">{m.name}</span>
            <span className="text-[10px] text-ink-3">{m.full}</span>
          </div>
          <p className="text-[11px] text-ink-2 leading-relaxed mb-1.5">{m.desc}</p>
          {m.bands.map((b, i) => (
            <div key={i} className="flex gap-2.5 items-start mb-0.5">
              <span className="text-[10px] text-ink-3 num min-w-[64px] shrink-0">{b.range}</span>
              <span className={`text-[10px] leading-snug ${b.tone}`}>{b.label}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function MetricsGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      <ModalHeader title="Metrics Guide" sub="What each indicator measures and how to read it" onClose={onClose} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <MetricColumn title="Technical Indicators" metrics={TECH_GUIDE} />
        <MetricColumn title="Fundamental Indicators" metrics={FUND_GUIDE} />
      </div>
      <div className="mt-4 pt-3 border-t border-line text-[10px] text-ink-3">
        Technical data computed from PSX price history · Fundamental data sourced from askanalyst.com.pk · Not financial advice
      </div>
    </Modal>
  );
}
