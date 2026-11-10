import { NextRequest, NextResponse } from "next/server";
import { getCompanyPage } from "@/lib/psx-company";

/** GET /api/company?symbol=MEBL — PSX's public company page as structured data. */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase().trim() ?? "";
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return NextResponse.json({ error: "valid symbol query param required" }, { status: 400 });
  }
  try {
    const { value, stale, fetchedAt } = await getCompanyPage(symbol);
    return NextResponse.json(
      { company: value, stale, fetchedAt: new Date(fetchedAt).toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Company page unavailable";
    return NextResponse.json({ error: msg }, { status: / 404$/.test(msg) ? 404 : 502 });
  }
}
