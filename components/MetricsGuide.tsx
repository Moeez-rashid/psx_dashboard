"use client";
import { Modal, ModalHeader } from "./ui/primitives";

interface Band { range: string; label: string; tone: string; }
interface Metric { name: string; full: string; desc: string; bands: Band[]; }

const UP = "text-up-2", DOWN = "text-down-2", GOLD = "text-gold-2", MUTED = "text-ink-2";

const TECH_GUIDE: Metric[] = [
  {
    name: "RSI", full: "Relative Strength Index",
    desc: "Momentum oscillator measuring speed and size of recent price moves (0–100). Read it together with the trend: the same RSI means opposite things in an uptrend and a downtrend, and the Technical Score treats it that way.",
    bands: [
      { range: "< 30 in uptrend",   label: "Deep dip — sharp, watch for a trend break", tone: GOLD },
      { range: "< 30 in downtrend", label: "Falling knife — no trend support", tone: DOWN },
      { range: "30–40 in uptrend",  label: "Pullback — best risk/reward", tone: UP },
      { range: "40–55",             label: "Healthy momentum with room to run", tone: UP },
      { range: "55–70",             label: "Firm, approaching overbought", tone: MUTED },
      { range: "> 72",              label: "Overbought — poor entry", tone: DOWN },
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
    name: "Vol", full: "Volume Ratio (today vs prior 20 sessions)",
    desc: "Today's traded volume against the average of the 20 sessions before it — today is excluded from its own average, so a spike is not diluted by itself. Heavy volume on a down day counts as distribution, not accumulation.",
    bands: [
      { range: "> 4.0×",   label: "Extreme one-off spike — treated cautiously", tone: GOLD },
      { range: "1.8–4.0×", label: "Strong participation", tone: UP },
      { range: "1.2–1.8×", label: "Above-normal activity", tone: UP },
      { range: "0.9–1.2×", label: "Normal participation", tone: MUTED },
      { range: "< 0.9×",   label: "Thin trade — weak conviction", tone: DOWN },
    ],
  },
  {
    name: "Tech score", full: "Technical Score (0–100)",
    desc: "A deterministic screening score computed only from price, trend, momentum and volume — no AI, news or fundamentals are involved, so it never changes with your AI provider. Trend structure 35 · Momentum 25 · Volume 20 · Entry quality 20. It ranks the technical quality of a setup; it is NOT a probability of profit.",
    bands: [
      { range: "78–100", label: "STRONG BUY — strong across every component", tone: UP },
      { range: "60–77",  label: "BUY — technically sound", tone: UP },
      { range: "40–59",  label: "NEUTRAL — watch closely", tone: GOLD },
      { range: "0–39",   label: "AVOID — weak technical setup", tone: DOWN },
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
    name: "ROE", full: "Return on Equity",
    desc: "Annual net profit as a percentage of shareholders' equity — how efficiently the company turns capital into profit.",
    bands: [
      { range: "> 20%",  label: "Excellent — highly profitable business", tone: UP },
      { range: "15–20%", label: "Strong returns on capital", tone: UP },
      { range: "8–15%",  label: "Average — acceptable for PSX", tone: MUTED },
      { range: "< 8%",   label: "Weak — capital working inefficiently", tone: DOWN },
    ],
  },
  {
    name: "D/E", full: "Debt-to-Equity Ratio",
    desc: "Total debt relative to shareholders' equity. Shows how leveraged the company is. (Not reported for banks.)",
    bands: [
      { range: "< 0.5×",  label: "Conservative — low financial risk", tone: UP },
      { range: "0.5–1.5×", label: "Moderate leverage — typical", tone: MUTED },
      { range: "> 1.5×",  label: "High leverage — sensitive to rates", tone: DOWN },
    ],
  },
  {
    name: "Div %", full: "Dividend Yield",
    desc: "Annual cash dividend as a percentage of the share price. Income return on your investment.",
    bands: [
      { range: "0%",   label: "No dividend — profits reinvested in growth", tone: MUTED },
      { range: "1–3%", label: "Low yield — growth-oriented stock", tone: MUTED },
      { range: "3–5%", label: "Good yield — typical for PSX blue chips", tone: UP },
      { range: "> 5%", label: "High yield — income stock or price has fallen", tone: UP },
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
