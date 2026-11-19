import { NextResponse } from "next/server";
import { getPreviousSuccess } from "@/lib/scan-store";

/**
 * GET /api/scan/previous?before=YYYY-MM-DD — the picks of the newest
 * successful scan before that trading date, in the order Signals shows them
 * (AI-annotated signals when present, otherwise the top 8 by Technical
 * Score). Lets Signals say what is new and what dropped off.
 */
export async function GET(req: Request) {
  const before = new URL(req.url).searchParams.get("before") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    return NextResponse.json({ error: "before=YYYY-MM-DD required" }, { status: 400 });
  }
  const prev = await getPreviousSuccess(before);
  const r = prev?.results;
  const tickers = r
    ? (r.signals.length > 0 ? r.signals.map((s) => s.ticker) : r.technicalData.slice(0, 8).map((t) => t.symbol))
    : [];
  return NextResponse.json(
    { scanDate: prev?.scanDate ?? null, tickers },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
  );
}
