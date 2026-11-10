/**
 * PSX data facade — the functions the rest of the app calls for market data.
 * Runs server-side only (route handlers / server components).
 *
 * Sources (all public pages or published files on dps.psx.com.pk):
 *   lib/psx-snapshot.ts  /screener ............ price, day change, valuation, index membership
 *   lib/psx-eod.ts       /download/mkt_summary  daily OHLCV for every equity → history
 *   lib/psx-market.ts    /indices, /trading-panel, /circuit-breakers
 *   lib/psx-company.ts   /company/SYMBOL ...... full quote, limits, financials, announcements
 *
 * History: until Sept 2026 this file read /market-watch and
 * /timeseries/eod/SYMBOL. PSX then put those feeds behind a page token and
 * they began answering 404 to everything else — see DECISIONS.md.
 */

import { getSnapshot, getIndexConstituents, type SnapshotRow } from "./psx-snapshot";
import { getEodHistory, getLatestSession, HISTORY_SESSIONS, type EODPoint, type EodDay } from "./psx-eod";
import { getIndices, type IndexSnapshot } from "./psx-market";

export type { EODPoint } from "./psx-eod";
export type { IndexSnapshot } from "./psx-market";

export interface StockQuote {
  symbol: string;
  sector: string;
  listedIn: string;
  ldcp: number;
  open: number;
  high: number;
  low: number;
  currentPrice: number;
  change: number;
  changePercent: number;
  /** Volume of the session named by `sessionDate` (the latest published session). */
  volume: number;
  // ── Added with the public-page data layer (absent only in EOD-only fallback) ──
  name?: string;
  /** Session the open/high/low/volume figures belong to (YYYY-MM-DD). */
  sessionDate?: string;
  marketCap?: number;
  pe?: number;
  dividendYield?: number;
  change1y?: number;
  avgVolume30d?: number;
  /** KMI All Share constituent, per PSX. Undefined when membership is unknown. */
  shariah?: boolean;
  /** XD / XB / XR markers from the latest session file. */
  flags?: string[];
}

function fromSnapshot(r: SnapshotRow, day: EodDay | null): StockQuote {
  const ldcp = r.changePercent > -100 ? r.price / (1 + r.changePercent / 100) : r.price;
  const eod = day?.rows.get(r.symbol);
  // Session figures only describe this price when the file's close matches it;
  // otherwise the snapshot is ahead of the last published session.
  const sameSession = !!eod && Math.abs(eod.close - r.price) / r.price < 0.0005;
  return {
    symbol: r.symbol,
    sector: r.sector,
    listedIn: r.indices.join(","),
    ldcp: Number(ldcp.toFixed(2)),
    open: sameSession ? eod.open : 0,
    high: sameSession ? eod.high : 0,
    low: sameSession ? eod.low : 0,
    currentPrice: r.price,
    change: Number((r.price - ldcp).toFixed(2)),
    changePercent: r.changePercent,
    volume: eod?.volume ?? 0,
    name: r.name,
    sessionDate: day?.date,
    marketCap: r.marketCap,
    pe: r.pe,
    dividendYield: r.dividendYield,
    change1y: r.change1y,
    avgVolume30d: r.avgVolume30d,
    shariah: r.shariah,
    flags: eod?.flags ?? [],
  };
}

function fromEodOnly(day: EodDay): StockQuote[] {
  return [...day.rows.values()].map((e) => ({
    symbol: e.symbol,
    sector: e.sector,
    listedIn: "",
    ldcp: e.ldcp,
    open: e.open,
    high: e.high,
    low: e.low,
    currentPrice: e.close,
    change: e.ldcp > 0 ? Number((e.close - e.ldcp).toFixed(2)) : 0,
    changePercent: e.ldcp > 0 ? Number((((e.close - e.ldcp) / e.ldcp) * 100).toFixed(2)) : 0,
    volume: e.volume,
    name: e.name,
    sessionDate: day.date,
    flags: e.flags,
  }));
}

/**
 * Every listed equity. Built from the screener snapshot, enriched with the
 * latest session file. The two sources are independent, so either one alone
 * still yields a usable list — only both failing throws.
 */
export async function getAllStocks(): Promise<StockQuote[]> {
  const [snap, day] = await Promise.allSettled([getSnapshot(), getLatestSession()]);
  const latest = day.status === "fulfilled" ? day.value : null;
  if (snap.status === "fulfilled") return snap.value.value.map((r) => fromSnapshot(r, latest));
  if (latest) return fromEodOnly(latest);
  throw snap.reason instanceof Error ? snap.reason : new Error("PSX market data unavailable");
}

/** EOD history for a symbol, newest first. Default depth suits the Technical Score. */
export async function getHistory(
  symbol: string,
  sessions: number = HISTORY_SESSIONS.technicals
): Promise<EODPoint[]> {
  return getEodHistory(symbol, sessions);
}

/** KSE-100 snapshot, or null on any failure — callers treat it as optional. */
export async function getKSE100(): Promise<IndexSnapshot | null> {
  try {
    const row = (await getIndices()).value.find((r) => r.code === "KSE100");
    return row ? { value: row.value, change: row.change, changePercent: row.changePercent } : null;
  } catch {
    return null;
  }
}

