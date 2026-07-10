/**
 * AskAnalyst.com.pk API client
 * Provides fundamental ratios: P/E, P/BV, dividend yield, ROE, debt-to-equity,
 * EPS and related valuation/profitability metrics for PSX-listed companies.
 *
 * All endpoints are public (no API key required).
 *
 * NOTE — endpoint migration (2026):
 *   askanalyst retired the old `sharepricedatanew/{id}` snapshot endpoint; it now
 *   returns HTTP 500 ("Unknown column 'dividend'") for every ticker. Their live site
 *   moved to `rationew/{id}`, which returns annual financial ratios grouped into
 *   sections. We read the latest reported fiscal year for each metric we care about.
 *   Company list is cached for 24 hours.
 */

const BASE = "https://api.askanalyst.com.pk/api";
const TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Company list (ticker → numeric ID map)
// ---------------------------------------------------------------------------

interface CompanyEntry {
  id: number;
  symbol: string;
  name: string;
  sector: string;
  sector_id: number;
}

let _companyMap: Map<string, CompanyEntry> | null = null;
let _companyMapFetchedAt = 0;
const COMPANY_MAP_TTL = 24 * 60 * 60 * 1_000; // 24 h

async function getCompanyMap(): Promise<Map<string, CompanyEntry>> {
  const now = Date.now();
  if (_companyMap && now - _companyMapFetchedAt < COMPANY_MAP_TTL) {
    return _companyMap;
  }

  try {
    const res = await fetch(`${BASE}/companylistwithids`, {
      headers: { "User-Agent": "PSX-Dashboard/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return _companyMap ?? new Map();

    const list: CompanyEntry[] = await res.json();
    const map = new Map<string, CompanyEntry>();
    for (const c of list) {
      if (c.symbol) map.set(c.symbol.toUpperCase(), c);
    }
    _companyMap = map;
    _companyMapFetchedAt = now;
    return map;
  } catch {
    return _companyMap ?? new Map();
  }
}

/** Resolve a PSX ticker symbol to its askanalyst numeric company ID. */
export async function getCompanyId(symbol: string): Promise<number | null> {
  const map = await getCompanyMap();
  return map.get(symbol.toUpperCase())?.id ?? null;
}

// ---------------------------------------------------------------------------
// Fundamentals  (rationew/{id})
// ---------------------------------------------------------------------------

export interface AskAnalystFundamentals {
  symbol: string;
  companyName: string;
  sector: string;
  fiscalYear: string | null;     // latest reported year, e.g. "2025"
  pe: number | null;             // PER (Price/Earnings)
  pbv: number | null;            // Price/Book
  dividendYield: number | null;  // percent
  roe: number | null;            // Return on Equity, percent
  debtToEquity: number | null;   // x  (null for banks — not meaningful)
  eps: number | null;            // PKR — lets the UI derive a trailing P/E for banks
  netMargin: number | null;      // percent
  revenueGrowth: number | null;  // percent (latest year YoY)
  payoutRatio: number | null;    // percent
}

function nullNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ─── rationew response shape ────────────────────────────────────────────────
interface YearValue { year: string; value: string }
interface RatioMetric { label: string; unit?: string; data: YearValue[] }
interface RatioSection { section: string; data: RatioMetric[] }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Flatten all sections into a normalized-label → metric map (first match wins). */
function indexMetrics(sections: RatioSection[]): Map<string, RatioMetric> {
  const idx = new Map<string, RatioMetric>();
  for (const sec of sections) {
    if (!Array.isArray(sec?.data)) continue;
    for (const m of sec.data) {
      if (!m?.label) continue;
      const key = norm(m.label);
      if (!idx.has(key)) idx.set(key, m);
    }
  }
  return idx;
}

/** Most recent year with a parseable value for a metric. */
function latest(m: RatioMetric | undefined): { year: string; value: number } | null {
  if (!m || !Array.isArray(m.data)) return null;
  let best: { year: string; value: number } | null = null;
  for (const yv of m.data) {
    const v = nullNum(yv?.value);
    if (v === null) continue;
    const y = parseInt(yv.year, 10);
    if (isNaN(y)) continue;
    if (!best || y > parseInt(best.year, 10)) best = { year: yv.year, value: v };
  }
  return best;
}

/** Fetch current fundamental ratios for a single PSX ticker. Returns null if not found. */
export async function getAskAnalystFundamentals(
  symbol: string
): Promise<AskAnalystFundamentals | null> {
  try {
    const map = await getCompanyMap();
    const entry = map.get(symbol.toUpperCase());
    if (!entry) return null;

    const res = await fetch(`${BASE}/rationew/${entry.id}`, {
      headers: { "User-Agent": "PSX-Dashboard/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const sections: RatioSection[] = await res.json();
    if (!Array.isArray(sections) || sections.length === 0) return null;

    const idx = indexMetrics(sections);
    // First candidate label that exists wins (handles bank vs non-bank section shapes).
    const pick = (...labels: string[]) => {
      for (const l of labels) {
        const hit = latest(idx.get(norm(l)));
        if (hit) return hit;
      }
      return null;
    };

    const pe = pick("PER", "P/E", "PE Ratio");
    const pbv = pick("PBV", "P/BV");
    const div = pick("Div Yield", "Dividend Yield");
    const roe = pick("ROE");
    const de = pick("Debt To Equity", "Debt/Equity");
    const eps = pick("EPS");
    const nm = pick("Net Margin", "Net Profit Margin");
    const rev = pick("Revenue Growth");
    const payout = pick("Payout Ratio");

    const years = [pe, pbv, div, roe, eps].filter(Boolean) as { year: string }[];
    const fiscalYear =
      years.length > 0
        ? years.reduce((a, b) => (parseInt(b.year, 10) > parseInt(a.year, 10) ? b : a)).year
        : null;

    const out: AskAnalystFundamentals = {
      symbol: symbol.toUpperCase(),
      companyName: entry.name ?? symbol,
      sector: entry.sector ?? "",
      fiscalYear,
      pe: pe?.value ?? null,
      pbv: pbv?.value ?? null,
      dividendYield: div?.value ?? null,
      roe: roe?.value ?? null,
      // askanalyst reports Debt-To-Equity as a percent (e.g. 47.9); store as a ratio (0.48x).
      debtToEquity: de ? de.value / 100 : null,
      eps: eps?.value ?? null,
      netMargin: nm?.value ?? null,
      revenueGrowth: rev?.value ?? null,
      payoutRatio: payout?.value ?? null,
    };

    // If nothing useful parsed, treat as no data.
    if (out.pe === null && out.pbv === null && out.dividendYield === null && out.roe === null && out.eps === null) {
      return null;
    }
    return out;
  } catch {
    return null;
  }
}

/** Fetch fundamentals for multiple tickers concurrently. */
export async function getMultipleFundamentals(
  symbols: string[]
): Promise<Map<string, AskAnalystFundamentals>> {
  const results = await Promise.allSettled(
    symbols.map((s) => getAskAnalystFundamentals(s))
  );
  const map = new Map<string, AskAnalystFundamentals>();
  for (let i = 0; i < symbols.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      map.set(symbols[i].toUpperCase(), r.value);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Helpers for building AI prompt context from fundamentals
// ---------------------------------------------------------------------------

/**
 * Format a compact one-line fundamentals summary for AI prompt injection.
 * e.g. "PE 8.2x | PBV 1.1x | ROE 14.0% | D/E 0.40 | Div 6.1%"
 */
export function fundamentalsPromptLine(f: AskAnalystFundamentals): string {
  const parts: string[] = [];
  if (f.pe !== null) parts.push(`PE ${f.pe.toFixed(1)}x`);
  if (f.pbv !== null) parts.push(`PBV ${f.pbv.toFixed(1)}x`);
  if (f.roe !== null) parts.push(`ROE ${f.roe.toFixed(1)}%`);
  if (f.debtToEquity !== null) parts.push(`D/E ${f.debtToEquity.toFixed(2)}`);
  if (f.dividendYield !== null && f.dividendYield > 0)
    parts.push(`Div ${f.dividendYield.toFixed(1)}%`);
  return parts.join(" | ");
}
