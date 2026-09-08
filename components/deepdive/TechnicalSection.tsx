import { Activity, ChartNoAxesColumn } from "lucide-react";
import type { DeepDiveTechnical } from "@/lib/deepdive";
import {
  Group, Metric, MetricGrid, PriceLine, RangeMeter, Section, Tag, Unavailable,
  DASH, fmtNum, fmtPercent, fmtSignedPercent, signTone,
} from "./shared";

/** Max points each Technical Score component can contribute (lib/technicals.ts). */
const COMPONENT_MAX: Array<{ key: "trend" | "momentum" | "volume" | "entry"; label: string; max: number }> = [
  { key: "trend", label: "Trend structure", max: 35 },
  { key: "momentum", label: "Momentum (RSI)", max: 25 },
  { key: "volume", label: "Volume confirmation", max: 20 },
  { key: "entry", label: "Entry quality", max: 20 },
];

function ComponentBars({ components }: { components: NonNullable<DeepDiveTechnical["components"]> }) {
  return (
    <div className="space-y-2.5">
      {COMPONENT_MAX.map(({ key, label, max }) => {
        const v = components[key];
        const pct = (v / max) * 100;
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[11px] text-ink-2">{label}</span>
              <span className="text-[11px] num tabular-nums text-ink shrink-0">
                {v}<span className="text-ink-3">/{max}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-line-2/50 overflow-hidden">
              <div className="h-full rounded-full bg-up/80" style={{ width: `${Math.max(1, pct)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Answers "why is it happening?".
 *
 * Split deliberately into two visually distinct halves: the four components
 * that actually produce the Technical Score, and everything else under an
 * explicit "Supplementary indicators" heading that states it is not scored.
 * MACD, SMA200 and Bollinger are useful context, but implying they feed the
 * score would misrepresent how the number is calculated.
 */
export default function TechnicalSection({ technical }: { technical: DeepDiveTechnical }) {
  const t = technical;

  return (
    <Section
      icon={Activity}
      title="Technical picture"
      kicker="What the price and volume history says, and how the score was built."
      aside={t.asOfDate ? <Tag title="Trading session these indicators were computed from">As of {t.asOfDate}</Tag> : undefined}
    >
      {!t.available ? (
        <Unavailable>
          {t.unavailableReason ?? "The Technical Score could not be computed for this ticker."}
          {t.historySessions > 0 && ` ${t.historySessions} sessions of price history are available.`}
        </Unavailable>
      ) : (
        <>
          {/* ── Scored components ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
            <Group title="Technical Score breakdown">
              {t.components && <ComponentBars components={t.components} />}
            </Group>

            <Group title="Why the score reads this way">
              {t.reasons.length > 0 ? (
                <ul className="space-y-1.5">
                  {t.reasons.map((r, i) => (
                    <li key={i} className="text-[11px] text-ink-2 leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-ink-3">
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-ink-3">No reasons were generated.</p>
              )}
            </Group>
          </div>

          {/* ── Price history ── */}
          {t.priceSeries.length >= 5 && (
            <Group
              title="Closing price"
              aside={<span className="text-[10px] text-ink-3 num">{t.priceSeries.length} sessions</span>}
            >
              <div className="bg-inset border border-line rounded-lg px-3 py-3">
                <PriceLine points={t.priceSeries} height={80} />
                <div className="flex justify-between text-[10px] text-ink-3 num mt-1">
                  <span>{t.priceSeries[0].date}</span>
                  <span>{t.priceSeries[t.priceSeries.length - 1].date}</span>
                </div>
              </div>
            </Group>
          )}

          {/* ── Supplementary indicators — explicitly outside the score ── */}
          <div className="mt-6 pt-5 border-t border-dashed border-line">
            <div className="flex items-start gap-2 mb-4">
              <ChartNoAxesColumn size={14} strokeWidth={2} className="text-ink-3 mt-0.5 shrink-0" aria-hidden />
              <div>
                <h3 className="text-[12px] font-semibold text-ink">Supplementary indicators</h3>
                <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">
                  Additional context computed from the same price history. These are <strong className="text-ink-2 font-medium">not part of the Technical Score</strong> above — read them for confluence, not as inputs.
                </p>
              </div>
            </div>

            <MetricGrid>
              <Metric label="RSI (14)" value={fmtNum(t.rsi, 1)} tone={t.rsi === null ? "text-ink-3" : t.rsi > 70 ? "text-down-2" : t.rsi < 30 ? "text-up-2" : "text-ink"} />
              <Metric label="EMA 20" value={fmtNum(t.ema20)} hint={t.priceVsEma20 ? `Price ${t.priceVsEma20}` : undefined} />
              <Metric label="EMA 50" value={fmtNum(t.ema50)} hint={t.priceVsEma50 ? `Price ${t.priceVsEma50}` : undefined} />
              <Metric
                label="SMA 200"
                value={t.sma200 !== null ? fmtNum(t.sma200) : DASH}
                hint={t.sma200 === null ? "Needs 200 sessions" : t.priceVsSma200 ? `Price ${t.priceVsSma200}` : undefined}
                tone={t.priceVsSma200 === "above" ? "text-up-2" : t.priceVsSma200 === "below" ? "text-down-2" : "text-ink"}
              />
              <Metric label="EMA20 slope (5d)" value={fmtSignedPercent(t.ema20SlopePct)} tone={signTone(t.ema20SlopePct)} />
              <Metric label="EMA20 vs EMA50" value={fmtSignedPercent(t.emaGapPct)} tone={signTone(t.emaGapPct)} hint={t.trendRegime ?? undefined} />
              <Metric label="Volume vs 20d avg" value={t.volumeRatio !== null ? `${t.volumeRatio.toFixed(1)}×` : DASH} tone={t.volumeRatio !== null && t.volumeRatio >= 1.5 ? "text-up-2" : "text-ink"} />
              <Metric label="EMA crossover" value={t.crossoverSignal ? t.crossoverSignal : DASH} tone={t.crossoverSignal === "bullish" ? "text-up-2" : t.crossoverSignal === "bearish" ? "text-down-2" : "text-ink-2"} hint="Within last 10 sessions" />
            </MetricGrid>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 mt-6">
              {/* MACD */}
              <Group title="MACD (12, 26, 9)">
                {t.macd ? (
                  <div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className={`text-[15px] font-semibold num ${t.macd.trend === "bullish" ? "text-up-2" : t.macd.trend === "bearish" ? "text-down-2" : "text-ink-2"}`}>
                        {t.macd.trend}
                      </span>
                      <span className="text-[11px] text-ink-3">histogram {t.macd.histogram >= 0 ? "+" : ""}{t.macd.histogram}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Metric label="MACD" value={fmtNum(t.macd.macd)} />
                      <Metric label="Signal" value={fmtNum(t.macd.signal)} />
                      <Metric label="Histogram" value={fmtNum(t.macd.histogram)} tone={signTone(t.macd.histogram)} />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-ink-3">Needs at least 35 sessions of history.</p>
                )}
              </Group>

              {/* Bollinger */}
              <Group title="Bollinger Bands (20, 2)">
                {t.bollinger && t.priceSeries.length > 0 ? (
                  <div>
                    <RangeMeter
                      low={t.bollinger.lower}
                      high={t.bollinger.upper}
                      mid={t.bollinger.middle}
                      value={t.priceSeries[t.priceSeries.length - 1].close}
                      lowLabel={`${t.bollinger.lower.toFixed(2)}`}
                      highLabel={`${t.bollinger.upper.toFixed(2)}`}
                      valueLabel={`${t.priceSeries[t.priceSeries.length - 1].close.toFixed(2)}`}
                    />
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <Metric label="%B" value={t.bollinger.percentB !== null ? t.bollinger.percentB.toFixed(2) : DASH} hint="0 = lower band, 1 = upper" />
                      <Metric label="Bandwidth" value={fmtPercent(t.bollinger.bandwidthPct)} hint="Width relative to the mean" />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-ink-3">Needs at least 20 sessions of history.</p>
                )}
              </Group>
            </div>

            {/* 52-week closing range */}
            <div className="mt-5">
            <Group title="52-week closing range">
              {t.closingRange52w ? (
                <div className="max-w-xl">
                  <RangeMeter
                    low={t.closingRange52w.low}
                    high={t.closingRange52w.high}
                    value={t.priceSeries.length > 0 ? t.priceSeries[t.priceSeries.length - 1].close : t.closingRange52w.high}
                    lowLabel={`Low ${t.closingRange52w.low.toFixed(2)}`}
                    highLabel={`High ${t.closingRange52w.high.toFixed(2)}`}
                    valueLabel={`${fmtSignedPercent(t.closingRange52w.distanceFromHighPct)} vs high`}
                  />
                  <p className="text-[10px] text-ink-3 mt-2 leading-relaxed">
                    Derived from <strong className="text-ink-2 font-medium">closing prices</strong> over {t.closingRange52w.lookbackSessions} sessions — not intraday highs and lows, which the PSX end-of-day feed does not provide. Treat it as a range, not as support or resistance.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-ink-3">Needs at least 20 sessions of history.</p>
              )}
            </Group>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
