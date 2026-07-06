/**
 * PSX Data Client — fetches live market data from dps.psx.com.pk
 * Runs server-side only (Next.js API routes), no CORS issues.
 */

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
  volume: number;
}

export interface EODPoint {
  timestamp: number;
  date: string;
  price: number;        // close
  open: number;
  volume: number;
}

const BASE = "https://dps.psx.com.pk";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  Accept: "application/json, text/html, */*",
};

function parseNum(s: string): number {
  if (!s || s === "-") return 0;
  return parseFloat(s.replace(/[^\d.-]/g, "")) || 0;
}

function parseInt2(s: string): number {
  if (!s || s === "-") return 0;
  return parseInt(s.replace(/[^\d]/g, ""), 10) || 0;
}

/** Fetch all stocks from PSX market watch. Tries JSON first, falls back to HTML scrape. */
export async function getAllStocks(): Promise<StockQuote[]> {
  const res = await fetch(`${BASE}/market-watch`, {
    headers: HEADERS,
    next: { revalidate: 60 }, // cache 60s in Next.js
  });

  if (!res.ok) throw new Error(`PSX market-watch ${res.status}`);

  const text = await res.text();

  // Try JSON first (PSX sometimes returns JSON for API consumers)
  try {
    const json = JSON.parse(text);
    const arr = Array.isArray(json) ? json : json.data || json.result || [];
    if (arr.length > 0) return arr.map(normalizeJsonStock);
  } catch {
    // Not JSON — parse as HTML below
  }

  // HTML scrape path
  return parseMarketWatchHTML(text);
}

function normalizeJsonStock(s: Record<string, unknown>): StockQuote {
  return {
    symbol: String(s.symbol || s.SYMBOL || ""),
    sector: String(s.sector || s.SECTOR || ""),
    listedIn: String(s.listed_in || s.LISTED_IN || ""),
    ldcp: Number(s.ldcp || s.LDCP || 0),
    open: Number(s.open || s.open_price || s.OPEN || 0),
    high: Number(s.high || s.high_price || s.HIGH || 0),
    low: Number(s.low || s.low_price || s.LOW || 0),
    currentPrice: Number(s.current_price || s.close || s.CURRENT || 0),
    change: Number(s.change || s.CHANGE || 0),
    changePercent: Number(s.change_percent || s.CHANGE_PERCENT || 0),
    volume: Number(s.volume || s.VOLUME || 0),
  };
}

function parseMarketWatchHTML(html: string): StockQuote[] {
  // Extract table rows using regex — avoids needing cheerio server-side
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) throw new Error("No table found in PSX HTML response");

  const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const stocks: StockQuote[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = (rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(
      (td) => td.replace(/<[^>]+>/g, "").trim()
    );
    if (cells.length < 9) continue;
    stocks.push({
      symbol: cells[0],
      sector: cells[1],
      listedIn: cells[2],
      ldcp: parseNum(cells[3]),
      open: parseNum(cells[4]),
      high: parseNum(cells[5]),
      low: parseNum(cells[6]),
      currentPrice: parseNum(cells[7]),
      change: parseNum(cells[8]),
      changePercent: cells.length > 9 ? parseNum(cells[9]) : 0,
      volume: cells.length > 10 ? parseInt2(cells[10]) : 0,
    });
  }

  return stocks.filter((s) => s.symbol.length > 0);
}

/** Get EOD history for a symbol (up to 5 years). */
export async function getHistory(symbol: string): Promise<EODPoint[]> {
  const res = await fetch(`${BASE}/timeseries/eod/${symbol.toUpperCase()}`, {
    headers: HEADERS,
    next: { revalidate: 3600 }, // cache 1h — history doesn't change intraday
  });

  if (!res.ok) throw new Error(`PSX EOD ${symbol} ${res.status}`);

  const data = await res.json();
  const raw: unknown[][] = Array.isArray(data)
    ? data
    : (data?.data ?? data?.result ?? []);

  return raw
    .filter((item) => Array.isArray(item) && item.length >= 3)
    .map((item) => {
      const ts = Number(item[0]);
      return {
        timestamp: ts,
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        price: Number(item[1]),
        volume: Number(item[2]),
        open: item.length >= 4 ? Number(item[3]) : Number(item[1]),
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp); // newest first
}

export interface IndexSnapshot {
  value: number;          // current index points
  change: number;
  changePercent: number;
}

/** KSE-100 snapshot scraped from the dps.psx.com.pk indices table.
 *  Columns are mapped by header name so a column reorder can't silently
 *  misread values. Returns null on any failure — callers treat it as optional. */
export async function getKSE100(): Promise<IndexSnapshot | null> {
  try {
    const res = await fetch(`${BASE}/indices`, {
      headers: HEADERS,
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const headBlock = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)?.[1] ?? "";
    const headers = [...headBlock.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").trim().toLowerCase());
    const col = (name: string) => headers.findIndex((h) => h.includes(name));
    const iCur = col("current"), iChg = col("change"), iPct = col("%");
    if (iCur < 0 || iChg < 0) return null;

    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((m) => m[1].replace(/<[^>]+>/g, "").trim());
      if (!/^KSE\s?100$/i.test(cells[0] ?? "")) continue;
      return {
        value: parseNum(cells[iCur]),
        change: parseNum(cells[iChg]),
        changePercent: iPct >= 0 ? parseNum(cells[iPct]) : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Get quotes for multiple symbols in one market-watch fetch. */
export async function getQuotes(
  symbols: string[]
): Promise<Record<string, StockQuote>> {
  const all = await getAllStocks();
  const upper = new Set(symbols.map((s) => s.toUpperCase()));
  const result: Record<string, StockQuote> = {};
  for (const stock of all) {
    if (upper.has(stock.symbol.toUpperCase())) {
      result[stock.symbol.toUpperCase()] = stock;
    }
  }
  return result;
}

/** Get all stocks in a sector (by PSX numeric code or name alias). */
export async function getStocksBySector(
  sectorCode: string
): Promise<StockQuote[]> {
  const all = await getAllStocks();
  return all.filter(
    (s) =>
      s.sector === sectorCode ||
      s.sector.toLowerCase().includes(sectorCode.toLowerCase())
  );
}

// KMI-30 constituents (Shariah-compliant, updated periodically)
export const KMI30_TICKERS = [
  "MEBL", "HBL",  "UBL",  "MCB",  "BAHL",
  "OGDC", "PPL",  "PSO",  "MARI", "POL",
  "LUCK", "MLCF", "CHCC", "DGKC", "PIOC",
  "ENGRO","EFERT","FFC",  "FATIMA","NRL",
  "HUBC", "KAPCO","KEL",  "NCPL", "PKGP",
  "SYS",  "TRG",  "AVN",  "COLG", "EPCL",
];

// PSX sector code → human name mapping
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
  engineering: "0808",
  fertilizer: "0809",
  fertilizers: "0809",
  food: "0810",
  insurance: "0812",
  modaraba: "0819",
  "oil & gas": "0820",
  "oil and gas": "0820",
  energy: "0820",
  oil: "0820",
  gas: "0820",
  omc: "0821",
  packaging: "0822",
  pharma: "0823",
  pharmaceutical: "0823",
  power: "0824",
  refinery: "0825",
  refineries: "0825",
  sugar: "0826",
  technology: "0828",
  tech: "0828",
  telecom: "0828",
  textile: "0829",
  textiles: "0829",
  transport: "0833",
  reit: "0836",
  "real estate": "0838",
};
