import { Layers, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { DeepDiveMarketContext } from "@/lib/deepdive";
import { Metric, MetricGrid, Section, Tag, Unavailable, DASH, fmtSignedPercent, signTone } from "./shared";

/**
 * Answers "is this move the company, or the whole market?".
 *
 * Everything here is a single-session snapshot — we store no historical
 * sector series, so the section says "today" everywhere and never implies
 * relative strength over a period.
 */
export default function MarketContextSection({ market }: { market: DeepDiveMarketContext }) {
  const m = market;
  const sector = m.sector;

  const verdict = (() => {
    if (m.stockVsSectorTodayPct === null) return null;
    const d = m.stockVsSectorTodayPct;
    if (Math.abs(d) < 0.5) return { icon: Minus, text: "Moving broadly with its sector today", tone: "text-ink-2" };
    return d > 0
      ? { icon: TrendingUp, text: `Outpacing its sector by ${d.toFixed(2)} points today`, tone: "text-up-2" }
      : { icon: TrendingDown, text: `Lagging its sector by ${Math.abs(d).toFixed(2)} points today`, tone: "text-down-2" };
  })();

  return (
    <Section
      icon={Layers}
      title="Market & sector context"
      kicker="Where today's move sits against the rest of the sector and the index."
      aside={<Tag title="A single-session snapshot — no historical sector series is stored">Today only</Tag>}
    >
      {!sector && !m.kse100 ? (
        <Unavailable>
          Neither sector constituents nor the KSE-100 snapshot could be fetched for this request.
        </Unavailable>
      ) : (
        <>
          {verdict && (
            <div className="flex items-center gap-2 mb-5">
              <verdict.icon size={15} strokeWidth={2} className={`${verdict.tone} shrink-0`} aria-hidden />
              <span className={`text-[14px] font-semibold ${verdict.tone}`}>{verdict.text}</span>
            </div>
          )}

          <MetricGrid>
            <Metric
              label="Sector today"
              value={sector ? fmtSignedPercent(sector.avgChangePercentToday, 2) : DASH}
              tone={signTone(sector?.avgChangePercentToday)}
              hint={sector ? `${sector.sectorName}, ${sector.constituentCount} constituents` : undefined}
            />
            <Metric
              label="Sector breadth"
              value={sector ? `${sector.advancing} / ${sector.declining}` : DASH}
              hint={sector ? "Advancing / declining today" : undefined}
              tone={sector && sector.advancing > sector.declining ? "text-up-2" : sector && sector.declining > sector.advancing ? "text-down-2" : "text-ink"}
            />
            <Metric
              label="Stock vs sector"
              value={m.stockVsSectorTodayPct !== null ? `${m.stockVsSectorTodayPct >= 0 ? "+" : ""}${m.stockVsSectorTodayPct.toFixed(2)} pts` : DASH}
              tone={signTone(m.stockVsSectorTodayPct)}
              hint="Percentage points, today"
            />
            <Metric
              label="KSE-100 today"
              value={m.kse100 ? fmtSignedPercent(m.kse100.changePercent, 2) : DASH}
              tone={signTone(m.kse100?.changePercent)}
              hint={m.kse100 ? `${m.kse100.value.toLocaleString()} pts` : undefined}
            />
          </MetricGrid>

          {m.stockVsKse100TodayPct !== null && (
            <p className="text-[11px] text-ink-2 mt-4 leading-relaxed">
              Against the index, the stock is{" "}
              <span className={signTone(m.stockVsKse100TodayPct)}>
                {Math.abs(m.stockVsKse100TodayPct).toFixed(2)} points {m.stockVsKse100TodayPct >= 0 ? "ahead of" : "behind"}
              </span>{" "}
              the KSE-100 today.
            </p>
          )}

          <p className="text-[10px] text-ink-3 mt-4 leading-relaxed border-t border-line pt-3">
            Sector figures are the mean change across constituents in today&rsquo;s market-watch snapshot. No multi-day sector performance is available — nothing here describes a trend.
          </p>
        </>
      )}
    </Section>
  );
}