/** Quotes for specific symbols, keyed by upper-case symbol. */
export async function getQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  const all = await getAllStocks();
  const want = new Set(symbols.map((s) => s.toUpperCase()));
  const result: Record<string, StockQuote> = {};
  for (const stock of all) if (want.has(stock.symbol)) result[stock.symbol] = stock;
  return result;
}

/** All stocks in a sector (PSX numeric code). */
export async function getStocksBySector(sectorCode: string): Promise<StockQuote[]> {
  const all = await getAllStocks();
  return all.filter((s) => s.sector === sectorCode);
}

/**
 * KMI-30 constituents as of 2026-11-10, used ONLY when live index membership
 * can't be read. Prefer getKmi30Tickers(): the index is recomposed twice a
 * year and a hardcoded list silently goes wrong (the previous one had 17 of
 * 30 names that were no longer — or never — in the index).
 */
export const KMI30_FALLBACK = [
  "AIRLINK", "ATRL", "CPHL", "DGKC", "EFERT", "ENGROH", "FCCL", "FFC", "FFL", "GAL",
  "GHNI", "HCAR", "HUBC", "LUCK", "MARI", "MEBL", "MLCF", "NML", "NRL", "OGDC",
  "PAEL", "PPL", "PRL", "PSO", "SAZEW", "SEARL", "SNGP", "SSGC", "SYS", "TREET",
];

/** Live KMI-30 constituents from PSX, falling back to the dated list above. */
export async function getKmi30Tickers(): Promise<string[]> {
  try {
    const live = await getIndexConstituents("KMI30");
    if (live.length >= 20) return live;
  } catch { /* fall through */ }
  return KMI30_FALLBACK;
}

/** Symbols PSX currently lists in the KMI All Share (Shariah-compliant) index. */
export async function getShariahSymbols(): Promise<Set<string>> {
  return new Set(await getIndexConstituents("KMIALLSHR"));
}

// PSX sector code → short name used in AI prompts
export const SECTOR_CODES: Record<string, string> = {
  "0801": "Automobile",
  "0804": "Cement",
  "0805": "Chemicals",
  "0807": "Banking",
  "0808": "Engineering",
  "0809": "Fertilizer",
  "0810": "Food",
  "0812": "Insurance",
  "0819": "Modaraba",
  "0820": "Oil & Gas",
  "0821": "OMC",
  "0822": "Packaging",
  "0823": "Pharma",
  "0824": "Power",
  "0825": "Refinery",
  "0826": "Sugar",
  "0828": "Technology",
  "0829": "Textile",
  "0833": "Transport",
  "0836": "REIT",
  "0838": "Real Estate",
};

// Sector name → PSX code (for scanner sector expansion)
export const SECTOR_NAME_TO_CODE: Record<string, string> = {
  automobile: "0801",
  auto: "0801",
  cement: "0804",
  chemical: "0805",
  chemicals: "0805",
  banking: "0807",
  bank: "0807",
  banks: "0807",
  "commercial banks": "0807",
  engineering: "0808",
  steel: "0808",
  fertilizer: "0809",
  fertilizers: "0809",
  fertiliser: "0809",
  food: "0810",
  "food & beverages": "0810",
  "food and beverages": "0810",
  "food & personal care": "0810",
  insurance: "0812",
  modaraba: "0819",
  "oil & gas": "0820",
  "oil and gas": "0820",
  "oil & gas exploration": "0820",
  energy: "0820",
  oil: "0820",
  gas: "0820",
  omc: "0821",
  "oil & gas marketing": "0821",
  "oil marketing": "0821",
  packaging: "0822",
  pharma: "0823",
  pharmaceutical: "0823",
  pharmaceuticals: "0823",
  power: "0824",
  "power generation": "0824",
  refinery: "0825",
  refineries: "0825",
  sugar: "0826",
  technology: "0828",
  tech: "0828",
  telecom: "0828",
  "technology & communication": "0828",
  textile: "0829",
  textiles: "0829",
  transport: "0833",
  reit: "0836",
  "real estate": "0838",
};

/**
 * Resolve an AI-described sector to a PSX code. The NAME is trusted over any
 * code the model supplies: models routinely attach a plausible-looking but
 * wrong code (observed: "Banking" tagged 0801, which is Automobile), and a
 * wrong code silently expands the scan into the wrong sector.
 */
export function resolveSectorCode(sectorName: string, suppliedCode?: string): string | null {
  const byName = SECTOR_NAME_TO_CODE[sectorName.trim().toLowerCase()];
  if (byName) return byName;
  if (suppliedCode && /^08\d\d$/.test(suppliedCode)) {
    // Accept a supplied code only when its own name agrees with what the model called the sector.
    const canonical = SECTOR_CODES[suppliedCode]?.toLowerCase();
    const said = sectorName.toLowerCase();
    if (canonical && (said.includes(canonical) || canonical.includes(said))) return suppliedCode;
  }
  return null;
}
