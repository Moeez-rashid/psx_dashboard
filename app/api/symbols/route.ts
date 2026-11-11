import { NextResponse } from "next/server";
import { getAllStocks } from "@/lib/psx";

/** GET /api/symbols
 *  Slim list of every listed symbol for autocomplete and quick search.
 *  [{ s: "OGDC", sec: "0820", p: 316.68, name: "Oil & Gas Development Company Limited", sh: true }, ...]
 */
export async function GET() {
  try {
    const all = await getAllStocks();
    const list = all
      .filter((s) => s.symbol && s.currentPrice > 0)
      .map((s) => ({ s: s.symbol, sec: s.sector, p: s.currentPrice, name: s.name ?? null, sh: s.shariah === true }));
    return NextResponse.json(list, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Symbol list failed" },
      { status: 502 }
    );
  }
}
