/**
 * Deterministic valuation aggregation — sector P/E, a labeled market-proxy
 * P/E, premium/discount, and PEG. Nothing here calls an AI provider: the
 * whole point of Deep Dive's architecture is that evidence like "this stock
 * trades at a 24% discount to its sector" is computed by code, not asked of
 * a model. The AI's job (Phase 4) is to interpret numbers like these, never
 * to produce them.
 */

import { getStocksBySector, getAllStocks, KMI30_TICKERS } from "./psx";
import { resolveSectorName } from "./sectors";
import { getAskAnalystFundamentals, effectivePE, type AskAnalystFundamentals } from "./askanalyst";

const MIN_SAMPLE = 3; // below this, we don't report a statistic — see getSectorPE
const MAX_MEANINGFUL_PE = 150; // beyond this a PE is almost always a near-zero-EPS artifact, not a real valuation
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h — annual fundamentals don't move intraday

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** askanalyst starts dropping requests when a whole sector (or the 30-name
 *  KMI-30 list) is fetched at once, which silently turns a real sector P/E
 *  into "unavailable". Paced in batches of 6 — the same batch size
 *  lib/scanner.ts already uses for the PSX history endpoint. Deliberately
 *  NOT done by changing getMultipleFundamentals(), which the scan pipeline
 *  shares. */
const FUNDAMENTALS_BATCH = 6;

async function fetchFundamentalsBatched(
  symbols: string[]
): Promise<Map<string, AskAnalystFundamentals>> {
  const map = new Map<string, AskAnalystFundamentals>();
  for (let i = 0; i < symbols.length; i += FUNDAMENTALS_BATCH) {
    const batch = symbols.slice(i, i + FUNDAMENTALS_BATCH);
    const settled = await Promise.allSettled(batch.map((s) => getAskAnalystFundamentals(s)));
    settled.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value) map.set(batch[j].toUpperCase(), r.value);
    });
  }
  return map;
}

/** Filters a set of (symbol, price) pairs down to usable P/E values, using
 *  each ticker's effective P/E (reported, or price÷EPS for banks). Drops
 *  missing, non-positive (negative-earnings) and implausibly large values —
 *  those are excluded from the sample, never clamped or estimated. */
async function usablePEs(
  symbols: string[],
  priceOf: (symbol: string) => number | undefined
): Promise<{ values: number[]; excludedCount: number }> {
  const fundMap = await fetchFundamentalsBatched(symbols);
  const values: number[] = [];
  let excludedCount = 0;
  for (const sym of symbols) {
    const f = fundMap.get(sym);
    const price = priceOf(sym);
    const pe = f ? effectivePE(f, price) : null;
    if (pe !== null && pe > 0 && pe <= MAX_MEANINGFUL_PE) values.push(pe);
    else excludedCount++;
  }
  return { values, excludedCount };
}

// ─── Sector P/E ──────────────────────────────────────────────────────────────

export interface SectorPEResult {
  sectorCode: string;
  sectorName: string;
  /** Null when fewer than MIN_SAMPLE constituents had a usable P/E — we do
   *  not extrapolate a sector valuation from one or two companies. */
  medianPE: number | null;
  sampleSize: number;         // constituents that actually contributed
  totalConstituents: number;  // how many symbols the sector has at all
  excludedCount: number;      // dropped as missing/negative/implausible
  computedAt: string;
}

const _sectorCache = new Map<string, { result: SectorPEResult; at: number }>();

/** Deterministic sector P/E: median of constituents' effective P/E, after
 *  dropping unusable values. Median (not mean) so one extreme outlier can't
 *  drag the whole sector's reading around. Cached 4h per sector — this hits
 *  askanalyst once per constituent, which is too expensive to redo on every
 *  Deep Dive page view. */
export async function getSectorPE(sectorCode: string): Promise<SectorPEResult> {
  const cached = _sectorCache.get(sectorCode);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  // lib/sectors.ts has the fuller, verified code->name map (e.g. "Oil & Gas
  // Exploration" rather than just "Oil & Gas"), so every surface that shows a
  // sector name shows the same one.
  const sectorName = resolveSectorName(sectorCode);
  const stocks = await getStocksBySector(sectorCode);
  const symbols = stocks.map((s) => s.symbol.toUpperCase());

  let result: SectorPEResult;
  if (symbols.length === 0) {
    result = {
      sectorCode, sectorName, medianPE: null,
      sampleSize: 0, totalConstituents: 0, excludedCount: 0,
      computedAt: new Date().toISOString(),
    };
  } else {
    const priceMap = new Map(stocks.map((s) => [s.symbol.toUpperCase(), s.currentPrice]));
    const { values, excludedCount } = await usablePEs(symbols, (s) => priceMap.get(s));
    const medianPE = values.length >= MIN_SAMPLE ? parseFloat(median(values).toFixed(2)) : null;
    result = {
      sectorCode, sectorName, medianPE,
      sampleSize: values.length, totalConstituents: symbols.length, excludedCount,
      computedAt: new Date().toISOString(),
    };
  }

  _sectorCache.set(sectorCode, { result, at: Date.now() });
  return result;
}

