import { Scale } from "lucide-react";
import type { DeepDiveValuation } from "@/lib/deepdive";
import {
  CompareBars, Group, Metric, MetricGrid, Section, Tag, Unavailable,
  DASH, fmtMultiple, fmtPercent,
} from "./shared";

/**
 * Answers "is it cheap or expensive, against what?".
 *
 * The stock-vs-sector comparison is the visual anchor: a single sentence
 * stating the premium or discount, backed by the two multiples that produced
 * it and the constituent count behind the sector figure. The market line is
 * always labelled as the KMI-30 proxy — it is not the KSE-100 P/E and saying
 * so is not optional.
 */
export default function ValuationSection({ valuation }: { valuation: DeepDiveValuation }) {
  const v = valuation;
  const prem = v.premiumDiscountVsSectorPct;
  const hasSectorComparison = prem !== null && v.sector?.medianPE != null && v.pe !== null;

  return (
    <Section
      icon={Scale}
      title="Valuation"
      kicker="How the market is pricing this company, relative to its sector and the wider market."
      aside={
        v.fiscalYear
          ? <Tag tone="annual" title="Valuation ratios come from annual accounts, not live data">FY{v.fiscalYear} annual</Tag>
          : undefined
      }
    >
      {/* ── Headline comparison ── */}
      {hasSectorComparison ? (
        <div className="bg-inset border border-line rounded-xl px-4 py-4 mb-5">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <div className="label mb-1">This stock</div>
              <div className="text-[28px] font-bold num tabular-nums text-ink leading-none">
                {v.pe!.toFixed(2)}<span className="text-[16px] text-ink-3 font-semibold">×</span>
              </div>
              <div className="text-[10px] text-ink-3 mt-1.5">
                {v.peSource === "derived-from-eps" ? "P/E derived from price ÷ EPS" : "P/E as reported"}
              </div>
            </div>

            <div>
              <div className="label mb-1">Sector median</div>
              <div className="text-[28px] font-bold num tabular-nums text-ink-2 leading-none">
                {v.sector!.medianPE!.toFixed(2)}<span className="text-[16px] text-ink-3 font-semibold">×</span>
              </div>
              <div className="text-[10px] text-ink-3 mt-1.5">
                {v.sector!.sectorName} · {v.sector!.sampleSize} of {v.sector!.totalConstituents} constituents
              </div>
            </div>

            <div className="flex-1 min-w-[12rem]">
              <div className={`text-[15px] font-semibold leading-snug ${prem < 0 ? "text-up-2" : prem > 0 ? "text-gold-2" : "text-ink-2"}`}>
                {prem === 0
                  ? "In line with its sector median"
                  : `${Math.abs(prem).toFixed(1)}% ${prem < 0 ? "below" : "above"} sector median`}
              </div>
              <p className="text-[10px] text-ink-3 mt-1.5 leading-relaxed">
                A discount is not automatically an opportunity — it can reflect lower growth, weaker balance sheet or earnings quality. Read it alongside the fundamentals below.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-5">
          <Unavailable>
            {v.pe === null
              ? "No usable P/E for this stock, so no sector comparison can be made."
              : v.sector
                ? `Sector P/E is unavailable for ${v.sector.sectorName}: only ${v.sector.sampleSize} of ${v.sector.totalConstituents} constituents had a usable P/E, below the minimum sample needed for a meaningful median. Rather than compare against one or two companies, no sector figure is shown.`
                : "The sector for this ticker could not be resolved, so no sector comparison is available."}
          </Unavailable>
        </div>
      )}

      {/* ── Benchmarks ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
        <Group title="P/E against benchmarks">
          <CompareBars
            rows={[
              { label: "This stock", value: v.pe, emphasis: true, sub: v.peSource === "derived-from-eps" ? "Derived from price ÷ EPS" : undefined },
              {
                label: v.sector ? `${v.sector.sectorName} median` : "Sector median",
                value: v.sector?.medianPE ?? null,
                sub: v.sector
                  ? v.sector.medianPE !== null
                    ? `Median of ${v.sector.sampleSize} constituents`
                    : `Unavailable — ${v.sector.sampleSize} of ${v.sector.totalConstituents} constituents usable`
                  : undefined,
              },
              {
                label: "KMI-30 median (market proxy)",
                value: v.marketProxy?.medianPE ?? null,
                sub: v.marketProxy
                  ? `Internal proxy over ${v.marketProxy.sampleSize} KMI-30 names — not the KSE-100 P/E, which we have no earnings data for`
                  : undefined,
              },
            ]}
          />
          {v.premiumDiscountVsMarketProxyPct !== null && (
            <p className="text-[11px] text-ink-2 mt-3 leading-relaxed">
              {Math.abs(v.premiumDiscountVsMarketProxyPct).toFixed(1)}%{" "}
              {v.premiumDiscountVsMarketProxyPct < 0 ? "below" : "above"} the KMI-30 median proxy.
            </p>
          )}
        </Group>

        <Group title="Other valuation measures">
          <MetricGrid cols={2}>
            <Metric label="Price / book" value={fmtMultiple(v.pbv)} />
            <Metric
              label="Dividend yield"
              value={fmtPercent(v.dividendYield)}
              tone={v.dividendYield !== null && v.dividendYield >= 5 ? "text-up-2" : "text-ink"}
            />
            <Metric
              label="PEG"
              value={v.peg !== null ? v.peg.toFixed(2) : DASH}
              hint={v.peg !== null ? "P/E ÷ EPS growth — informational, not a signal on its own" : undefined}
              naReason={v.peg === null ? (v.pegUnavailableReason ?? undefined) : undefined}
            />
            <Metric
              label="P/E source"
              value={v.peSource === "reported" ? "Reported" : v.peSource === "derived-from-eps" ? "Derived" : DASH}
              hint={v.peSource === "derived-from-eps" ? "Bank schema reports no P/E; computed from price ÷ EPS" : undefined}
            />
          </MetricGrid>
        </Group>
      </div>
    </Section>
  );
}
