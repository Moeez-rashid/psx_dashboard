import Anthropic from "@anthropic-ai/sdk";
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
 * Pass 1: Reason over pre-fetched Pakistan news headlines and
 * identify which PSX sectors are affected. No web search — free.
 */
export async function getNewsAnalysis(
  config: ProviderConfig,
  newsText: string
): Promise<NewsAnalysis> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const resp = await client.messages.create({
    model: config.model ?? "claude-sonnet-4-5",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a Pakistan stock market analyst. Based on the following news headlines and market data from Pakistani sources today, identify the macro conditions and which PSX sectors are affected.

NEWS AND MARKET DATA:
${newsText}

Return ONLY this JSON (no markdown, no preamble):
{
  "summary": "2-3 sentence macro overview of current Pakistan market conditions",
  "detailedNarrative": "4-6 sentence paragraph covering: (1) the current macro situation with specific figures where available (PKR rate, oil price, SBP policy rate, inflation %, GDP etc.), (2) what is causing it — global triggers and domestic factors, (3) which sectors benefit most and which face headwinds with specific reasons, (4) near-term market outlook and key risks to watch",
  "affectedSectors": [
    {
      "sectorName": "Oil & Gas",
      "sectorCode": "0820",
      "impact": "NEGATIVE",
      "reason": "Global oil prices down 3% on demand concerns"
    }
  ],
  "globalFactors": ["Oil -3% on demand fears", "USD/PKR 278 stable", "IMF tranche approved $1.1B"]
}

Rules:
- Only include sectors with clear, specific news-driven impact — max 5 sectors
- impact must be: POSITIVE, NEGATIVE, or NEUTRAL
- sectorCode must be one of: 0801 0804 0805 0807 0808 0809 0810 0812 0819 0820 0821 0822 0823 0824 0825 0826 0828 0829
- globalFactors: short phrases about global/macro items (oil, USD, rates, geopolitics)`,
      },
    ],
  });

  const text = (resp.content || [])
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  return (
    extractJSON<NewsAnalysis>(text) ?? {
      summary: "Unable to analyze news.",
      affectedSectors: [],
      globalFactors: [],
    }
  );
}

/**
 * Pass 2: Given technically-filtered stocks + news context, return final 1-8 picks.
 * No web search — AI reasons entirely over provided data.
 */
export async function getStockSignals(
  config: ProviderConfig,
  stockContext: string,
  newsContext: string
): Promise<AISignal[]> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const resp = await client.messages.create({
    model: config.model ?? "claude-sonnet-4-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a PSX Shariah-compliant swing trading analyst. Build today's ranked slate of 5-8 signals from the list below for short-term swing trades (days to 2 weeks). Return fewer than 5 only when fewer than 5 stocks are listed.

MACRO CONTEXT (from today's Pakistan news):
${newsContext}

TECHNICALLY FILTERED STOCKS (already passed RSI/EMA/volume screening):
${stockContext}

Only recommend stocks where:
- The macro/news context supports the sector
- Technicals confirm the setup (strong RSI momentum, EMA trend, volume)
- There is a clear catalyst or setup reason

Return ONLY a JSON array (no markdown, no preamble):
[{
  "ticker": "MEBL",
  "signal": "BUY",
  "confidence": 78,
  "reason": "Islamic bank benefits from SBP rate cut, volume spike confirms",
  "newsHeadline": "SBP cuts rate by 100bps boosting banking sector",
  "catalysts": ["Rate cut reduces funding costs", "Volume 2.3x above average", "RSI at 38 oversold"],
  "risks": ["Broader market weakness", "Rupee volatility"],
  "suggestedEntry": "PKR 308-312 on any dip"
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

newsHeadline: copy a headline verbatim from MACRO CONTEXT only if it directly concerns this stock or its sector; otherwise exactly "No recent news". Never invent headlines.

Be direct. If you would not buy a stock right now, say WATCH or AVOID.`,
      },
    ],
  });

  const text = (resp.content || [])
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  return extractJSON<AISignal[]>(text) ?? [];
}
