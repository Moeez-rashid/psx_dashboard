import { NextResponse } from "next/server";
import { getAllStocks, type StockQuote } from "@/lib/psx";
import { getIndices, getMarketStatus, getCircuitBoard } from "@/lib/psx-market";
import { resolveSectorName } from "@/lib/sectors";

export const maxDuration = 60;

export interface MarketMover {
  symbol: string;
  sector: string;
  price: number;
  changePercent: number;
  volume: number;
  shariah?: boolean;
}

export interface SectorPerformance {
  code: string;
  name: string;
  /** Market-cap-weighted average day change, %. */
  changePercent: number;
  advancing: number;
  declining: number;
  count: number;
  marketCap: number;
  /** Largest absolute mover by market cap contribution, for the tile caption. */
  leader: string | null;
}

function sectorPerformance(stocks: StockQuote[]): SectorPerformance[] {
  const by = new Map<string, StockQuote[]>();
  for (const s of stocks) {
    if (!s.sector || !(s.marketCap && s.marketCap > 0)) continue;
    const list = by.get(s.sector);
    if (list) list.push(s); else by.set(s.sector, [s]);
  }
  const out: SectorPerformance[] = [];
  for (const [code, list] of by) {
    const cap = list.reduce((a, s) => a + (s.marketCap ?? 0), 0);
    if (cap <= 0 || list.length < 2) continue;
    const weighted = list.reduce((a, s) => a + s.changePercent * (s.marketCap ?? 0), 0) / cap;
    const leader = [...list].sort((a, b) =>
      Math.abs(b.changePercent * (b.marketCap ?? 0)) - Math.abs(a.changePercent * (a.marketCap ?? 0)))[0];
    out.push({
      code, name: resolveSectorName(code),
      changePercent: Number(weighted.toFixed(2)),
      advancing: list.filter((s) => s.changePercent > 0).length,
      declining: list.filter((s) => s.changePercent < 0).length,
      count: list.length, marketCap: cap,
      leader: leader?.symbol ?? null,
    });
  }
  return out.sort((a, b) => b.marketCap - a.marketCap);
}

/** GET /api/market
 *  Market overview from PSX's public pages. Requires no AI key.
 *  Each block degrades independently: a failed source yields null for its
 *  block rather than failing the whole response.
 */
export async function GET() {
  const [stocksR, indicesR, statusR, circuitR] = await Promise.allSettled([
    getAllStocks(), getIndices(), getMarketStatus(), getCircuitBoard(),
  ]);

  if (stocksR.status === "rejected" && indicesR.status === "rejected") {
    const err = stocksR.reason;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Market fetch failed" },
      { status: 502 }
    );
  }

  const all = stocksR.status === "fulfilled" ? stocksR.value : [];
  const indices = indicesR.status === "fulfilled" ? indicesR.value.value : [];
  const status = statusR.status === "fulfilled" ? statusR.value.value : null;
  const circuit = circuitR.status === "fulfilled" ? circuitR.value.value : null;

  const active = all.filter((s) => s.currentPrice > 0 && s.volume > 0);
  const liquid = active.filter((s) => s.volume >= 50_000 && s.currentPrice >= 5);
  const slim = (s: StockQuote): MarketMover => ({
    symbol: s.symbol, sector: s.sector, price: s.currentPrice,
    changePercent: s.changePercent, volume: s.volume, shariah: s.shariah,
  });

  const kse = indices.find((i) => i.code === "KSE100");
  // PSX's own advance/decline line when available; otherwise derived from the list.
  const breadth = status && status.advancing + status.declining > 0
    ? { advancing: status.advancing, declining: status.declining, unchanged: status.unchanged, total: status.advancing + status.declining + status.unchanged }
    : (() => {
        const advancing = active.filter((s) => s.changePercent > 0).length;
        const declining = active.filter((s) => s.changePercent < 0).length;
        return { advancing, declining, unchanged: active.length - advancing - declining, total: active.length };
      })();

  return NextResponse.json({
    breadth,
    kse100: kse ? { value: kse.value, change: kse.change, changePercent: kse.changePercent } : null,
    gainers: [...liquid].sort((a, b) => b.changePercent - a.changePercent).slice(0, 15).map(slim),
    losers: [...liquid].sort((a, b) => a.changePercent - b.changePercent).slice(0, 15).map(slim),
    mostActive: [...active].sort((a, b) => b.volume * b.currentPrice - a.volume * a.currentPrice).slice(0, 15).map(slim),
    indices,
    status,
    sectors: sectorPerformance(all),
    circuit,
    /** Session the volume figures belong to (YYYY-MM-DD). */
    sessionDate: all.find((s) => s.sessionDate)?.sessionDate ?? null,
    timestamp: new Date().toISOString(),
  }, { headers: { "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120" } });
}
