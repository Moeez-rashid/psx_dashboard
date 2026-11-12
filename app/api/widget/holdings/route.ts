import { NextResponse } from "next/server";
import { getQuotes } from "@/lib/psx";
import { getMarketStatus } from "@/lib/psx-market";
import { isPKTOpen } from "@/lib/format";
import { loadHoldings, syncKeyFrom, SyncUnavailableError } from "@/lib/holdings-sync";

// A cold instance may need to load the latest session file before answering.
export const maxDuration = 60;

/**
 * Everything the iPhone widget draws, computed here so the Scriptable script
 * stays dumb: the synced holdings valued at current PSX prices. A holding
 * with no price is listed in `missing` and left out of the totals — never
 * valued at a guess.
 */
export async function GET(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const key = syncKeyFrom(req);
  if (!key) return NextResponse.json({ error: "Missing or malformed sync key" }, { status: 400, headers });

  try {
    const synced = await loadHoldings(key);
    if (!synced) return NextResponse.json({ error: "No holdings stored for this key" }, { status: 404, headers });

    const [quotes, status] = await Promise.all([
      getQuotes(synced.holdings.map((h) => h.ticker)),
      getMarketStatus().then((s) => s.value).catch(() => null),
    ]);

    const rows = [];
    const missing: string[] = [];
    let value = 0, invested = 0, dayPnl = 0, prevValue = 0;
    for (const h of synced.holdings) {
      const q = quotes[h.ticker];
      if (!q || !(q.currentPrice > 0)) { missing.push(h.ticker); continue; }
      const v = q.currentPrice * h.shares;
      const cost = h.avgPrice * h.shares;
      const d = q.change * h.shares;
      value += v; invested += cost; dayPnl += d; prevValue += v - d;
      rows.push({
        ticker: h.ticker,
        shares: h.shares,
        price: q.currentPrice,
        changePercent: q.changePercent,
        value: Math.round(v),
        pnl: Math.round(v - cost),
        pnlPct: cost > 0 ? Number((((v - cost) / cost) * 100).toFixed(2)) : null,
        dayPnl: Math.round(d),
      });
    }
    rows.sort((a, b) => b.value - a.value);

    return NextResponse.json({
      asOf: new Date().toISOString(),
      holdingsUpdatedAt: synced.updatedAt,
      market: {
        open: status ? status.isOpen : isPKTOpen(),
        state: status?.state ?? (isPKTOpen() ? "Open" : "Closed"),
      },
      totals: {
        value: Math.round(value),
        invested: Math.round(invested),
        pnl: Math.round(value - invested),
        pnlPct: invested > 0 ? Number((((value - invested) / invested) * 100).toFixed(2)) : null,
        dayPnl: Math.round(dayPnl),
        dayPnlPct: prevValue > 0 ? Number(((dayPnl / prevValue) * 100).toFixed(2)) : null,
      },
      holdings: rows,
      missing,
    }, { headers });
  } catch (err) {
    if (err instanceof SyncUnavailableError) return NextResponse.json({ error: err.message }, { status: 503, headers });
    console.error("[/api/widget/holdings]", err);
    return NextResponse.json({ error: "Could not load prices" }, { status: 500, headers });
  }
}
