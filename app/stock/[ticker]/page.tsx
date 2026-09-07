import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleAlert, Info } from "lucide-react";
import { buildDeepDiveData } from "@/lib/deepdive";
import DeepDiveHeader from "@/components/deepdive/DeepDiveHeader";
import TechnicalSection from "@/components/deepdive/TechnicalSection";
import ValuationSection from "@/components/deepdive/ValuationSection";
import FundamentalSection from "@/components/deepdive/FundamentalSection";
import FundamentalHistorySection from "@/components/deepdive/FundamentalHistorySection";
import MarketContextSection from "@/components/deepdive/MarketContextSection";
import CompanyNewsSection from "@/components/deepdive/CompanyNewsSection";
import RiskSection from "@/components/deepdive/RiskSection";
import AIInterpretationPlaceholder from "@/components/deepdive/AIInterpretationPlaceholder";

/**
 * Deep Dive route — the research view for one ticker.
 *
 * A server component so the page owns data fetching and the components below
 * stay purely presentational: they receive DeepDiveData and render it, with
 * no fetching, state or knowledge of where the numbers came from. The
 * aggregator is called directly rather than through /api/deepdive to avoid a
 * pointless HTTP hop back into the same process; the API route remains the
 * entry point for any client-side or external consumer.
 */

const TICKER_RE = /^[A-Z0-9]{2,10}$/;

function normalize(raw: string): string | null {
  const t = decodeURIComponent(raw).toUpperCase().trim();
  return TICKER_RE.test(t) ? t : null;
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  const t = normalize(ticker) ?? ticker.toUpperCase();
  return {
    title: `${t} — Deep Dive | PSX Scanner`,
    description: `Technical, valuation, fundamental and risk research for ${t} on the Pakistan Stock Exchange.`,
  };
}

export default async function DeepDivePage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = normalize(raw);
  if (!ticker) notFound();

  const data = await buildDeepDiveData(ticker);

  // Neither price history nor fundamentals means this isn't a ticker we can
  // say anything about — a 404 rather than a page of empty sections.
  if (data.technical.historySessions === 0 && !data.fundamentals.available) {
    notFound();
  }

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <DeepDiveHeader identity={data.identity} technical={data.technical} />

      {/* Something upstream degraded — say which, rather than rendering a
          silently thinner page. */}
      {data.meta.degraded.length > 0 && (
        <div className="flex items-start gap-2.5 bg-gold-dim border border-gold/40 rounded-lg px-3.5 py-3 mt-6">
          <CircleAlert size={14} strokeWidth={2} className="text-gold-2 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="text-[12px] text-gold-2 font-medium">Some data could not be loaded</p>
            <ul className="mt-1 space-y-0.5">
              {data.meta.degraded.map((d, i) => (
                <li key={i} className="text-[11px] text-ink-2 leading-relaxed">{d}</li>
              ))}
            </ul>
            <p className="text-[10px] text-ink-3 mt-1.5">Everything else on this page is unaffected.</p>
          </div>
        </div>
      )}

      <div className="mt-6">
        <TechnicalSection technical={data.technical} />
        <ValuationSection valuation={data.valuation} />
        <FundamentalSection fundamentals={data.fundamentals} history={data.fundamentalHistory} />
        <FundamentalHistorySection history={data.fundamentalHistory} />
        <MarketContextSection market={data.marketContext} />
        <CompanyNewsSection news={data.news} ticker={data.identity.ticker} />
        <RiskSection risk={data.risk} />
        <AIInterpretationPlaceholder />
      </div>

      {/* What this page structurally cannot know — available, not shouted. */}
      <details className="mt-8 border-t border-line pt-5 group">
        <summary className="flex items-center gap-2 cursor-pointer text-[11px] text-ink-3 hover:text-ink-2 transition-colors list-none">
          <Info size={13} strokeWidth={2} aria-hidden />
          What this page can and cannot tell you ({data.meta.limitations.length})
        </summary>
        <ul className="mt-3 space-y-1.5">
          {data.meta.limitations.map((l, i) => (
            <li key={i} className="text-[11px] text-ink-3 leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0">
              {l}
            </li>
          ))}
        </ul>
      </details>

      <footer className="mt-6 pt-4 border-t border-line text-[10px] text-ink-3 leading-relaxed">
        Prices from {data.meta.sources.prices} · Fundamentals from {data.meta.sources.fundamentals} · News from {data.meta.sources.news}. Not financial advice.
      </footer>
    </main>
  );
}
