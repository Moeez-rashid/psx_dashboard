import { NextRequest, NextResponse } from "next/server";
import { getCompanyPage, type Announcement } from "@/lib/psx-company";

export const maxDuration = 60;

const MAX_SYMBOLS = 30;
const BATCH = 5;

/** GET /api/events?symbols=MEBL,LUCK
 *  Company announcements filed with PSX for the given symbols, newest first —
 *  dividends, book closures, results, board meetings — each with its PDF.
 */
export async function GET(req: NextRequest) {
  const symbols = [...new Set(
    (req.nextUrl.searchParams.get("symbols") ?? "")
      .split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{2,10}$/.test(s))
  )].slice(0, MAX_SYMBOLS);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query param required" }, { status: 400 });
  }

  const events: Announcement[] = [];
  const failed: string[] = [];
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map((s) => getCompanyPage(s)));
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") events.push(...r.value.value.announcements);
      else failed.push(batch[j]);
    });
  }
  events.sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol));

  return NextResponse.json(
    { events, failed, timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } }
  );
}
