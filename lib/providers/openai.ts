import OpenAI from "openai";
import type { AISignal, NewsAnalysis, ProviderConfig } from "./types";

function extractJSON<T>(text: string): T | null {
  try {
    const match =
      text.match(/```json\s*([\s\S]*?)```/) ||
      text.match(/(\[[\s\S]*\])/) ||
      text.match(/(\{[\s\S]*\})/);
    if (match) return JSON.parse(match[1]);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Pass 1: Reason over pre-fetched Pakistan news headlines.
 * Uses standard Chat Completions API — no web_search_preview tool,
 * so no extra cost beyond normal token usage.
 */
export async function getNewsAnalysis(
  config: ProviderConfig,
  newsText: string
): Promise<NewsAnalysis> {
  const client = new OpenAI({ apiKey: config.apiKey });

  const resp = await client.chat.completions.create({
    model: config.model ?? "gpt-4o-mini",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a Pakistan stock market analyst. Based on the following news headlines and market data from Pakistani sources today, identify macro conditions and which PSX sectors are affected.

NEWS AND MARKET DATA:
${newsText}

Return ONLY this JSON (no markdown, no preamble):
{
  "summary": "2-3 sentence macro overview of current Pakistan market conditions",
  "detailedNarrative": "4-6 sentence paragraph covering: (1) the current macro situation with specific figures where available (PKR rate, oil price, SBP policy rate, inflation %, GDP etc.), (2) what is causing it — global triggers and domestic factors, (3) which sectors benefit most and which face headwinds with specific reasons, (4) near-term market outlook and key risks to watch",
  "affectedSectors": [
    { "sectorName": "Oil & Gas", "sectorCode": "0820", "impact": "NEGATIVE", "reason": "brief reason with figure if available" }
  ],
  "globalFactors": ["Oil -3% on demand fears", "USD/PKR 278 stable", "IMF tranche $1.1B"]
}

Rules:
- Only include sectors with clear, news-driven impact — max 5 sectors
- impact: POSITIVE | NEGATIVE | NEUTRAL
- sectorCode must be one of: 0801 0804 0805 0807 0808 0809 0810 0812 0819 0820 0821 0822 0823 0824 0825 0826 0828 0829`,
      },
    ],
  });

  const text = resp.choices[0]?.message?.content ?? "";
  return (
    extractJSON<NewsAnalysis>(text) ?? {
      summary: "Unable to analyze news via OpenAI.",
      affectedSectors: [],
      globalFactors: [],
    }
  );
}

/** Pass 2: AI reasons over provided technical data + news context. */
export async function getStockSignals(
  config: ProviderConfig,
  stockContext: string,
  newsContext: string
): Promise<AISignal[]> {
  const client = new OpenAI({ apiKey: config.apiKey });

  const resp = await client.chat.completions.create({
    model: config.model ?? "gpt-4o-mini",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a PSX Shariah-compliant swing trading analyst. Build today's ranked slate of 5-8 signals for short-term swing trades (days to 2 weeks). Return fewer than 5 only when fewer than 5 stocks are listed below.

MACRO CONTEXT (from today's Pakistan news):
${newsContext}

TECHNICALLY FILTERED STOCKS (passed RSI/EMA/volume screening):
${stockContext}

Only recommend stocks where macro context supports the sector AND technicals confirm the setup.

Return ONLY a JSON array (no markdown):
[{
  "ticker": "MEBL",
  "signal": "BUY",
  "confidence": 78,
  "reason": "Islamic bank benefits from rate cut, volume spike confirms",
  "newsHeadline": "SBP cuts rate 100bps",
  "catalysts": ["Rate cut reduces costs", "Volume 2.3x average", "RSI oversold"],
  "risks": ["Market weakness", "Rupee risk"],
  "suggestedEntry": "PKR 308-312"
}]
signal: BUY | STRONG_BUY | WATCH | HOLD | SELL | AVOID

confidence — calibrate against evidence, do not guess:
  80-95 = technical score >= 60 AND a specific fresh catalyst for this stock or its sector AND supportive macro (rare; never exceed 95)
  65-79 = clean technical setup with sector/macro support, but no stock-specific catalyst
  50-64 = decent setup with one clear caveat (thin volume, mixed macro, stretched RSI)
  under 50 = speculative — use WATCH or HOLD rather than BUY
Keep confidence within 25 points of the stock's technical score.

Slate rules:
- Rank strongest BUY/STRONG_BUY first, then early or pullback WATCH candidates; include HOLD/AVOID for well-known names whose setup is deteriorating. A useful daily slate is 5-8 entries, not 1-2.
- Never rate BUY or STRONG_BUY when RSI is above 70 or price is stretched more than 8% above EMA20 — rate WATCH with a pullback entry instead.
- Prefer sector diversity: avoid three or more picks from one sector unless conviction is exceptional.

newsHeadline: copy a headline verbatim from MACRO CONTEXT only if it directly concerns this stock or its sector; otherwise exactly "No recent news". Never invent headlines.`,
      },
    ],
  });

  const text = resp.choices[0]?.message?.content ?? "";
  return extractJSON<AISignal[]>(text) ?? [];
}
