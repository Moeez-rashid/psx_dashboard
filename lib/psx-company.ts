/**
 * One company's public PSX page (dps.psx.com.pk/company/SYMBOL): the full
 * quote, trading limits, equity profile, the exchange's own financial
 * summary, and the company's announcements with links to the filed PDFs.
 */

import * as cheerio from "cheerio";
import { cached, tracked, type Cached } from "./cache";
import { PSX_BASE, parseNum, psxPage } from "./psx-http";

export type AnnouncementKind = "dividend" | "book-closure" | "results" | "board-meeting" | "agm" | "other";

export interface Announcement {
  symbol: string;
  date: string;          // YYYY-MM-DD
  title: string;
  kind: AnnouncementKind;
  pdfUrl: string | null;
}

export interface FinancialTable {
  /** Column labels, newest first — fiscal years ("2025") or quarters ("Q3 2026"). */
  periods: string[];
  rows: { label: string; values: (number | null)[] }[];
}

export interface CompanyPage {
  symbol: string;
  name: string;
  sectorName: string;
  /** Exchange markers shown beside the name: XD / XB / XR. */
  flags: string[];
  price: number | null;
  change: number | null;
  changePercent: number | null;
  /** "Fri, Nov 6, 2026 4:49 PM" — verbatim from PSX. */
  asOf: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  ldcp: number | null;
  circuitLow: number | null;
  circuitHigh: number | null;
  week52Low: number | null;
  week52High: number | null;
  peTtm: number | null;
  change1y: number | null;
  changeYtd: number | null;
  marketCap: number | null;   // PKR
  shares: number | null;
  freeFloatShares: number | null;
  freeFloatPct: number | null;
  description: string | null;
  website: string | null;
  fiscalYearEnd: string | null;
  annual: FinancialTable | null;
  quarterly: FinancialTable | null;
  ratios: FinancialTable | null;
  announcements: Announcement[];
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "Oct 28, 2026" → "2026-10-28" (null if unparseable). */
function isoDate(raw: string): string | null {
  const m = /([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/.exec(raw);
  if (!m) return null;
  const mon = MONTH_INDEX[m[1].toLowerCase()];
  if (mon === undefined) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** Deterministic classification from the filing's own title — no AI involved. */
export function classifyAnnouncement(title: string, tab: string): AnnouncementKind {
  const t = title.toLowerCase();
  if (/book closure/.test(t)) return "book-closure";
  if (/dividend|bonus|right shares|right issue|entitlement/.test(t)) return "dividend";
  if (/annual general meeting|\bagm\b|\beogm\b|extraordinary general/.test(t)) return "agm";
  if (/board meeting/.test(t) || tab === "Board Meetings") return "board-meeting";
  if (/financial results|quarterly report|annual report|accounts for the/.test(t) || tab === "Financial Results") return "results";
  return "other";
}

function numOrNull(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (!s || s === "-" || s === "—" || /^n\/?a$/i.test(s)) return null;
  const n = parseNum(s);
  return Number.isFinite(n) ? n : null;
}

export function parseCompanyPage(symbol: string, html: string): CompanyPage {
  const $ = cheerio.load(html);
  const quote = $("#quote");
  if (quote.length === 0) throw new Error(`PSX company ${symbol}: quote section missing`);

  const nameEl = quote.find(".quote__name").first();
  const flags = nameEl.find(".tag").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const name = nameEl.clone().children().remove().end().text().trim();

  // Stats inside the regular-market panel only — the futures panels repeat the same labels.
  const reg = quote.find('.tabs__panel[data-name="REG"]').first();
  const stat = (scope: ReturnType<typeof $>, label: RegExp): string | undefined => {
    let found: string | undefined;
    scope.find(".stats_item").each((_, el) => {
      if (found !== undefined) return;
      const l = $(el).find(".stats_label").text().replace(/\s+/g, " ").trim();
      if (label.test(l)) found = $(el).find(".stats_value").clone().children(".numRange").remove().end().text().replace(/\s+/g, " ").trim();
    });
    return found;
  };
  const range = (scope: ReturnType<typeof $>, label: RegExp): [number | null, number | null] => {
    let out: [number | null, number | null] = [null, null];
    scope.find(".stats_item").each((_, el) => {
      const l = $(el).find(".stats_label").text().replace(/\s+/g, " ").trim();
      if (!label.test(l)) return;
      const r = $(el).find(".numRange").first();
      const lo = Number(r.attr("data-low")), hi = Number(r.attr("data-high"));
      if (Number.isFinite(lo) && Number.isFinite(hi) && hi > 0) out = [lo, hi];
    });
    return out;
  };

  const [circuitLow, circuitHigh] = range(reg, /^circuit breaker/i);
  const [week52Low, week52High] = range(reg, /^52-week range/i);
  const equity = $("#equity");
  const marketCapK = numOrNull(stat(equity, /^market cap/i));
  const ffValues = equity.find(".stats_item").filter((_, el) => /^free float/i.test($(el).find(".stats_label").text().trim()))
    .map((_, el) => $(el).find(".stats_value").text().trim()).get();

  const table = (panel: ReturnType<typeof $>): FinancialTable | null => {
    const tbl = panel.find("table").first();
    if (tbl.length === 0) return null;
    const periods = tbl.find("thead th").slice(1).map((_, el) => $(el).text().trim()).get();
    const rows = tbl.find("tbody tr").map((_, tr) => {
      const tds = $(tr).find("td");
      return {
        label: tds.first().text().replace(/\s+/g, " ").trim(),
        values: tds.slice(1).map((_, td) => numOrNull($(td).text())).get() as (number | null)[],
      };
    }).get().filter((r) => r.label);
    return periods.length && rows.length ? { periods, rows } : null;
  };

  const announcements: Announcement[] = [];
  $("#announcements .tabs__panel").each((_, panel) => {
    const tab = $(panel).attr("data-name") ?? "";
    $(panel).find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      const date = isoDate(tds.eq(0).text());
      const title = tds.eq(1).text().replace(/\s+/g, " ").trim();
      if (!date || !title) return;
      const href = tds.eq(2).find('a[href$=".pdf"]').attr("href");
      announcements.push({
        symbol, date, title,
        kind: classifyAnnouncement(title, tab),
        pdfUrl: href ? (href.startsWith("http") ? href : `${PSX_BASE}${href}`) : null,
      });
    });
  });
  announcements.sort((a, b) => b.date.localeCompare(a.date));

  const profile = $("#profile");
  const headed = (head: RegExp): string | null => {
    let v: string | null = null;
    profile.find(".item__head").each((_, el) => {
      if (v === null && head.test($(el).text().trim())) v = $(el).next("p").text().replace(/\s+/g, " ").trim() || null;
    });
    return v;
  };

  const pctText = (re: RegExp) => {
    const v = stat(reg, re);
    return v === undefined ? null : numOrNull(v.replace("%", ""));
  };

  return {
    symbol,
    name: name || symbol,
    sectorName: quote.find(".quote__sector").text().trim(),
    flags,
    price: numOrNull(quote.find(".quote__close").first().text().replace(/Rs\.?/i, "")),
    change: numOrNull(quote.find(".change__value").first().text()),
    changePercent: numOrNull(quote.find(".change__percent").first().text().replace(/[()%]/g, "")),
    asOf: quote.find(".quote__date").first().text().replace(/^\^?\s*As of\s*/i, "").trim() || null,
    open: numOrNull(stat(reg, /^open$/i)),
    high: numOrNull(stat(reg, /^high$/i)),
    low: numOrNull(stat(reg, /^low$/i)),
    volume: numOrNull(stat(reg, /^volume$/i)),
    ldcp: numOrNull(stat(reg, /^ldcp$/i)),
    circuitLow, circuitHigh, week52Low, week52High,
    peTtm: numOrNull(stat(reg, /^p\/e ratio/i)),
    change1y: pctText(/^1-year change/i),
    changeYtd: pctText(/^ytd change/i),
    marketCap: marketCapK === null ? null : marketCapK * 1000,
    shares: numOrNull(stat(equity, /^shares$/i)),
    freeFloatShares: numOrNull(ffValues.find((v) => !v.includes("%"))),
    freeFloatPct: numOrNull(ffValues.find((v) => v.includes("%"))?.replace("%", "")),
    description: profile.find(".profile__item--decription p").first().text().replace(/\s+/g, " ").trim() || null,
    website: profile.find('.profile__item a[href^="http"]').first().attr("href") ?? null,
    fiscalYearEnd: headed(/^fiscal year end/i),
    annual: table($('#financials .tabs__panel[data-name="Annual"]')),
    quarterly: table($('#financials .tabs__panel[data-name="Quarterly"]')),
    ratios: table($("#ratios")),
    announcements,
  };
}

const SYMBOL_RE = /^[A-Z0-9]{2,10}$/;

/** Cached 3 minutes per symbol; serves the previous page (stale) if a refresh fails. */
export function getCompanyPage(symbol: string): Promise<Cached<CompanyPage>> {
  const sym = symbol.toUpperCase().trim();
  if (!SYMBOL_RE.test(sym)) return Promise.reject(new Error(`Invalid symbol "${symbol}"`));
  return cached(`psx:company:${sym}`, 3 * 60_000, () =>
    tracked("psx-company", async () => parseCompanyPage(sym, await psxPage(`/company/${sym}`, 180)))
  );
}
