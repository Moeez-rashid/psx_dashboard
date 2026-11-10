/**
 * Market-level views from PSX's public pages: every index, the exchange's
 * own market status/breadth/turnover line, and the circuit-breaker board.
 */

import * as cheerio from "cheerio";
import { cached, tracked, type Cached } from "./cache";
import { parseNum, psxPage } from "./psx-http";

export interface IndexSnapshot {
  value: number;
  change: number;
  changePercent: number;
}

export interface IndexRow extends IndexSnapshot {
  code: string;   // "KSE100", "KMI30", ...
  high: number;
  low: number;
}

export interface MarketStatus {
  /** PSX's own label for the regular market: "Open", "Closed", "Pre-Open", ... */
  state: string;
  isOpen: boolean;
  /** Verbatim date/time PSX stamps on the summary, e.g. "Nov 10, 2026" / "4:47 PM". */
  date: string;
  time: string;
  trades: number;
  advancing: number;
  declining: number;
  unchanged: number;
  volume: number;   // shares, whole exchange
  value: number;    // PKR, whole exchange
}

export interface CircuitRow {
  symbol: string;
  ldcp: number;
  price: number;
  changePercent: number;
  volume: number;
}

export interface CircuitBoard {
  upper: CircuitRow[];
  lower: CircuitRow[];
}

function tableRows($: cheerio.CheerioAPI, tbl: ReturnType<cheerio.CheerioAPI>): { head: string[]; rows: string[][] } {
  const head = tbl.find("thead th").map((_, el) => $(el).text().replace(/\s+/g, " ").trim().toLowerCase()).get();
  const rows = tbl.find("tbody tr").map((_, tr) => [
    $(tr).find("td").map((_, td) => $(td).text().replace(/\s+/g, " ").trim()).get(),
  ]).get() as string[][];
  return { head, rows };
}

export function parseIndices(html: string): IndexRow[] {
  const $ = cheerio.load(html);
  const out: IndexRow[] = [];
  $("table").each((_, t) => {
    const { head, rows } = tableRows($, $(t));
    const c = (n: string) => head.findIndex((h) => h === n || h.startsWith(n));
    const iCur = c("current"), iChg = c("change"), iPct = head.findIndex((h) => h.includes("%"));
    const iHigh = c("high"), iLow = c("low");
    if (iCur < 0 || iChg < 0) return;
    for (const r of rows) {
      // "HBLTTI (05-11-2026 18:30:00)" → "HBLTTI"
      const code = (r[0] ?? "").split(/\s|\(/)[0].toUpperCase();
      const value = parseNum(r[iCur]);
      if (!code || value <= 0 || out.some((x) => x.code === code)) continue;
      out.push({
        code, value,
        change: parseNum(r[iChg]),
        changePercent: iPct >= 0 ? parseNum(r[iPct]) : 0,
        high: iHigh >= 0 ? parseNum(r[iHigh]) : 0,
        low: iLow >= 0 ? parseNum(r[iLow]) : 0,
      });
    }
  });
  if (!out.some((r) => r.code === "KSE100")) throw new Error("PSX indices: KSE100 row not found");
  return out;
}

export function parseTradingPanel(html: string): MarketStatus {
  const $ = cheerio.load(html);
  let summary: Record<string, string> | null = null;
  let state = "";
  $("table").each((_, t) => {
    const { head, rows } = tableRows($, $(t));
    if (!rows.length) return;
    if (!summary && head.includes("advance") && head.includes("decline")) {
      summary = Object.fromEntries(head.map((h, i) => [h, rows[0][i] ?? ""]));
    } else if (!state && head[0] === "market" && head[1] === "state" && /^regular$/i.test(rows[0][0] ?? "")) {
      state = rows[0][1] ?? "";
    }
  });
  if (!summary) throw new Error("PSX trading panel: summary table not found");
  const s = summary as Record<string, string>;
  return {
    state: state || "Unknown",
    isOpen: /^open$/i.test(state),
    date: s["date"] ?? "",
    time: s["time"] ?? "",
    trades: parseNum(s["total trades"]),
    advancing: parseNum(s["advance"]),
    declining: parseNum(s["decline"]),
    unchanged: parseNum(s["unchanged"]),
    volume: parseNum(s["exchange volume"]),
    value: parseNum(s["exchange value"]),
  };
}

export function parseCircuitBreakers(html: string): CircuitBoard {
  const $ = cheerio.load(html);
  const all: CircuitRow[] = [];
  $("table").each((_, t) => {
    const { head, rows } = tableRows($, $(t));
    const c = (n: string) => head.indexOf(n);
    const iSym = c("symbol"), iCur = c("current"), iPct = head.findIndex((h) => h.includes("%"));
    if (iSym < 0 || iCur < 0 || iPct < 0) return;
    for (const r of rows) {
      const symbol = (r[iSym] ?? "").toUpperCase();
      if (!symbol) continue;
      all.push({
        symbol,
        ldcp: parseNum(r[c("ldcp")]),
        price: parseNum(r[iCur]),
        changePercent: parseNum(r[iPct]),
        volume: parseNum(r[c("volume")]),
      });
    }
  });
  // Split by direction rather than by table position, so a layout swap can't mislabel them.
  return {
    upper: all.filter((r) => r.changePercent > 0).sort((a, b) => b.volume - a.volume),
    lower: all.filter((r) => r.changePercent < 0).sort((a, b) => b.volume - a.volume),
  };
}

export function getIndices(): Promise<Cached<IndexRow[]>> {
  return cached("psx:indices", 60_000, () =>
    tracked("psx-indices", async () => parseIndices(await psxPage("/indices", 60)))
  );
}

export function getMarketStatus(): Promise<Cached<MarketStatus>> {
  return cached("psx:status", 60_000, () =>
    tracked("psx-trading-panel", async () => parseTradingPanel(await psxPage("/trading-panel", 60)))
  );
}

export function getCircuitBoard(): Promise<Cached<CircuitBoard>> {
  return cached("psx:circuit", 120_000, () =>
    tracked("psx-circuit-breakers", async () => parseCircuitBreakers(await psxPage("/circuit-breakers", 120)))
  );
}
