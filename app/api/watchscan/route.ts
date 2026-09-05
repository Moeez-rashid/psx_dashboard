/**
 * POST /api/watchscan
 * Runs a targeted AI analysis on a specific list of tickers (e.g. your watchlist).
 * Same two-pass pipeline as /api/scan but scoped to the provided tickers only —
 * no KMI-30 expansion, no sector broadening.
 *
 * Body: { tickers: string[], provider, apiKey, model? }
 * Returns: { signals: AISignal[], newsAnalysis: NewsAnalysis, technicalData: TechnicalScore[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/psx";
import { scoreStock } from "@/lib/technicals";
import { fetchPakistanNews } from "@/lib/news-fetcher";
import { getNewsAnalysis, getStockSignals, type ProviderConfig } from "@/lib/providers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tickers, provider, apiKey, model } = body as {
      tickers: string[];
      provider: string;
      apiKey: string;
      model?: string;
    };

    if (!provider || !apiKey || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { error: "tickers (array), provider, and apiKey are required" },
        { status: 400 }
      );
    }

    const config: ProviderConfig = {
      provider: provider as ProviderConfig["provider"],
      apiKey,
      model,
    };

    // Pass 1 — fetch news and build macro context
    const rawNews = await fetchPakistanNews();
    const newsAnalysis = await getNewsAnalysis(config, rawNews);

    // Score each ticker technically (in parallel, minVolume=0 so nothing filtered)
    const settled = await Promise.allSettled(
      tickers.map(async (ticker) => {
        const history = await getHistory(ticker.toUpperCase().trim());
        return scoreStock(ticker.toUpperCase().trim(), history, 0);
      })
    );

    const scored = settled
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.technicalScore - a.technicalScore);

    if (scored.length === 0) {
      return NextResponse.json({ error: "Not enough price history for any ticker" }, { status: 404 });
    }

    // Build prompt context
    const stockContext = scored
      .map((s) =>
        `${s.symbol}: score=${s.technicalScore}/100 [${s.technicalSignal}] ` +
        `RSI=${s.rsi.toFixed(1)} EMA20=${s.ema20.toFixed(2)} EMA50=${s.ema50.toFixed(2)} ` +
        `vol=${s.volumeRatio.toFixed(2)}x | ${s.reasons.slice(0, 2).join("; ")}`
      )
      .join("\n");

    const newsContext = [
      `Macro: ${newsAnalysis.summary}`,
      ...newsAnalysis.affectedSectors.map(
        (s) => `${s.sectorName} [${s.impact}]: ${s.reason}`
      ),
    ].join("\n");

    // Pass 2 — AI generates signals for these specific tickers
    const rawSignals = await getStockSignals(config, stockContext, newsContext);
    // Keep only signals for tickers we actually requested
    const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
    const signals = rawSignals.filter((s) => tickerSet.has(s.ticker.toUpperCase()));

    return NextResponse.json({ signals, newsAnalysis, technicalData: scored });
  } catch (err) {
    console.error("[/api/watchscan]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Watchlist scan failed" },
      { status: 500 }
    );
  }
}
