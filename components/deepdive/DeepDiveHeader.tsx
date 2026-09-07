import Link from "next/link";
import { ArrowLeft, Radio, Clock } from "lucide-react";
import type { DeepDiveIdentity, DeepDiveTechnical } from "@/lib/deepdive";
import { TechnicalScoreMeter } from "@/components/ui/TechnicalScore";
import { hueOf } from "@/components/ui/signal-hue";
import { Tag, fmtSignedPercent, signTone, DASH } from "./shared";

/**
 * Answers "what's happening?" — identity, price, and the Technical Score,
 * with the score labelled as technical-only. The signal badge reuses the same
 * hue map as Opportunities/Watchlist so a STRONG_BUY looks identical here.
 */
export default function DeepDiveHeader({
  identity, technical,
}: {
  identity: DeepDiveIdentity;
  technical: DeepDiveTechnical;
}) {
  const hue = hueOf(technical.signal ?? undefined);
  const priceTag =
    identity.priceSource === "live-quote"
      ? <Tag tone="live" title="Latest price from the PSX market-watch feed"><Radio size={9} strokeWidth={2.5} aria-hidden />Live quote</Tag>
      : identity.priceSource === "eod-close"
        ? <Tag tone="eod" title="Market-watch was unavailable — this is the last end-of-day close"><Clock size={9} strokeWidth={2.5} aria-hidden />EOD close</Tag>
        : null;

  return (
    <header className="pb-6 border-b border-line">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[11px] text-ink-3 hover:text-ink transition-colors mb-4"
      >
        <ArrowLeft size={13} strokeWidth={2} aria-hidden />
        Back to scanner
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        {/* Identity */}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{identity.ticker}</h1>
            {technical.signal && (
              <span className={`inline-flex items-center rounded-md border bg-transparent text-[10px] font-bold tracking-wide px-2 py-0.5 ${hue.text} ${hue.border}`}>
                {technical.signal.replace("_", " ")}
              </span>
            )}
          </div>
          <p className="text-[13px] text-ink-2 mt-1 leading-snug">
            {identity.companyName ?? "Company name unavailable"}
          </p>
          {identity.sectorName && (
            <p className="text-[11px] text-ink-3 mt-0.5">{identity.sectorName}</p>
          )}
        </div>

        {/* Price + score */}
        <div className="flex items-end gap-6 sm:gap-8">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold num tabular-nums text-ink">
                <span className="text-ink-3 font-normal text-[0.55em] mr-1">PKR</span>
                {identity.currentPrice !== null ? identity.currentPrice.toFixed(2) : DASH}
              </span>
              <span className={`text-[13px] num font-medium ${signTone(identity.changePercent)}`}>
                {fmtSignedPercent(identity.changePercent, 2)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              {priceTag}
              {identity.tradingDate && (
                <Tag title="Latest end-of-day session used for the technical calculations">
                  Session {identity.tradingDate}
                </Tag>
              )}
            </div>
          </div>

          {technical.score !== null && (
            <div className="shrink-0">
              <TechnicalScoreMeter score={technical.score} />
              <p className="text-[10px] text-ink-3 mt-1.5 max-w-[10rem] leading-snug">
                Price and volume only — no fundamentals, news or AI.
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
