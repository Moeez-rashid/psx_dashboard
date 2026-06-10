import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/psx";

/** GET /api/sparklines?symbols=OGDC,LUCK,FFC
 *  Returns the last 30 EOD closes per symbol (oldest first) for mini charts.
 *  PSX history responses are cached 1h by lib/psx, so this stays cheap.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = [...new Set(
    raw.split(",").map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9]{2,10}$/.test(s))
  )].slice(0, 30);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query param required" }, { status: 400 });
  }

  const out: Record<string, number[]> = {};
  await Promise.allSettled(
    symbols.map(async sym => {
      const history = await getHistory(sym); // newest first
      const closes = history.slice(0, 30).map(p => p.price).reverse();
      if (closes.length >= 5) out[sym] = closes;
    })
  );

  return NextResponse.json(out);
}
