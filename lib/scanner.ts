/**
 * Autonomous Two-Pass Scanner
 *
 * Pass 1 — Free news fetch + AI reasoning:
 *   RSS feeds from Dawn, Geo, Profit Pakistan are fetched for free.
 *   AI reasons over the headlines to identify which PSX sectors are affected.
 *   No web search tools → no paid quota consumed.
 *
 * Pass 2 — Stock selection:
 *   Always scans KMI-30 (30 Shariah-compliant stocks).
 *   For each news-flagged sector, expands to ALL Shariah-compliant stocks in that sector.
 *   Runs technical scoring (RSI, EMA, volume) on all candidates.
 *   Filters out weak setups (score < minScore).
 *   AI reasons over survivors → returns final 1-8 picks.
 */

import {
  getAllStocks,
  getHistory,
  getStocksBySector,
  KMI30_TICKERS,
  SECTOR_NAME_TO_CODE,
  type StockQuote,
} from "./psx";
import { scoreStock, type TechnicalScore } from "./technicals";
import {
  getNewsAnalysis,
  getStockSignals,
  type AISignal,
  type NewsAnalysis,
  type ProviderConfig,
} from "./providers";
import { fetchPakistanNews } from "./news-fetcher";
import { getMultipleFundamentals, fundamentalsPromptLine } from "./askanalyst";

export interface ScanResult {
  timestamp: string;            // ISO string
  newsAnalysis: NewsAnalysis;
  expandedSectors: string[];    // sector names that were deep-dived
  totalScanned: number;
  passedTechnicals: number;
  signals: AISignal[];
  technicalData: TechnicalScore[]; // for display in UI
  newsHeadlines: string[];      // top headlines fed to the AI (for transparency)
  newsSources: string[];        // RSS source names that had articles
  newsFromCache: boolean;       // true when AI analysis was reused (news unchanged)
  fundamentals: Record<string, import("./askanalyst").AskAnalystFundamentals>; // keyed by ticker
}

// ─── Sector-rep tickers for fundamentals context injected into AI prompt ──
const SECTOR_REPS = [
  "HBL", "MCB",        // Banking
  "OGDC", "PPL", "PSO", // Oil & Gas
  "LUCK", "MLCF",       // Cement
  "ENGRO", "FFC",       // Fertilizer / Chemicals
  "SYS",                // Technology
];

let _fundCtxCache: { text: string; at: number } | null = null;
const FUND_CTX_TTL_MS = 60 * 60 * 1_000; // 1 hour — fundamentals change slowly

/** Fetch a snapshot of sector-rep fundamentals for AI context injection. Never throws. */
async function getFundamentalsContext(): Promise<string> {
  const now = Date.now();
  if (_fundCtxCache && now - _fundCtxCache.at < FUND_CTX_TTL_MS) {
    return _fundCtxCache.text;
  }
  try {
    const map = await getMultipleFundamentals(SECTOR_REPS);
    if (map.size === 0) return "";
    const lines: string[] = [];
    for (const ticker of SECTOR_REPS) {
      const f = map.get(ticker);
      if (f) {
        const line = fundamentalsPromptLine(f);
        if (line) lines.push(`  ${ticker}: ${line}`);
      }
    }
    if (!lines.length) return "";
    const text =
      "\n\n--- LIVE PSX MARKET FUNDAMENTALS (sector representatives, for context) ---\n" +
      lines.join("\n") +
      "\n---";
    _fundCtxCache = { text, at: now };
    return text;
  } catch {
    return ""; // fundamentals are additive — never block news analysis
  }
}

// ─── Server-side news cache ────────────────────────────────────────────────
// Persists across warm Vercel invocations (same process reuse).
// Prevents the AI from regenerating analysis on unchanged articles,
// which was the cause of "flickering" macro context on every refresh.
let _newsCache: {
  text: string;
  analysis: NewsAnalysis;
  headlines: string[];   // normalised for overlap detection
  sources: string[];
  at: number;
} | null = null;
const NEWS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function extractHeadlines(text: string, n = 10): string[] {
  return text.split("\n").slice(0, n).map(l => l.trim()).filter(Boolean);
}

function extractSources(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const m = line.match(/^\[([^\]·]+)/);
    if (m) seen.add(m[1].trim());
  }
  return [...seen];
}

/** Returns true if at least `threshold` of the top-5 headlines overlap between two lists. */
function headlinesStillFresh(fresh: string[], cached: string[], threshold = 3): boolean {
  const cachedSet = new Set(cached.slice(0, 5).map(h => h.slice(0, 70).toLowerCase()));
  return fresh.slice(0, 5).filter(h => cachedSet.has(h.slice(0, 70).toLowerCase())).length >= threshold;
}

