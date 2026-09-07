import { ShieldAlert } from "lucide-react";
import type { DeepDiveRisk } from "@/lib/deepdive";
import {
  Group, Metric, MetricGrid, NotComputed, Section, Unavailable,
  DASH, fmtPKRLarge, fmtPercent, fmtSignedPercent,
} from "./shared";

const TIER_COPY: Record<string, { label: string; tone: string; hint: string }> = {
  high: { label: "High", tone: "text-up-2", hint: "Above PKR 100M traded daily" },
  moderate: { label: "Moderate", tone: "text-ink", hint: "PKR 25–100M traded daily" },
  low: { label: "Low", tone: "text-gold-2", hint: "PKR 5–25M traded daily" },
  "very-low": { label: "Very low", tone: "text-down-2", hint: "Under PKR 5M traded daily — position size with care" },
};

/**
 * Answers "what could go wrong?" — and, just as importantly, states what this
 * app deliberately does not calculate. The unavailable-by-design list is not
 * an apology: computing an ATR stop from a feed with no daily high or low
 * would produce a confident number that means nothing.
 */
export default function RiskSection({ risk }: { risk: DeepDiveRisk }) {
  const r = risk;
  const tier = r.liquidityTier ? TIER_COPY[r.liquidityTier] : null;
  const hasAny = r.dailyVolatilityPct !== null || r.maxDrawdown1y !== null || r.liquidity !== null;

  return (
    <Section
      icon={ShieldAlert}
      title="Risk & liquidity"
      kicker="How much this stock moves, how far it has fallen, and how easily it trades."
    >
      {!hasAny ? (
        <Unavailable>
          Risk measures need price history, which is unavailable for this ticker.
        </Unavailable>
      ) : (
        <>
          <MetricGrid>
            <Metric
              label="Daily volatility"
              value={fmtPercent(r.dailyVolatilityPct)}
              hint="Std. dev. of the last 20 daily closes"
            />
            <Metric
              label="Max drawdown (1yr)"
              value={r.maxDrawdown1y ? `−${r.maxDrawdown1y.maxDrawdownPct.toFixed(1)}%` : DASH}
              tone={r.maxDrawdown1y && r.maxDrawdown1y.maxDrawdownPct >= 30 ? "text-down-2" : "text-ink"}
              hint={r.maxDrawdown1y ? `${r.maxDrawdown1y.peakDate} → ${r.maxDrawdown1y.troughDate}` : undefined}
            />
            <Metric
              label="Extension vs EMA20"
              value={fmtSignedPercent(r.extensionPct)}
              tone={r.extensionPct !== null && r.extensionPct > 8 ? "text-gold-2" : "text-ink"}
              hint="Chase risk — how far above trend price has run"
            />
            <Metric
              label="Entry quality"
              value={r.entryQualityScore !== null ? `${r.entryQualityScore}/20` : DASH}
              hint="The Technical Score's entry component"
            />
          </MetricGrid>

          <Group title="Liquidity">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <Metric
                label="Avg daily traded value"
                value={r.liquidity ? `PKR ${fmtPKRLarge(r.liquidity.avgDailyValueTraded)}` : DASH}
                hint={r.liquidity ? `Over ${r.liquidity.lookbackSessions} sessions` : undefined}
              />
              <Metric
                label="Avg daily volume"
                value={r.liquidity ? r.liquidity.avgVolume.toLocaleString() : DASH}
                hint="Shares"
              />
              {tier && <Metric label="Liquidity tier" value={tier.label} tone={tier.tone} hint={tier.hint} />}
            </div>
            <p className="text-[10px] text-ink-3 mt-3 leading-relaxed">
              Traded value is volume × price — a measure of turnover, not order-book depth or spread, neither of which this data source exposes.
            </p>
          </Group>

          <div className="mt-5">
            <NotComputed title="Deliberately not calculated" items={r.notComputed} />
          </div>
        </>
      )}
    </Section>
  );
}
