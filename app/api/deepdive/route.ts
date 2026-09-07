import { NextRequest, NextResponse } from "next/server";
import { buildDeepDiveData } from "@/lib/deepdive";

/**
 * GET /api/deepdive?symbol=OGDC
 *
 * The full deterministic Deep Dive dataset for one ticker: identity,
 * Technical Score + supplementary indicators, valuation vs. sector and the
 * KMI-30 proxy, fundamental quality, multi-year fundamental history, market
 * context, company press mentions, and risk/liquidity.
 *
 * Deliberately thin — all aggregation lives in lib/deepdive.ts, all
 * calculation in the deterministic modules beneath it. No AI runs here; the
 * AI pass (Phase 4) will consume this response as pre-computed evidence.
 *
 * Missing data comes back as nulls with a stated reason, never as estimates,
 * so a 200 response can still legitimately contain empty sections.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol query param required" }, { status: 400 });
  }
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return NextResponse.json({ error: `Invalid symbol: ${symbol}` }, { status: 400 });
  }

  try {
    const data = await buildDeepDiveData(symbol);

    // Nothing resolved at all — no price history and no fundamentals — means
    // the ticker doesn't exist as far as our sources are concerned. That's a
    // 404, not an empty-but-successful Deep Dive.
    if (data.technical.historySessions === 0 && !data.fundamentals.available) {
      return NextResponse.json(
        { error: `No data found for ${symbol}`, degraded: data.meta.degraded },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deep Dive build failed" },
      { status: 500 }
    );
  }
}