/**
 * Fetches fresh RSS, compares headlines to cache, and only re-runs the AI
 * when the news has meaningfully changed.  Returns the (possibly cached)
 * NewsAnalysis along with the freshly-parsed headline list and sources.
 */
async function getNewsAnalysisWithCache(config: ProviderConfig): Promise<{
  newsAnalysis: NewsAnalysis;
  newsHeadlines: string[];
  newsSources: string[];
  fromCache: boolean;
}> {
  // Fetch RSS news and sector fundamentals in parallel — no extra latency
  const [rawNews, fundamentalsCtx] = await Promise.all([
    fetchPakistanNews(),
    getFundamentalsContext(),
  ]);

  const headlines = extractHeadlines(rawNews, 10);
  const sources = extractSources(rawNews);

  // If the cache is alive AND headlines haven't substantially changed → reuse
  if (_newsCache) {
    const cacheAlive = Date.now() - _newsCache.at < NEWS_CACHE_TTL_MS;
    const newsUnchanged = headlinesStillFresh(headlines, _newsCache.headlines);
    if (cacheAlive || newsUnchanged) {
      _newsCache.at = Date.now(); // bump TTL
      return { newsAnalysis: _newsCache.analysis, newsHeadlines: headlines, newsSources: sources, fromCache: true };
    }
  }

  // Augment news with live fundamentals so AI has valuation context
  // e.g. "Banking at PE 6x — is this news bullish/bearish given current pricing?"
  const augmentedNews = fundamentalsCtx ? rawNews + fundamentalsCtx : rawNews;

  // Headlines changed significantly — run AI analysis on fresh (augmented) news
  const newsAnalysis = await getNewsAnalysis(config, augmentedNews);
  _newsCache = { text: rawNews, analysis: newsAnalysis, headlines, sources, at: Date.now() };
  return { newsAnalysis, newsHeadlines: headlines, newsSources: sources, fromCache: false };
}

interface ScanOptions {
  minTechnicalScore?: number;   // default 45
  minAvgVolume?: number;        // default 200_000
  maxPicks?: number;            // default 8
  skipNewsPass?: boolean;       // for faster manual refresh
}

/** Fetch history + compute technicals for a list of symbols in parallel batches. */
async function fetchAndScore(
  symbols: string[],
  minScore: number,
  minAvgVolume: number
): Promise<TechnicalScore[]> {
  const BATCH = 6; // fetch 6 at a time to avoid rate limits
  const results: TechnicalScore[] = [];

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (symbol) => {
        const history = await getHistory(symbol);
        return scoreStock(symbol, history, minAvgVolume);
      })
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value !== null) {
        results.push(r.value);
      }
    }
  }

  return results
    .filter((s) => s.compositeScore >= minScore)
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

