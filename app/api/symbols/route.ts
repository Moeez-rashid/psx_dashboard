import { NextResponse } from "next/server";
import { getAllStocks } from "@/lib/psx";
import { getAllCompanyProfiles } from "@/lib/askanalyst";

/** GET /api/symbols
 *  Slim list of every listed symbol for the ticker autocomplete, plus the
 *  registered company name where askanalyst has one — the Deep Dive search
 *  box matches on either. `name` is best-effort: a symbol missing from
 *  askanalyst's list still gets a row, just without one.
 *  [{ s: "OGDC", sec: "0820", p: 316.68, name: "Oil & Gas Development Company Limited" }, ...]
 */
export async function GET() {
  try {
    const [all, profiles] = await Promise.all([
      getAllStocks(),
      getAllCompanyProfiles().catch(() => []),
    ]);
    const nameBySymbol = new Map(profiles.map((p) => [p.symbol, p.name]));
    const list = all
      .filter(s => s.symbol && s.currentPrice > 0)
      .map(s => ({
        s: s.symbol.toUpperCase(),
        sec: s.sector,
        p: s.currentPrice,
        name: nameBySymbol.get(s.symbol.toUpperCase()) ?? null,
      }));
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
