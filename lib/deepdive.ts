/**
 * Deep Dive data model + aggregator.
 *
 * This is the one place that assembles everything a Deep Dive view needs into
 * a single strongly-typed object. It ORCHESTRATES; it does not calculate —
 * every number here comes from an existing deterministic module:
 *
 *   lib/technicals.ts ........ Technical Score (untouched, read-only here)
 *   lib/deepdive-technicals.ts MACD / SMA200 / Bollinger / drawdown / range / liquidity
 *   lib/price-behavior.ts .... multi-window closing-price ranges + position in them
 *   lib/valuation.ts ......... sector + KMI-30 proxy P/E, premium/discount, PEG
 *   lib/askanalyst.ts ........ annual fundamentals + multi-year history
 *   lib/company-news.ts ...... press mentions filtered from the shared RSS feeds
 *   lib/psx.ts ............... quotes, EOD history, KSE-100
 *
 * Three rules this model exists to enforce:
 *
 *  1. No AI. Nothing in this file calls a provider. Phase 4's AI pass consumes
 *     this object as pre-computed evidence and is never asked to produce a
 *     number that appears here.
 *  2. No fabrication. Every field is either a real computed value or null.
 *     Nothing is estimated, defaulted to zero, or filled in "to look complete";
 *     where a value is missing, an accompanying reason says why.
 *  3. Freshness travels with the data. Annual fundamentals carry their fiscal
 *     year, technicals carry their trading date, news carries its fetch time —
 *     so no consumer can present year-old annual data as if it were live.
 */

import {
  getAllStocks,
  getHistory,
  getKSE100,
  type EODPoint,
  type IndexSnapshot,
  type StockQuote,
} from "./psx";
import { resolveSectorName } from "./sectors";
import { scoreStock, type TechnicalComponents, type TechnicalScore } from "./technicals";
import {
  computeSupplementaryTechnicals,
  type BollingerBands,
  type ClosingRange52w,
  type DrawdownResult,
  type LiquidityMetric,
  type MACDResult,
  type SupplementaryTechnicals,
} from "./deepdive-technicals";
import {
  effectivePE,
  getAskAnalystFundamentals,
  getCompanyProfile,
  type AskAnalystFundamentals,
  type FundamentalYearPoint,
} from "./askanalyst";
import {
  calcPEG,
  compareToSectorPE,
  getSectorPE,
  getUniversePE,
  pegUnavailableReason,
  type SectorPEResult,
  type UniversePEResult,
} from "./valuation";
import { computePriceBehavior, type PriceBehavior } from "./price-behavior";
import { getCompanyNews, type CompanyNewsResult } from "./company-news";

// ─── 1. Identity ─────────────────────────────────────────────────────────────

export interface DeepDiveIdentity {
  ticker: string;
  companyName: string | null;
  /** PSX numeric sector code from the market-watch row, e.g. "0820". */
  sectorCode: string | null;
  sectorName: string | null;
  currentPrice: number | null;
  change: number | null;
  changePercent: number | null;
  /** Where `currentPrice` came from. Intraday the live quote is newer than the
   *  last EOD session; if market-watch is unavailable we fall back to the last
   *  close and say so rather than presenting a stale price as live. */
  priceSource: "live-quote" | "eod-close" | null;
  /** Latest EOD session available for this ticker (the technicals' as-of date). */
  tradingDate: string | null;
}

// ─── 2. Technical ────────────────────────────────────────────────────────────

export interface DeepDivePricePoint {
  date: string;
  close: number;
  volume: number;
}

export interface DeepDiveTechnical {
  available: boolean;
  /** Why the Technical Score is missing (too little history, bad data). */
  unavailableReason: string | null;

  // Technical Score — read verbatim from lib/technicals.ts, never recomputed.
  score: number | null;
  signal: TechnicalScore["technicalSignal"] | null;
  components: TechnicalComponents | null;
  reasons: string[];

