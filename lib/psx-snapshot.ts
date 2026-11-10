/**
 * Whole-market snapshot from PSX's public stock screener page.
 *
 * One request returns every listed equity with its price, day change,
 * 1-year change, trailing P/E, dividend yield, market cap, free float,
 * 30-day average volume and — crucially — the indices it belongs to. Index
 * membership is what makes Shariah status a fact from the exchange
 * (KMI All Share / KMI-30 constituents) instead of a hand-maintained list.
 */

import { cached, tracked, type Cached } from "./cache";
import { psxPage } from "./psx-http";

export interface SnapshotRow {
  symbol: string;
  name: string;
  /** PSX numeric sector code, e.g. "0807". */
  sector: string;
  /** Index codes this symbol is a constituent of, e.g. ["ALLSHR","KMI30","KSE100"]. */
  indices: string[];
  marketCap: number;       // PKR
  price: number;
  changePercent: number;   // today
  change1y: number;        // %
  /** Trailing P/E; 0 when not meaningful (loss-making or not reported). */
  pe: number;
  dividendYield: number;   // %
  freeFloat: number;       // shares
  avgVolume30d: number;
  /** Constituent of the KMI All Share index — PSX's Shariah-compliant universe. */
  shariah: boolean;
}

const SOURCE = "psx-screener";
const round2 = (n: number) => Math.round(n * 100) / 100;

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

export function parseScreener(html: string): SnapshotRow[] {
  const table = /<table[\s\S]*?<\/table>/i.exec(html)?.[0];
  if (!table) throw new Error("PSX screener: table not found");

  // Map columns by their data-name so a reorder can't silently misread values.
  const head = /<tr>([\s\S]*?)<\/tr>/i.exec(table)?.[1] ?? "";
  const cols = [...head.matchAll(/<th[^>]*data-name="([^"]+)"/gi)].map((m) => m[1]);
  const idx = (name: string) => cols.indexOf(name);
  const need = ["symbol", "sector", "listed", "marketCap", "close", "percentChange"];
  for (const n of need) if (idx(n) < 0) throw new Error(`PSX screener: column "${n}" missing`);

  const rows: SnapshotRow[] = [];
  for (const m of table.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (cells.length < cols.length) continue;
    const text = (name: string) => decode((cells[idx(name)]?.[2] ?? "").replace(/<[^>]+>/g, "")).trim();
    const order = (name: string) => {
      const i = idx(name);
      if (i < 0) return 0;
      const v = /data-order="([^"]*)"/.exec(cells[i][1])?.[1];
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const symCell = cells[idx("symbol")][2];
    const symbol = (/<strong>([^<]+)<\/strong>/.exec(symCell)?.[1] ?? "").trim().toUpperCase();
    const price = order("close");
    if (!symbol || price <= 0) continue;
    const indices = text("listed").split(",").map((s) => s.trim()).filter(Boolean);
    rows.push({
      symbol,
      name: decode(/data-title="([^"]*)"/.exec(symCell)?.[1] ?? symbol),
      sector: text("sector"),
      indices,
      marketCap: order("marketCap"),
      price,
      changePercent: round2(order("percentChange")),
      change1y: round2(order("changeYear")),
      pe: round2(order("peRatio")),
      dividendYield: round2(order("dividendYield")),
      freeFloat: order("freeFloat"),
      avgVolume30d: order("volume30Avg"),
      shariah: indices.includes("KMIALLSHR"),
    });
  }
  if (rows.length < 100) throw new Error(`PSX screener: only ${rows.length} rows parsed`);
  return rows;
}

/** Cached 60s; on failure serves the previous snapshot (flagged stale) for up to a day. */
export function getSnapshot(): Promise<Cached<SnapshotRow[]>> {
  return cached("psx:snapshot", 60_000, () =>
    tracked(SOURCE, async () => parseScreener(await psxPage("/screener", 60)))
  );
}

export async function getSnapshotMap(): Promise<Map<string, SnapshotRow>> {
  const { value } = await getSnapshot();
  return new Map(value.map((r) => [r.symbol, r]));
}

/** Symbols currently in an index (e.g. "KMI30", "KSE100", "KMIALLSHR"). */
export async function getIndexConstituents(index: string): Promise<string[]> {
  const { value } = await getSnapshot();
  return value.filter((r) => r.indices.includes(index)).map((r) => r.symbol);
}
