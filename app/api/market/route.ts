import { NextResponse } from "next/server";
import { getAllStocks } from "@/lib/psx";

export interface MarketMover {
  symbol: string;
  sector: string;
  price: number;
  changePercent: number;
  volume: number;
}

/** GET /api/market
 *  Market overview computed from the live market-watch scrape.
 *  Requires no AI key — powers the landing experience for new visitors.
 */
export async function GET() {
  try {
    const all = await getAllStocks();
    // Tradeable rows only: real price and some liquidity, skip penny noise
    const active = all.filter(s => s.currentPrice > 0 && s.volume > 0);

    const advancing = active.filter(s => s.changePercent > 0).length;
    const declining = active.filter(s => s.changePercent < 0).length;
    const unchanged = active.length - advancing - declining;

    const liquid = active.filter(s => s.volume >= 50_000 && s.currentPrice >= 5);
    const slim = (s: typeof all[0]): MarketMover => ({
      symbol: s.symbol,
      sector: s.sector,
      price: s.currentPrice,
      changePercent: s.changePercent,
      volume: s.volume,
    });

    // 15 per list: the strip shows 5 collapsed, "View all" reveals the rest client-side
    const gainers = [...liquid].sort((a, b) => b.changePercent - a.changePercent).slice(0, 15).map(slim);
    const losers = [...liquid].sort((a, b) => a.changePercent - b.changePercent).slice(0, 15).map(slim);
    const mostActive = [...active]
      .sort((a, b) => b.volume * b.currentPrice - a.volume * a.currentPrice)
      .slice(0, 15)
      .map(slim);

    return NextResponse.json({
      breadth: { advancing, declining, unchanged, total: active.length },
      gainers,
      losers,
      mostActive,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Market fetch failed" },
      { status: 500 }
    );
  }
}