  // Indicators inside the score
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  priceVsEma20: TechnicalScore["priceVsEma20"] | null;
  priceVsEma50: TechnicalScore["priceVsEma50"] | null;
  emaGapPct: number | null;
  ema20SlopePct: number | null;
  trendRegime: TechnicalScore["trendRegime"] | null;
  crossoverSignal: TechnicalScore["crossoverSignal"] | null;
  volumeRatio: number | null;
  todayVolume: number | null;
  avgVolume20d: number | null;

  // Supplementary indicators — Deep Dive only, deliberately NOT in the score
  sma200: number | null;
  priceVsSma200: "above" | "below" | null;
  macd: MACDResult | null;
  bollinger: BollingerBands | null;
  /** 52-week CLOSING range. Not intraday support/resistance — see limitations. */
  closingRange52w: ClosingRange52w | null;

  /** Up to one year of closes for charting. Raw source data, not derived. */
  priceSeries: DeepDivePricePoint[];
  historySessions: number;
  asOfDate: string | null;
}

// ─── 3. Valuation ────────────────────────────────────────────────────────────

export interface DeepDiveMarketProxy extends UniversePEResult {
  /** Verbatim display label. This is NOT the KSE-100 P/E and must never be
   *  presented as one — no index-level earnings data is available to us. */
  label: string;
}

export interface DeepDiveValuation {
  pe: number | null;
  /** "derived-from-eps" means price ÷ EPS, which is how banks get a P/E at
   *  all (their ratio schema reports no PER field). */
  peSource: "reported" | "derived-from-eps" | null;
  pbv: number | null;
  peg: number | null;
  pegUnavailableReason: string | null;
  dividendYield: number | null;
  /** Fiscal year of the annual figures behind P/E, P/B and yield. */
  fiscalYear: string | null;

  sector: SectorPEResult | null;
  premiumDiscountVsSectorPct: number | null;
  marketProxy: DeepDiveMarketProxy | null;
  premiumDiscountVsMarketProxyPct: number | null;
}

// ─── 4. Fundamental quality ──────────────────────────────────────────────────

export interface DeepDiveFundamentals {
  available: boolean;
  isBank: boolean;
  fiscalYear: string | null;

  eps: number | null;
  epsGrowth: number | null;
  dps: number | null;
  revenueGrowth: number | null;
  roe: number | null;
  roa: number | null;
  roce: number | null;
  netMargin: number | null;
  grossMargin: number | null;
  ebitdaMargin: number | null;
  operatingMargin: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  interestCoverage: number | null;
  payoutRatio: number | null;

  /** Fields that are null because the bank ratio schema doesn't report them
   *  at all — a structural difference, not missing data. Empty for non-banks.
   *  Consumers should render these as "not applicable", not "unavailable". */
  notReportedUnderBankSchema: string[];
}

// ─── 5. Multi-year fundamental history ───────────────────────────────────────

export interface DeepDiveFundamentalHistory {
  eps: FundamentalYearPoint[];
  epsGrowth: FundamentalYearPoint[];
  dps: FundamentalYearPoint[];
  pe: FundamentalYearPoint[];
  roe: FundamentalYearPoint[];
  /** Every fiscal year appearing in any series above, ascending. */
  years: string[];
  /** Consecutive most-recent years with a dividend > 0. A payout-consistency
   *  proxy: askanalyst only reports a "Payout Ratio" label for banks, but DPS
   *  history exists for everyone. Null when there's no DPS history at all. */
  dpsPositiveStreakYears: number | null;
}

// ─── 6. Market / sector context ──────────────────────────────────────────────

export interface DeepDiveSectorSnapshot {
  sectorCode: string;
  sectorName: string;
  constituentCount: number;
  /** Mean of constituents' % change TODAY. A single-session snapshot — we
   *  store no historical sector series, so this is not relative strength. */
  avgChangePercentToday: number | null;
  advancing: number;
  declining: number;
}

