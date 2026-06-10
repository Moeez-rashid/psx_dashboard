import { NextResponse } from "next/server";
import { getAllStocks } from "@/lib/psx";

/** GET /api/symbols
 *  Slim list of every listed symbol for the ticker autocomplete.
 *  [{ s: "OGDC", sec: "0820", p: 316.68 }, ...]
 */
export async function GET() {
  try {
    const all = await getAllStocks();
    const list = all
      .filter(s => s.symbol && s.currentPrice > 0)
      .map(s => ({ s: s.symbol.toUpperCase(), sec: s.sector, p: s.currentPrice }));
    return NextResponse.json(list, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Symbol list failed" },
      { status: 500 }
    );
  }
}
