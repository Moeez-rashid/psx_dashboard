import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/psx";
import { scoreStock } from "@/lib/technicals";

// A cold instance may need to load the session store before answering.
export const maxDuration = 60;

/** GET /api/technicals?symbol=FCCL
 *  Returns TechnicalScore for a single symbol.
 *  Used by the Watchlist to fetch EMA/RSI/volume data per ticker.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol query param required" }, { status: 400 });
  }
  try {
    const history = await getHistory(symbol);
    const score = scoreStock(symbol, history, 0); // minVolume=0 so nothing is filtered out
    if (!score) {
      return NextResponse.json({ error: "Not enough price history" }, { status: 404 });
    }
    return NextResponse.json(score);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch technicals" },
      { status: 500 }
    );
  }
}