export interface DeepDiveMarketContext {
  sector: DeepDiveSectorSnapshot | null;
  /** Stock's % change today minus the sector's average, in percentage points. */
  stockVsSectorTodayPct: number | null;
  kse100: IndexSnapshot | null;
  stockVsKse100TodayPct: number | null;
  asOf: string;
}

// ─── 7. News ─────────────────────────────────────────────────────────────────
// (shape lives in lib/company-news.ts — press mentions, never PSX filings)

// ─── 8. Risk / liquidity ─────────────────────────────────────────────────────

export type LiquidityTier = "high" | "moderate" | "low" | "very-low";

export interface DeepDiveRisk {
  /** Stdev of the last 20 daily returns, in % — reused from the Technical
   *  Score computation, not recalculated. Close-to-close, not ATR. */
  dailyVolatilityPct: number | null;
  maxDrawdown1y: DrawdownResult | null;
  /** How far price sits above/below EMA20 — the chase-risk input the
   *  Technical Score's Entry component already scores. */
  extensionPct: number | null;
  entryQualityScore: number | null; // 0-20, the Entry component of the score
  liquidity: LiquidityMetric | null;
  liquidityTier: LiquidityTier | null;
  /** Risk measures deliberately NOT computed, and why. Surfaced so a consumer
   *  (including the Phase 4 AI) can state the limitation instead of guessing. */
  notComputed: string[];
}

// ─── Meta ────────────────────────────────────────────────────────────────────

export interface DeepDiveMeta {
  generatedAt: string;
  tradingDate: string | null;
  fundamentalsFiscalYear: string | null;
  /** Stable fingerprint of the evidence in this object. Phase 4 will key its
   *  AI-analysis cache on ticker + trading date + this. Unused in Phase 2. */
  dataVersion: string;
  /** Structural limits of the data sources — always true, not request-specific. */
  limitations: string[];
  /** What degraded on THIS request (a fetch that failed), if anything. */
  degraded: string[];
  sources: { prices: string; fundamentals: string; news: string };
}

