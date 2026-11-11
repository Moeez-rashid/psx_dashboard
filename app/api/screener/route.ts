import { NextResponse } from "next/server";
import { getAllStocks } from "@/lib/psx";
import { getAllHistories, HISTORY_SESSIONS } from "@/lib/psx-eod";
import { scoreStock } from "@/lib/technicals";

export const maxDuration = 60;

/** One row of the full-market screener. Short keys: ~750 rows per response. */
export interface ScreenerRow {
  s: string;            // symbol
  n: string;            // company name
  sec: string;          // PSX sector code
  idx: string[];        // index memberships
  sh: boolean;          // Shariah-compliant (KMI All Share)
  p: number;            // price
  chg: number;          // day change %
  y1: number;           // 1-year change %
  mc: number;           // market cap, PKR
  pe: number;           // trailing P/E (0 = n/a)
  dy: number;           // dividend yield %
  av: number;           // 30-day average volume
  /** Deterministic Technical Score (lib/technicals.ts), null when the symbol
   *  has under 60 sessions of history or its price data is unusable. */
  ts: number | null;
  sig: string | null;   // technical signal
  rsi: number | null;
  fl: string[];         // XD / XB / XR
}

/** GET /api/screener — every listed equity with valuation + Technical Score. */
export async function GET() {
  try {
    const [stocks, histories] = await Promise.all([
      getAllStocks(),
      // History is an enrichment here: without it the screener still lists
      // every stock, just without technical columns.
      getAllHistories(HISTORY_SESSIONS.technicals).catch(() => null),
    ]);
    const rows: ScreenerRow[] = stocks.map((q) => {
      const hist = histories?.get(q.symbol);
      // minAvgVolume 0: illiquidity is the user's filter to apply, not a reason to hide the score.
      const tech = hist ? scoreStock(q.symbol, hist, 0) : null;
      return {
        s: q.symbol, n: q.name ?? q.symbol, sec: q.sector,
        idx: q.listedIn ? q.listedIn.split(",") : [],
        sh: q.shariah === true,
        p: q.currentPrice, chg: q.changePercent, y1: q.change1y ?? 0,
        mc: Math.round(q.marketCap ?? 0), pe: q.pe ?? 0, dy: q.dividendYield ?? 0,
        av: Math.round(q.avgVolume30d ?? 0),
        ts: tech?.technicalScore ?? null, sig: tech?.technicalSignal ?? null, rsi: tech?.rsi ?? null,
        fl: q.flags ?? [],
      };
    });
    return NextResponse.json(
      { rows, sessionDate: stocks.find((s) => s.sessionDate)?.sessionDate ?? null, technicals: histories !== null, timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Screener unavailable" },
      { status: 502 }
    );
  }
}