/** Build the stock context string fed to the AI in Pass 2. */
function buildStockContext(
  scores: TechnicalScore[],
  quotes: Record<string, StockQuote>,
  fundamentals?: Map<string, import("./askanalyst").AskAnalystFundamentals>
): string {
  return scores
    .slice(0, 20) // cap at 20 to keep prompt manageable
    .map((s) => {
      const q = quotes[s.symbol];
      const f = fundamentals?.get(s.symbol);
      const price = q?.currentPrice ?? s.currentPrice;
      const chg = q?.changePercent ?? 0;
      const lines = [
        `${s.symbol} — PKR ${price} (${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% today)`,
        `  Technical score: ${s.compositeScore}/100 [${s.technicalSignal}]`,
        `  RSI: ${s.rsi} | EMA20: ${s.ema20} | EMA50: ${s.ema50}`,
        `  Volume: ${s.volumeRatio}x 20d avg (${(s.avgVolume20d / 1000).toFixed(0)}K avg/day)`,
        `  Crossover: ${s.crossoverSignal} | Price vs EMA20: ${s.priceVsEma20} | vs EMA50: ${s.priceVsEma50}`,
        ...s.reasons.map((r) => `  • ${r}`),
      ];
      if (f) {
        const fundLine = fundamentalsPromptLine(f);
        if (fundLine) lines.push(`  Fundamentals: ${fundLine}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Build news context string for Pass 2. */
function buildNewsContext(news: NewsAnalysis): string {
  const sectors = (news.affectedSectors ?? [])
    .map((s) => `  • ${s.sectorName} [${s.impact}]: ${s.reason}`)
    .join("\n");
  const factors = (news.globalFactors ?? []).map((f) => `  • ${f}`).join("\n");
  return [
    `Summary: ${news.summary}`,
    `\nAffected sectors:\n${sectors || "  • None identified"}`,
    `\nGlobal factors:\n${factors || "  • None"}`,
  ].join("\n");
}

/** Main scanner entry point. */
export async function runFullScan(
  providerConfig: ProviderConfig,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const {
    minTechnicalScore = 45,
    minAvgVolume = 200_000,
    maxPicks = 8,
    skipNewsPass = false,
  } = options;

  // --- Pass 1: Free RSS news fetch → AI sector analysis (with cache) ---
  let newsAnalysis: NewsAnalysis = {
    summary: "News scan skipped.",
    affectedSectors: [],
    globalFactors: [],
  };
  let newsHeadlines: string[] = [];
  let newsSources: string[] = [];
  let newsFromCache = false;

  if (!skipNewsPass) {
    const newsResult = await getNewsAnalysisWithCache(providerConfig);
    newsAnalysis = newsResult.newsAnalysis;
    newsHeadlines = newsResult.newsHeadlines;
    newsSources = newsResult.newsSources;
    newsFromCache = newsResult.fromCache;
  }

  // Determine sector expansion
  const expandedSectors: string[] = [];
  const sectorSymbolSets: Set<string> = new Set(KMI30_TICKERS);

  for (const affected of newsAnalysis.affectedSectors) {
    if (affected.impact === "NEUTRAL") continue;

    // Find sector code
    const code =
      affected.sectorCode ||
      SECTOR_NAME_TO_CODE[affected.sectorName.toLowerCase()] ||
      "";

    if (!code) continue;

    expandedSectors.push(affected.sectorName);

    // Fetch all Shariah-compliant stocks in this sector
    try {
      const sectorStocks = await getStocksBySector(code);
      for (const s of sectorStocks) {
        sectorSymbolSets.add(s.symbol.toUpperCase());
      }
    } catch {
      // Sector fetch failed — continue with KMI-30 only
    }
  }

  const allSymbols = Array.from(sectorSymbolSets);

  // Fetch live quotes for display (price + day change)
  let quotes: Record<string, StockQuote> = {};
  try {
    const allStocks = await getAllStocks();
    const symbolSet = new Set(allSymbols.map((s) => s.toUpperCase()));
    for (const stock of allStocks) {
      if (symbolSet.has(stock.symbol.toUpperCase())) {
        quotes[stock.symbol.toUpperCase()] = stock;
      }
    }
  } catch {
    // Live quotes unavailable — technicals still work from history
  }

  // --- Pass 2: Technical scoring ---
  const scoredStocks = await fetchAndScore(
    allSymbols,
    minTechnicalScore,
    minAvgVolume
  );

  // --- Pass 2 continued: AI signal generation ---
  // Fetch fundamentals for scored stocks in parallel (best-effort, non-blocking)
  let fundamentalsMap: Map<import("./askanalyst").AskAnalystFundamentals["symbol"], import("./askanalyst").AskAnalystFundamentals> | undefined;
  try {
    fundamentalsMap = await getMultipleFundamentals(
      scoredStocks.slice(0, 20).map((s) => s.symbol)
    );
  } catch { /* fundamentals are additive, never block the scan */ }

  const stockContext = buildStockContext(scoredStocks, quotes, fundamentalsMap);
  const newsContext = buildNewsContext(newsAnalysis);

  let signals: AISignal[] = [];
  if (scoredStocks.length > 0) {
    signals = await getStockSignals(providerConfig, stockContext, newsContext);
    // Cap at maxPicks and sort by confidence
    signals = signals
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxPicks);
  }

  // Convert fundamentals map to plain record for JSON serialization
  const fundamentalsRecord: Record<string, import("./askanalyst").AskAnalystFundamentals> = {};
  if (fundamentalsMap) {
    fundamentalsMap.forEach((v, k) => { fundamentalsRecord[k] = v; });
  }

  return {
    timestamp: new Date().toISOString(),
    newsAnalysis,
    expandedSectors,
    totalScanned: allSymbols.length,
    passedTechnicals: scoredStocks.length,
    signals,
    technicalData: scoredStocks,
    newsHeadlines,
    newsSources,
    newsFromCache,
    fundamentals: fundamentalsRecord,
  };
}

/** Lightweight news-only refresh (Pass 1 only, no stock fetch). Uses same cache. */
export async function runNewsRefresh(
  providerConfig: ProviderConfig
): Promise<{ newsAnalysis: NewsAnalysis; newsHeadlines: string[]; newsSources: string[]; newsFromCache: boolean }> {
  const r = await getNewsAnalysisWithCache(providerConfig);
  return { newsAnalysis: r.newsAnalysis, newsHeadlines: r.newsHeadlines, newsSources: r.newsSources, newsFromCache: r.fromCache };
}
