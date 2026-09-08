import { Landmark } from "lucide-react";
import type { DeepDiveFundamentals, DeepDiveFundamentalHistory } from "@/lib/deepdive";
import {
  Group, Metric, MetricGrid, Section, Tag, Unavailable,
  DASH, fmtMultiple, fmtNum, fmtPercent, fmtSignedPercent, signTone,
} from "./shared";

const BANK_NA = "Not reported under bank schema";

/**
 * Answers "is the business healthy?".
 *
 * Grouped into profitability / growth / balance sheet / dividends rather than
 * one flat wall of ratios, and everything is stamped with its fiscal year —
 * these are annual figures and can be the better part of a year old.
 *
 * Banks are handled from the data model's own `notReportedUnderBankSchema`
 * list: a field a bank's schema simply doesn't have is labelled as such
 * instead of showing a dash, because "banks don't report this" is an answer
 * and "unavailable" would imply something went wrong.
 */
export default function FundamentalSection({
  fundamentals, history,
}: {
  fundamentals: DeepDiveFundamentals;
  history: DeepDiveFundamentalHistory;
}) {
  const f = fundamentals;
  const notReported = new Set(f.notReportedUnderBankSchema);
  const na = (key: string) => (notReported.has(key) ? BANK_NA : undefined);

  return (
    <Section
      icon={Landmark}
      title="Fundamental quality"
      kicker="Profitability, growth and balance-sheet strength from the last reported annual accounts."
      aside={
        <>
          {f.isBank && <Tag title="This company reports under askanalyst's bank ratio schema">Bank schema</Tag>}
          {f.fiscalYear && <Tag tone="annual" title="Latest reported fiscal year — annual data, never intraday">FY{f.fiscalYear} annual</Tag>}
        </>
      }
    >
      {!f.available ? (
        <Unavailable>
          No fundamental data is available for this ticker from askanalyst.com.pk. Technical and market data on this page are unaffected.
        </Unavailable>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
            <Group title="Profitability">
              <MetricGrid cols={3}>
                <Metric label="ROE" value={fmtPercent(f.roe)} tone={f.roe !== null && f.roe >= 15 ? "text-up-2" : f.roe !== null && f.roe < 8 ? "text-down-2" : "text-ink"} />
                <Metric label="ROA" value={fmtPercent(f.roa)} naReason={na("roa")} />
                <Metric label="ROCE" value={fmtPercent(f.roce)} naReason={na("roce")} />
                <Metric label="Net margin" value={fmtPercent(f.netMargin)} naReason={na("netMargin")} />
                <Metric label="Gross margin" value={fmtPercent(f.grossMargin)} naReason={na("grossMargin")} />
                <Metric label="Operating margin" value={fmtPercent(f.operatingMargin)} naReason={na("operatingMargin")} />
                <Metric label="EBITDA margin" value={fmtPercent(f.ebitdaMargin)} naReason={na("ebitdaMargin")} />
                <Metric label="EPS" value={f.eps !== null ? `${fmtNum(f.eps)}` : DASH} hint={f.eps !== null ? "PKR per share" : undefined} />
              </MetricGrid>
            </Group>

            <Group title="Growth">
              <MetricGrid cols={2}>
                <Metric
                  label="EPS growth"
                  value={fmtSignedPercent(f.epsGrowth)}
                  tone={signTone(f.epsGrowth)}
                  hint="Latest year, year on year"
                />
                <Metric
                  label="Revenue growth"
                  value={fmtSignedPercent(f.revenueGrowth)}
                  tone={signTone(f.revenueGrowth)}
                  hint="Latest year, year on year"
                />
              </MetricGrid>
              <p className="text-[10px] text-ink-3 mt-3 leading-relaxed">
                Single-year growth is noisy on its own — the multi-year history below shows whether it is a trend or a one-off.
              </p>
            </Group>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1 mt-5">
            <Group title="Balance sheet & solvency">
              <MetricGrid cols={2}>
                <Metric
                  label="Debt / equity"
                  value={fmtMultiple(f.debtToEquity)}
                  tone={f.debtToEquity !== null && f.debtToEquity <= 0.5 ? "text-up-2" : f.debtToEquity !== null && f.debtToEquity > 1.5 ? "text-down-2" : "text-ink"}
                  naReason={na("debtToEquity")}
                />
                <Metric label="Interest coverage" value={f.interestCoverage !== null ? fmtMultiple(f.interestCoverage, 1) : DASH} naReason={na("interestCoverage")} hint={f.interestCoverage !== null ? "EBIT ÷ interest" : undefined} />
                <Metric label="Current ratio" value={fmtMultiple(f.currentRatio, 2)} naReason={na("currentRatio")} />
                <Metric label="Quick ratio" value={fmtMultiple(f.quickRatio, 2)} naReason={na("quickRatio")} />
              </MetricGrid>
            </Group>

            <Group title="Dividends">
              <MetricGrid cols={3}>
                <Metric label="DPS" value={f.dps !== null ? fmtNum(f.dps) : DASH} hint={f.dps !== null ? "PKR per share" : undefined} />
                <Metric label="Payout ratio" value={fmtPercent(f.payoutRatio)} naReason={!f.isBank && f.payoutRatio === null ? "Not reported for non-bank schema" : undefined} />
                <Metric
                  label="Paid every year for"
                  value={history.dpsPositiveStreakYears !== null ? `${history.dpsPositiveStreakYears} yr` : DASH}
                  hint={history.dpsPositiveStreakYears !== null ? "Consecutive years with a dividend" : undefined}
                  tone={history.dpsPositiveStreakYears !== null && history.dpsPositiveStreakYears >= 5 ? "text-up-2" : "text-ink"}
                />
              </MetricGrid>
            </Group>
          </div>

          {f.isBank && f.notReportedUnderBankSchema.length > 0 && (
            <p className="text-[10px] text-ink-3 mt-5 leading-relaxed border-t border-line pt-3">
              {f.notReportedUnderBankSchema.length} standard ratios are marked &ldquo;{BANK_NA.toLowerCase()}&rdquo;. Banks report a different set of measures entirely (net interest margin, cost-to-income, deposit ratios) — these fields are absent by design, not missing.
            </p>
          )}
        </>
      )}
    </Section>
  );
}