export interface DeepDiveData {
  identity: DeepDiveIdentity;
  technical: DeepDiveTechnical;
  /** Closing-price ranges over several session windows — see lib/price-behavior.ts.
   *  Kept beside `technical` rather than inside it: it is price context, not an
   *  indicator, and nothing in it feeds the Technical Score. */
  priceBehavior: PriceBehavior;
  valuation: DeepDiveValuation;
  fundamentals: DeepDiveFundamentals;
  fundamentalHistory: DeepDiveFundamentalHistory;
  marketContext: DeepDiveMarketContext;
  news: CompanyNewsResult;
  risk: DeepDiveRisk;
  meta: DeepDiveMeta;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STRUCTURAL_LIMITATIONS = [
  "PSX's EOD feed provides close/open/volume only — no daily high/low. ATR, ADX, candlestick patterns and true intraday support/resistance are not computed.",
  "The 52-week range is derived from closing prices, not intraday highs/lows.",
  "Fundamentals are annual fiscal-year figures from askanalyst.com.pk — they can be up to a year old and are never intraday.",
  "No index-level earnings data is available, so the market valuation figure is a KMI-30 median proxy, not the KSE-100 P/E.",
  "Company news is press mentions matched from general business RSS feeds — not official PSX filings or announcements.",
  "Sector and market comparisons are single-day moves; no historical sector index series is stored.",
];

const RISK_NOT_COMPUTED = [
  "ATR and ATR-based stop levels — the EOD feed has no daily high/low to derive a true range from.",
  "Reward/risk ratio — requires a defensible stop and target, which need price levels this data can't honestly produce.",
];

/** Fields the bank ratio schema simply doesn't report. Empirical, from
 *  comparing a bank (UBL) against a non-bank (OGDC) rationew response. */
const BANK_SCHEMA_ABSENT_FIELDS = [
  "pe", "debtToEquity", "currentRatio", "quickRatio", "interestCoverage",
  "grossMargin", "ebitdaMargin", "operatingMargin", "netMargin", "roce",
] as const;

/** Buckets on 20-session average daily traded value (volume × price) in PKR.
 *  Coarse and PSX-specific — a label that sits next to the raw number, never
 *  a replacement for it. */
const LIQUIDITY_TIERS: Array<[LiquidityTier, number]> = [
  ["high", 100_000_000],
  ["moderate", 25_000_000],
  ["low", 5_000_000],
];

const PRICE_SERIES_SESSIONS = 252; // ~1 trading year, enough for a 52-week chart

// ─── Section builders (pure — fixture-testable without network) ──────────────

export function buildTechnicalSection(
  tech: TechnicalScore | null,
  supp: SupplementaryTechnicals | null,
  history: EODPoint[],
  price: number | null
): DeepDiveTechnical {
  const priceSeries: DeepDivePricePoint[] = history
    .slice(0, PRICE_SERIES_SESSIONS)
    .map((p) => ({ date: p.date, close: p.price, volume: p.volume }))
    .reverse(); // oldest → newest, chart-ready

  const sma200 = supp?.sma200 ?? null;
  const priceVsSma200 =
    price !== null && sma200 !== null ? (price >= sma200 ? "above" : "below") : null;

  const unavailableReason = tech
    ? null
    : history.length === 0
      ? "No price history available for this ticker."
      : history.length < 60
        ? `Only ${history.length} sessions of history — the Technical Score needs at least 60.`
        : "Technical Score could not be computed from the available price history.";

  return {
    available: tech !== null,
    unavailableReason,
    score: tech?.technicalScore ?? null,
    signal: tech?.technicalSignal ?? null,
    components: tech?.components ?? null,
    reasons: tech?.reasons ?? [],
    rsi: tech?.rsi ?? null,
    ema20: tech?.ema20 ?? null,
    ema50: tech?.ema50 ?? null,
    priceVsEma20: tech?.priceVsEma20 ?? null,
    priceVsEma50: tech?.priceVsEma50 ?? null,
    emaGapPct: tech?.emaGapPct ?? null,
    ema20SlopePct: tech?.ema20SlopePct ?? null,
    trendRegime: tech?.trendRegime ?? null,
    crossoverSignal: tech?.crossoverSignal ?? null,
    volumeRatio: tech?.volumeRatio ?? null,
    todayVolume: tech?.todayVolume ?? null,
    avgVolume20d: tech?.avgVolume20d ?? null,
    sma200,
    priceVsSma200,
    macd: supp?.macd ?? null,
    bollinger: supp?.bollinger ?? null,
    closingRange52w: supp?.closingRange52w ?? null,
    priceSeries,
    historySessions: history.length,
    asOfDate: supp?.asOfDate ?? history[0]?.date ?? null,
  };
}

export function buildValuationSection(
  f: AskAnalystFundamentals | null,
  price: number | null,
  sector: SectorPEResult | null,
  universe: UniversePEResult | null
): DeepDiveValuation {
  const pe = f ? effectivePE(f, price ?? undefined) : null;
  const peSource = pe === null ? null : f?.pe !== null && f?.pe !== undefined ? "reported" : "derived-from-eps";
  const epsGrowth = f?.epsGrowth ?? null;

  const marketProxy: DeepDiveMarketProxy | null = universe
    ? { ...universe, label: "KMI-30 median P/E (internal proxy, not the KSE-100 P/E)" }
    : null;

  return {
    pe,
    peSource,
    pbv: f?.pbv ?? null,
    peg: calcPEG(pe, epsGrowth),
    pegUnavailableReason: pegUnavailableReason(pe, epsGrowth),
    dividendYield: f?.dividendYield ?? null,
    fiscalYear: f?.fiscalYear ?? null,
    sector,
    premiumDiscountVsSectorPct: compareToSectorPE(pe, sector?.medianPE ?? null).premiumDiscountPct,
    marketProxy,
    premiumDiscountVsMarketProxyPct: compareToSectorPE(pe, universe?.medianPE ?? null).premiumDiscountPct,
  };
}

export function buildFundamentalsSection(f: AskAnalystFundamentals | null): DeepDiveFundamentals {
  const isBank = f?.isBank ?? false;
  const notReported = isBank && f
    ? BANK_SCHEMA_ABSENT_FIELDS.filter((k) => f[k] === null)
    : [];

  return {
    available: f !== null,
    isBank,
    fiscalYear: f?.fiscalYear ?? null,
    eps: f?.eps ?? null,
    epsGrowth: f?.epsGrowth ?? null,
    dps: f?.dps ?? null,
    revenueGrowth: f?.revenueGrowth ?? null,
    roe: f?.roe ?? null,
    roa: f?.roa ?? null,
    roce: f?.roce ?? null,
    netMargin: f?.netMargin ?? null,
    grossMargin: f?.grossMargin ?? null,
    ebitdaMargin: f?.ebitdaMargin ?? null,
    operatingMargin: f?.operatingMargin ?? null,
    debtToEquity: f?.debtToEquity ?? null,
    currentRatio: f?.currentRatio ?? null,
    quickRatio: f?.quickRatio ?? null,
    interestCoverage: f?.interestCoverage ?? null,
    payoutRatio: f?.payoutRatio ?? null,
    notReportedUnderBankSchema: [...notReported],
  };
}

/** Consecutive most-recent fiscal years with DPS > 0. */
function dpsStreak(dps: FundamentalYearPoint[]): number | null {
  if (dps.length === 0) return null;
  let streak = 0;
  for (let i = dps.length - 1; i >= 0; i--) {
    if (dps[i].value > 0) streak++;
    else break;
  }
  return streak;
}

export function buildFundamentalHistorySection(
  f: AskAnalystFundamentals | null
): DeepDiveFundamentalHistory {
  const h = f?.history ?? { eps: [], epsGrowth: [], dps: [], pe: [], roe: [] };
  const years = [
    ...new Set([...h.eps, ...h.epsGrowth, ...h.dps, ...h.pe, ...h.roe].map((p) => p.year)),
  ].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  return {
    eps: h.eps,
    epsGrowth: h.epsGrowth,
    dps: h.dps,
    pe: h.pe,
    roe: h.roe,
    years,
    dpsPositiveStreakYears: dpsStreak(h.dps),
  };
}

export function buildSectorSnapshot(
  allStocks: StockQuote[],
  sectorCode: string | null
): DeepDiveSectorSnapshot | null {
  if (!sectorCode) return null;
  const members = allStocks.filter((s) => s.sector === sectorCode && s.currentPrice > 0);
  if (members.length === 0) return null;

  const changes = members.map((s) => s.changePercent);
  return {
    sectorCode,
    sectorName: resolveSectorName(sectorCode),
    constituentCount: members.length,
    avgChangePercentToday: parseFloat(
      (changes.reduce((a, b) => a + b, 0) / changes.length).toFixed(2)
    ),
    advancing: changes.filter((c) => c > 0).length,
    declining: changes.filter((c) => c < 0).length,
  };
}

function liquidityTierOf(liq: LiquidityMetric | null): LiquidityTier | null {
  if (!liq) return null;
  for (const [tier, floor] of LIQUIDITY_TIERS) {
    if (liq.avgDailyValueTraded >= floor) return tier;
  }
  return "very-low";
}

export function buildRiskSection(
  tech: TechnicalScore | null,
  supp: SupplementaryTechnicals | null
): DeepDiveRisk {
  const liquidity = supp?.liquidity ?? null;
  return {
    dailyVolatilityPct: tech?.dailyVolatilityPct ?? null,
    maxDrawdown1y: supp?.drawdown1y ?? null,
    extensionPct: tech?.extensionPct ?? null,
    entryQualityScore: tech?.components.entry ?? null,
    liquidity,
    liquidityTier: liquidityTierOf(liquidity),
    notComputed: [...RISK_NOT_COMPUTED],
  };
}

/** Stable, order-independent fingerprint of the evidence — djb2 over a
 *  canonical string. Not cryptographic; it only needs to change when the
 *  evidence changes. */
function fingerprint(parts: Array<string | number | null>): string {
  const canonical = parts.map((p) => (p === null ? "~" : String(p))).join("|");
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) {
    h = ((h << 5) + h + canonical.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

function settled<T>(
  result: PromiseSettledResult<T>,
  label: string,
  degraded: string[]
): T | null {
  if (result.status === "fulfilled") return result.value;
  const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
  degraded.push(`${label}: ${msg}`);
  return null;
}

/**
 * Assemble the full Deep Dive dataset for one ticker.
 *
 * Never throws for data reasons: any upstream fetch that fails degrades that
 * section to nulls and records why in `meta.degraded`, because a Deep Dive
 * with no fundamentals is still worth showing — one with invented
 * fundamentals is not.
 */
export async function buildDeepDiveData(rawTicker: string): Promise<DeepDiveData> {
  const ticker = rawTicker.toUpperCase().trim();
  const degraded: string[] = [];

  // Stage 1 — everything that doesn't depend on knowing the sector yet.
  const [historyR, stocksR, fundamentalsR, profileR, kseR] = await Promise.allSettled([
    getHistory(ticker),
    getAllStocks(),
    getAskAnalystFundamentals(ticker),
    getCompanyProfile(ticker),
    getKSE100(),
  ]);

  const history = settled(historyR, "price history", degraded) ?? [];
  const allStocks = settled(stocksR, "market watch", degraded) ?? [];
  const fundamentals = settled(fundamentalsR, "fundamentals", degraded);
  const profile = settled(profileR, "company profile", degraded);
  const kse100 = settled(kseR, "KSE-100", degraded);

  // getAskAnalystFundamentals swallows its own errors and returns null, so a
  // null here is ambiguous on its own: the company may genuinely have no data,
  // or the ratios endpoint may just have failed (it rate-limits under load).
  // The company list distinguishes them — if askanalyst lists the company but
  // returned no ratios, that's a degraded fetch, not an absent company.
  if (!fundamentals) {
    degraded.push(
      profile
        ? `fundamentals: askanalyst lists ${profile.name} but returned no usable ratios (transient failure or unparseable response)`
        : "fundamentals: ticker is not in askanalyst's company list — no fundamentals exist there for it"
    );
  }

  const quote = allStocks.find((s) => s.symbol.toUpperCase() === ticker) ?? null;
  const sectorCode = quote?.sector ?? null;

  // Price: prefer the live quote, fall back to the last close, label which.
  const eodClose = history[0]?.price ?? null;
  const price = quote?.currentPrice ?? eodClose;
  const priceSource: DeepDiveIdentity["priceSource"] =
    quote?.currentPrice != null ? "live-quote" : eodClose != null ? "eod-close" : null;

  // Stage 2 — needs the sector code / company name from stage 1.
  const [sectorR, universeR, newsR] = await Promise.allSettled([
    sectorCode ? getSectorPE(sectorCode) : Promise.resolve(null),
    getUniversePE(),
    getCompanyNews(ticker, profile?.name ?? fundamentals?.companyName ?? null),
  ]);

  const sector = settled(sectorR, "sector P/E", degraded);
  const universe = settled(universeR, "KMI-30 proxy P/E", degraded);
  const news = settled(newsR, "company news", degraded) ?? {
    items: [],
    scannedCount: 0,
    fetchedAt: new Date().toISOString(),
    source: "rss-press-mentions" as const,
    degraded: "news fetch failed",
  };

  // Deterministic computation over what we actually got.
  // minAvgVolume 0: Deep Dive scores whatever ticker was asked for and reports
  // liquidity separately, rather than refusing to score an illiquid name —
  // same convention as /api/technicals and the Watchlist.
  const tech = history.length > 0 ? scoreStock(ticker, history, 0) : null;
  const supp = computeSupplementaryTechnicals(history);

  const technical = buildTechnicalSection(tech, supp, history, price);
  const priceBehavior = computePriceBehavior(history);
  const valuation = buildValuationSection(fundamentals, price, sector, universe);
  const fundamentalsSection = buildFundamentalsSection(fundamentals);
  const fundamentalHistory = buildFundamentalHistorySection(fundamentals);
  const sectorSnapshot = buildSectorSnapshot(allStocks, sectorCode);
  const risk = buildRiskSection(tech, supp);

  const changePercent = quote?.changePercent ?? null;
  const marketContext: DeepDiveMarketContext = {
    sector: sectorSnapshot,
    stockVsSectorTodayPct:
      changePercent !== null && sectorSnapshot?.avgChangePercentToday != null
        ? parseFloat((changePercent - sectorSnapshot.avgChangePercentToday).toFixed(2))
        : null,
    kse100,
    stockVsKse100TodayPct:
      changePercent !== null && kse100 != null
        ? parseFloat((changePercent - kse100.changePercent).toFixed(2))
        : null,
    asOf: new Date().toISOString(),
  };

  const tradingDate = technical.asOfDate;
  const limitations = [...STRUCTURAL_LIMITATIONS];
  if (sector && sector.medianPE === null) {
    limitations.push(
      `Sector P/E is unavailable for ${sector.sectorName}: only ${sector.sampleSize} of ${sector.totalConstituents} constituents had a usable P/E.`
    );
  }

  return {
    identity: {
      ticker,
      companyName: profile?.name ?? fundamentals?.companyName ?? null,
      sectorCode,
      sectorName: sectorCode ? resolveSectorName(sectorCode) : null,
      currentPrice: price,
      change: quote?.change ?? null,
      changePercent,
      priceSource,
      tradingDate,
    },
    technical,
    priceBehavior,
    valuation,
    fundamentals: fundamentalsSection,
    fundamentalHistory,
    marketContext,
    news,
    risk,
    meta: {
      generatedAt: new Date().toISOString(),
      tradingDate,
      fundamentalsFiscalYear: fundamentals?.fiscalYear ?? null,
      // Deliberately over-inclusive rather than minimal: this fingerprint is
      // what Phase 4's AI cache keys on, and a materially changed evidence
      // set that fails to bump it means a stale interpretation gets served
      // as current. Two gaps found by review and closed here: market context
      // (sector/index moves are live, intraday, and change continuously
      // independent of tradingDate/technical.score — the interpretation
      // reads them, so they must be in the key) and news identity (a count
      // alone doesn't change when an old matched article ages out and a
      // different one takes its place at the same count).
      dataVersion: fingerprint([
        ticker,
        tradingDate,
        fundamentals?.fiscalYear ?? null,
        technical.score,
        technical.rsi,
        technical.ema20,
        valuation.pe,
        sector?.medianPE ?? null,
        universe?.medianPE ?? null,
        fundamentalsSection.epsGrowth,
        fundamentalsSection.roe,
        technical.macd?.trend ?? null,
        sectorSnapshot?.avgChangePercentToday ?? null,
        kse100?.changePercent ?? null,
        news.items.length,
        news.items.map((i) => i.title).join("|"),
        // Range facts move only when a close changes, which normally means a
        // new tradingDate — but a revision to an older close would shift a
        // window's low or high while leaving the date alone, and the AI now
        // interprets these bands, so they key the cache too.
        priceBehavior.windows.map((w) => `${w.label}:${w.low}-${w.high}`).join(","),
      ]),
      limitations,
      degraded,
      sources: {
        prices: "dps.psx.com.pk (market watch + EOD timeseries)",
        fundamentals: "askanalyst.com.pk (annual ratios)",
        news: "Dawn / Geo / Profit / The News / ARY business RSS",
      },
    },
  };
}