// ─── Premium / discount vs. sector ──────────────────────────────────────────

export interface ValuationComparison {
  stockPE: number | null;
  sectorPE: number | null;
  /** Positive = stock trades at a premium to its sector's median P/E. Null
   *  whenever either side is unusable — never forced to a number. */
  premiumDiscountPct: number | null;
}

/** Pure, deterministic — never delegated to AI. */
export function compareToSectorPE(stockPE: number | null, sectorPE: number | null): ValuationComparison {
  const premiumDiscountPct =
    stockPE !== null && stockPE > 0 && sectorPE !== null && sectorPE > 0
      ? parseFloat((((stockPE - sectorPE) / sectorPE) * 100).toFixed(1))
      : null;
  return { stockPE, sectorPE, premiumDiscountPct };
}

// ─── Market-wide valuation proxy ─────────────────────────────────────────────
// There is no official KSE-100 index-level earnings figure available to this
// app (PSX doesn't expose one through any source we scrape), so this is never
// surfaced as "KSE-100 P/E" anywhere. It's explicitly an internal proxy over
// the KMI-30 constituent list (lib/psx.ts KMI30_TICKERS) — label it as such
// wherever it's shown, e.g. "KMI-30 median P/E (internal proxy)".

export interface UniversePEResult {
  universe: "KMI30";
  medianPE: number | null;
  sampleSize: number;
  totalConstituents: number;
  excludedCount: number;
  computedAt: string;
}

let _universeCache: { result: UniversePEResult; at: number } | null = null;

export async function getUniversePE(): Promise<UniversePEResult> {
  if (_universeCache && Date.now() - _universeCache.at < CACHE_TTL_MS) return _universeCache.result;

  const symbols = KMI30_TICKERS;
  const allStocks = await getAllStocks();
  const priceMap = new Map(allStocks.map((s) => [s.symbol.toUpperCase(), s.currentPrice]));
  const { values, excludedCount } = await usablePEs(symbols, (s) => priceMap.get(s));
  const medianPE = values.length >= MIN_SAMPLE ? parseFloat(median(values).toFixed(2)) : null;

  const result: UniversePEResult = {
    universe: "KMI30", medianPE,
    sampleSize: values.length, totalConstituents: symbols.length, excludedCount,
    computedAt: new Date().toISOString(),
  };
  _universeCache = { result, at: Date.now() };
  return result;
}

// ─── PEG ─────────────────────────────────────────────────────────────────────

/** Below this, EPS growth is treated as "not meaningfully positive" — PEG
 *  would be dominated by noise in the denominator rather than a real growth
 *  signal (a stock growing 0.3%/yr with a P/E of 10 does not have "PEG 33"
 *  in any useful sense). */
const MIN_MEANINGFUL_EPS_GROWTH_PCT = 1;

/**
 * PEG = P/E ÷ EPS growth rate (%), Peter Lynch's classic formulation.
 * Returns null — never a fabricated or misleading number — whenever:
 *   - P/E is missing, zero, or negative (negative earnings)
 *   - EPS growth is missing, zero, or negative (shrinking earnings)
 *   - EPS growth is below MIN_MEANINGFUL_EPS_GROWTH_PCT
 * This is an informational valuation metric, not a standalone buy/sell
 * signal — callers must not treat "PEG < 1" as a rule on its own.
 */
export function calcPEG(pe: number | null, epsGrowthPct: number | null): number | null {
  if (pe === null || pe <= 0) return null;
  if (epsGrowthPct === null || epsGrowthPct < MIN_MEANINGFUL_EPS_GROWTH_PCT) return null;
  return parseFloat((pe / epsGrowthPct).toFixed(2));
}

/**
 * Why PEG came back null, in words a UI or an AI prompt can show verbatim —
 * "unavailable, and here's why" beats a blank cell. Returns null exactly when
 * `calcPEG` returns a number, so the two can never disagree about whether a
 * PEG exists (asserted in the Phase 2 validation fixtures).
 */
export function pegUnavailableReason(pe: number | null, epsGrowthPct: number | null): string | null {
  if (pe === null) return "P/E is unavailable";
  if (pe <= 0) return "P/E is not meaningful (non-positive earnings)";
  if (epsGrowthPct === null) return "EPS growth is unavailable";
  if (epsGrowthPct < 0) return "EPS growth is negative — PEG is undefined for shrinking earnings";
  if (epsGrowthPct === 0) return "EPS growth is zero — PEG is undefined";
  if (epsGrowthPct < MIN_MEANINGFUL_EPS_GROWTH_PCT) {
    return `EPS growth is below ${MIN_MEANINGFUL_EPS_GROWTH_PCT}% — PEG would be noise rather than signal`;
  }
  return null;
}
