import { NextRequest, NextResponse } from "next/server";
import { buildDeepDiveData } from "@/lib/deepdive";
import { resolveDeepDiveAnalysis, sanitizeError, type DeepDiveAIResult } from "@/lib/deepdive-ai";

/**
 * GET /api/deepdive?symbol=OGDC[&ai=1][&refresh=1]
 *
 * The full deterministic Deep Dive dataset for one ticker: identity,
 * Technical Score + supplementary indicators, valuation vs. sector and the
 * KMI-30 proxy, fundamental quality, multi-year fundamental history, market
 * context, company press mentions, and risk/liquidity.
 *
 * Deliberately thin — all aggregation lives in lib/deepdive.ts, all
 * calculation in the deterministic modules beneath it.
 *
 * AI interpretation is strictly additive and never load-bearing:
 *   - default:    cached interpretation only. A plain page view never triggers
 *                 a model call, so opening Deep Dive can't silently cost money.
 *   - ?ai=1       may generate on a cache miss — at most ONE model call.
 *   - ?refresh=1  discards the cached interpretation for this evidence version
 *                 and regenerates it (the "Re-analyze" path). Implies ai=1.
 *
 * The `ai` block always carries a status explaining itself, so a missing
 * interpretation is never ambiguous. No AI failure — missing key, provider
 * outage, malformed output, Redis down — can affect the deterministic
 * response or turn this endpoint into a 500.
 *
 * Missing data comes back as nulls with a stated reason, never as estimates,
 * so a 200 response can still legitimately contain empty sections.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const symbol = params.get("symbol")?.toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol query param required" }, { status: 400 });
  }
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return NextResponse.json({ error: `Invalid symbol: ${symbol}` }, { status: 400 });
  }

  const truthy = (v: string | null) => v === "1" || v === "true";
  const forceRefresh = truthy(params.get("refresh"));
  const generate = forceRefresh || truthy(params.get("ai"));

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

    // Belt and braces: resolveDeepDiveAnalysis already converts every failure
    // into a status rather than a throw, but the deterministic payload must
    // survive even an unforeseen bug in the AI layer.
    let ai: DeepDiveAIResult;
    try {
      ai = await resolveDeepDiveAnalysis(data, { generate, forceRefresh });
    } catch (err) {
      // Should not be reachable — resolveDeepDiveAnalysis already converts
      // every failure into a status — but if it ever is, the message still
      // gets the same redaction as every other error path in this layer.
      ai = {
        analysis: null,
        status: "provider-failed",
        detail: `AI interpretation failed: ${sanitizeError(err)}`,
        cached: false,
      };
    }

    return NextResponse.json({ ...data, ai });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deep Dive build failed" },
      { status: 500 }
    );
  }
}
