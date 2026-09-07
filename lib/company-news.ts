/**
 * Company-relevant news for Deep Dive, filtered out of the SAME general
 * business RSS feeds the scanner already uses (lib/news-fetcher.ts).
 *
 * This is deliberately NOT "company announcements". PSX's own announcements
 * page is JS-rendered with no public JSON (see AGENTS.md), so nothing here
 * comes from an official filing. What this produces is *press mentions*: an
 * article is included only when it actually names the ticker or the company.
 * Macro and sector stories are never relabelled as company news — if nothing
 * mentions the company, the honest answer is an empty list.
 *
 * Matching is deliberately conservative. False negatives (missing a real
 * mention) are recoverable; false positives put an unrelated headline in
 * front of an investment decision, and would also be fed to the Phase 4 AI
 * as if it were evidence about this company.
 */

import { fetchPakistanNewsStructured, type NewsItem } from "./news-fetcher";

export interface CompanyNewsItem extends NewsItem {
  matchedOn: "ticker" | "company-name";
}

export interface CompanyNewsResult {
  items: CompanyNewsItem[];
  /** How many RSS articles were searched to find them — context for an empty
   *  list ("we looked at 40 stories and none named this company"). */
  scannedCount: number;
  fetchedAt: string;
  /** A permanent reminder, at the data layer, of what this actually is. */
  source: "rss-press-mentions";
  degraded: string | null;
}

const MAX_ITEMS = 12;

/** Tickers shorter than this are too collision-prone to word-match safely. */
const MIN_TICKER_LEN = 3;

/**
 * Single-word company cores that are ordinary English or sector vocabulary.
 * "Systems Limited" reduced to "Systems" would match any article about
 * systems, so single-word cores in this set are not used for name matching
 * (the ticker match still applies).
 */
const GENERIC_SINGLE_WORDS = new Set([
  "systems", "power", "energy", "industries", "industry", "textile", "textiles",
  "cement", "food", "foods", "engineering", "technology", "technologies",
  "international", "general", "national", "pakistan", "petroleum", "bank",
  "banks", "chemicals", "chemical", "fertilizer", "fertilizers", "sugar",
  "mills", "refinery", "insurance", "transport", "automobile", "glass",
  "paper", "steel", "telecom", "services", "holdings", "modaraba", "leasing",
  "tobacco", "dairy", "gas", "oil", "electric", "electronics", "motors",
]);

/** Trailing corporate-form words, stripped repeatedly from the end only.
 *  Leading words are never stripped — "Pakistan Petroleum" must stay intact,
 *  because "Petroleum" alone would be useless as a matcher. */
const TRAILING_FORM =
  /\s+\b(limited|ltd|company|co|corporation|corp|incorporated|inc|plc|pvt|private)\b\s*$/i;

/** "Oil & Gas Development Company Limited" -> "Oil & Gas Development" */
export function coreCompanyName(name: string): string {
  let s = name.replace(/\([^)]*\)/g, " ").replace(/[.,]/g, " ");
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(TRAILING_FORM, "");
  }
  return s.replace(/\s+/g, " ").trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Phrase regex for a company core: whitespace-flexible, and "&" also
 *  matches the word "and" ("Oil & Gas" vs "Oil and Gas"). */
function companyNameRegex(core: string): RegExp | null {
  const words = core.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) {
    const w = words[0].toLowerCase();
    if (w.length < 5 || GENERIC_SINGLE_WORDS.has(w)) return null;
  }
  const pattern = words
    .map((w) => (w === "&" || w.toLowerCase() === "and" ? "(?:&|and)" : escapeRe(w)))
    .join("\\s+");
  return new RegExp(`\\b${pattern}\\b`, "i");
}

/** Ticker regex — CASE-SENSITIVE on purpose. Financial press writes tickers
 *  in caps, and case-insensitivity would make "LUCK" match the word "luck",
 *  "MARI" match a name, and so on. */
function tickerRegex(ticker: string): RegExp | null {
  const t = ticker.trim().toUpperCase();
  if (t.length < MIN_TICKER_LEN || !/^[A-Z0-9]+$/.test(t)) return null;
  return new RegExp(`\\b${escapeRe(t)}\\b`);
}

/**
 * Pure matcher — given already-fetched RSS items, return only those that
 * genuinely name this company. Exported separately from the fetch so it can
 * be tested against fixtures without network access.
 */
export function filterCompanyNews(
  items: NewsItem[],
  ticker: string,
  companyName?: string | null
): CompanyNewsItem[] {
  const tickerRe = tickerRegex(ticker);
  const nameRe = companyName ? companyNameRegex(coreCompanyName(companyName)) : null;
  if (!tickerRe && !nameRe) return [];

  const out: CompanyNewsItem[] = [];
  for (const item of items) {
    const haystack = `${item.title} ${item.description}`;
    if (tickerRe?.test(haystack)) {
      out.push({ ...item, matchedOn: "ticker" });
    } else if (nameRe?.test(haystack)) {
      out.push({ ...item, matchedOn: "company-name" });
    }
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

// ─── Fetch + cache ───────────────────────────────────────────────────────────
// The RSS payload is identical for every ticker, so Deep Dive caches it here
// rather than re-fetching five feeds per page view. This cache deliberately
// lives in Deep Dive's own module and NOT in lib/news-fetcher.ts: the
// scanner decides whether to re-run its AI news pass by comparing freshly
// fetched headlines against its own cached set, so caching at the fetch layer
// would quietly change that behaviour.

let _rssCache: { items: NewsItem[]; at: number } | null = null;
const RSS_CACHE_TTL_MS = 10 * 60 * 1000;

export async function getCompanyNews(
  ticker: string,
  companyName?: string | null
): Promise<CompanyNewsResult> {
  let items: NewsItem[] = [];
  let degraded: string | null = null;

  if (_rssCache && Date.now() - _rssCache.at < RSS_CACHE_TTL_MS) {
    items = _rssCache.items;
  } else {
    try {
      const structured = await fetchPakistanNewsStructured();
      items = structured.items;
      _rssCache = { items, at: Date.now() };
    } catch (err) {
      // Serve a stale cache rather than nothing, but say so.
      items = _rssCache?.items ?? [];
      degraded = err instanceof Error ? err.message : "RSS fetch failed";
    }
  }

  return {
    items: filterCompanyNews(items, ticker, companyName),
    scannedCount: items.length,
    fetchedAt: new Date(_rssCache?.at ?? Date.now()).toISOString(),
    source: "rss-press-mentions",
    degraded,
  };
}
