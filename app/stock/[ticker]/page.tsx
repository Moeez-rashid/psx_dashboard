import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleAlert, Info } from "lucide-react";
import { buildDeepDiveData } from "@/lib/deepdive";
import { resolveDeepDiveAnalysis } from "@/lib/deepdive-ai";
import { getAllStocks } from "@/lib/psx";
import { getCompanyProfile } from "@/lib/askanalyst";
import TopNav from "@/components/nav/TopNav";
import DeepDiveSkeleton from "@/components/deepdive/DeepDiveSkeleton";
import DeepDiveHeader from "@/components/deepdive/DeepDiveHeader";
import TechnicalSection from "@/components/deepdive/TechnicalSection";
import ValuationSection from "@/components/deepdive/ValuationSection";
import FundamentalSection from "@/components/deepdive/FundamentalSection";
import FundamentalHistorySection from "@/components/deepdive/FundamentalHistorySection";
import MarketContextSection from "@/components/deepdive/MarketContextSection";
import CompanyNewsSection from "@/components/deepdive/CompanyNewsSection";
import RiskSection from "@/components/deepdive/RiskSection";
import AIInterpretationSection from "@/components/deepdive/AIInterpretationSection";
import RecordResearchVisit from "@/components/deepdive/RecordResearchVisit";

/**
 * Deep Dive route — the research view for one ticker.
 *
 * Split into two async layers on purpose, to get a genuine 404 status code
 * AND a real streamed loading experience — the two are otherwise mutually
 * exclusive in the App Router:
 *
 *   - Next commits to an HTTP status the moment it flushes the first byte
 *     of the response. A route-level `loading.tsx` makes Next flush a 200
 *     with that fallback BEFORE the page component has run at all, so any
 *     notFound() the page calls afterwards can no longer change the status
 *     line — the browser already has a 200. That's exactly what shipped in
 *     Phase 3: verified against a production build, `/stock/ZZZZ9` returned
 *     HTTP 200 with the correct not-found page rendered inside it.
 *   - The full data aggregation (buildDeepDiveData, which fans out across a
 *     sector's constituents for the sector-P/E comparison) can take tens of
 *     seconds on a cold cache. Waiting for it before sending anything —
 *     which is the only way to keep the status code correct if the 404
 *     decision depends on its result — means a blank page for that long.
 *
 * The fix: decide 404 from something FAST and cheap (does this ticker
 * appear anywhere at all — the PSX market-watch listing or askanalyst's
 * company list) in the outer, un-Suspended `DeepDivePage`. Neither check
 * hits the slow, uncached parts of the pipeline (the per-ticker EOD-history
 * fetch, the per-ticker ratios fetch, or the sector fan-out) — `getAllStocks`
 * is Next-fetch-cached 60s and `getCompanyProfile` reads askanalyst's
 * 24h in-memory company map, so this resolves quickly even cold. Only once
 * that's settled does the page return JSX at all, which is what lets Next
 * commit to the right status line before the first flush. The genuinely
 * slow work then happens in `DeepDiveBody`, a separate async component
 * inside a local <Suspense> boundary — exactly the granularity streaming is
 * for, just scoped below the notFound() decision instead of around it.
 *
 * One deliberate, narrow behaviour change this requires: the existence
 * check is now "is this ticker known to us at all" rather than the old
 * "did the full pipeline produce usable history or fundamentals" — a ticker
 * that's listed on PSX but has no price history yet (e.g. freshly IPO'd)
 * now renders the real page with an honest unavailable state in the
 * Technical section instead of 404ing. That's a genuine improvement, not a
 * side effect to route around: it's the same "unavailable, not invented,
 * not hidden" rule this whole feature is built on, applied to routing. A
 * ticker unknown to both sources — the only case that matters for a bad
 * URL — still 404s, and now with the correct status code.
 */

const TICKER_RE = /^[A-Z0-9]{2,10}$/;

function normalize(raw: string): string | null {
  const t = decodeURIComponent(raw).toUpperCase().trim();
  return TICKER_RE.test(t) ? t : null;
}

/** Fast existence check — deliberately avoids every slow/uncached call in
 *  buildDeepDiveData (per-ticker EOD history, per-ticker ratios, the sector
 *  fan-out) so the notFound() decision can be made before any response is
 *  sent, without reintroducing the blank-page wait Suspense exists to avoid. */
async function tickerIsKnown(ticker: string): Promise<boolean> {
  const [stocksResult, profileResult] = await Promise.allSettled([
    getAllStocks(),
    getCompanyProfile(ticker),
  ]);
  const listed =
    stocksResult.status === "fulfilled" &&
    stocksResult.value.some((s) => s.symbol.toUpperCase() === ticker);
  const knownToAskAnalyst = profileResult.status === "fulfilled" && profileResult.value !== null;
  return listed || knownToAskAnalyst;
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
  if (!(await tickerIsKnown(ticker))) notFound();

  return (
    <>
      <TopNav active="deep-dive" />
      <Suspense fallback={<DeepDiveSkeleton />}>
        <DeepDiveBody ticker={ticker} />
      </Suspense>
    </>
  );
}

/** The slow part: full data aggregation + the actual page content. Isolated
 *  in its own component so <Suspense> above can stream it in independently
 *  of the (already-resolved, already-committed) 404 decision. */
async function DeepDiveBody({ ticker }: { ticker: string }) {
  const data = await buildDeepDiveData(ticker);
  // Cache-only lookup — a Redis GET at most, never a model call. A plain
  // page view must never trigger AI generation; only the explicit button in
  // AIInterpretationSection does that, via the same /api/deepdive route.
  const ai = await resolveDeepDiveAnalysis(data, { generate: false });

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <RecordResearchVisit ticker={data.identity.ticker} name={data.identity.companyName} />
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
        <AIInterpretationSection ticker={data.identity.ticker} initialResult={ai} />
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
