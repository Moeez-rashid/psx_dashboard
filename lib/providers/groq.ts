/**
 * Groq provider — OpenAI-compatible API, completely free tier.
 * Models: GPT-OSS 120B, GPT-OSS 20B, Qwen3 27B (Llama 3.x retired by Groq 2026-06-17)
 * Free limits: 14,400 requests/day, 30 req/min — more than enough.
 * Get a key at: https://console.groq.com/keys
 */
import OpenAI from "openai";
import type { AISignal, NewsAnalysis, ProviderConfig } from "./types";

// Groq is fully OpenAI-compatible — same SDK, different base URL
const GROQ_BASE = "https://api.groq.com/openai/v1";

function extractJSON<T>(text: string): T | null {
  // Try direct parse first — works when API returns clean JSON (e.g. json_object mode)
  try { return JSON.parse(text); } catch {}
  // Extract from markdown code fence
  try {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) return JSON.parse(fence[1]);
  } catch {}
  // Find outermost JSON object (must come before array check to avoid greedy fragment matching)
  try {
    const obj = text.match(/\{[\s\S]*\}/);
    if (obj) return JSON.parse(obj[0]);
  } catch {}
  // Find outermost JSON array
  try {
    const arr = text.match(/\[[\s\S]*\]/);
    if (arr) return JSON.parse(arr[0]);
  } catch {}
  return null;
}

export async function getNewsAnalysis(
  config: ProviderConfig,
  newsText: string
): Promise<NewsAnalysis> {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: GROQ_BASE });

  const resp = await client.chat.completions.create({
    model: config.model ?? "openai/gpt-oss-120b",
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a Pakistan stock market analyst. Always respond with valid JSON only.",
      },
      {
        role: "user",
        content: `Based on the following news headlines and market data from Pakistani sources, analyse macro conditions and PSX sector impacts. If no news is available, use general Pakistan market knowledge.

NEWS AND MARKET DATA:
${newsText}

Respond with this exact JSON structure:
{
  "summary": "2-3 sentence macro overview of current Pakistan market conditions",
  "detailedNarrative": "4-6 sentence paragraph covering: (1) the current macro situation with specific figures where available (PKR rate, oil price, SBP policy rate, inflation %, GDP etc.), (2) what is causing it — global triggers and domestic factors, (3) which sectors benefit most and which face headwinds with specific reasons, (4) near-term market outlook and key risks to watch",
  "affectedSectors": [
    { "sectorName": "Oil & Gas", "sectorCode": "0820", "impact": "NEGATIVE", "reason": "brief reason with figure if available" }
  ],
  "globalFactors": ["Oil -3% on demand fears", "USD/PKR 278 stable", "IMF tranche approved $1.1B"]
}

Rules: max 5 sectors, impact must be POSITIVE/NEGATIVE/NEUTRAL, sectorCode from: 0801 0804 0805 0807 0808 0809 0810 0812 0819 0820 0821 0822 0823 0824 0825 0826 0828 0829`,
      },
    ],
  });

  const text = resp.choices[0]?.message?.content ?? "";
  const parsed = extractJSON<NewsAnalysis>(text);
  // Normalize: gpt-oss can return valid JSON that omits array fields. A plain
  // `?? default` only catches a fully failed parse, not a partial object — so
  // guarantee the arrays here, or buildNewsContext's .map() crashes the scan.
  const sectors = parsed?.affectedSectors;
  const factors = parsed?.globalFactors;
  return {
    summary: parsed?.summary ?? "Unable to analyze news via Groq.",
    detailedNarrative: parsed?.detailedNarrative,
    affectedSectors: Array.isArray(sectors) ? sectors : [],
    globalFactors: Array.isArray(factors) ? factors : [],
  };
}

export async function getStockSignals(
  config: ProviderConfig,
  stockContext: string,
  newsContext: string
): Promise<AISignal[]> {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: GROQ_BASE });

  const resp = await client.chat.completions.create({
    model: config.model ?? "openai/gpt-oss-120b",
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a PSX Shariah-compliant swing trading analyst. Always respond with valid JSON only — a JSON object with a 'signals' array.",
      },
      {
        role: "user",
        content: `Select the BEST 1-8 stocks for short-term swing trades (days to 2 weeks).

MACRO CONTEXT (from today's Pakistan news):
${newsContext}

TECHNICALLY FILTERED STOCKS (passed RSI/EMA/volume screening):
${stockContext}

Only recommend stocks where macro context supports the sector AND technicals confirm the setup.

Return a JSON object with a 'signals' array:
{"signals": [{
  "ticker": "MEBL",
  "signal": "BUY",
  "confidence": 78,
  "reason": "Islamic bank benefits from rate cut, volume spike confirms",
  "newsHeadline": "SBP cuts rate 100bps",
  "catalysts": ["Rate cut reduces costs", "Volume 2.3x average", "RSI oversold"],
  "risks": ["Market weakness", "Rupee risk"],
  "suggestedEntry": "PKR 308-312"
}]}
signal: BUY | STRONG_BUY | WATCH | HOLD | SELL | AVOID

confidence — calibrate against evidence, do not guess:
  80-95 = technical score >= 60 AND a specific fresh catalyst for this stock or its sector AND supportive macro (rare; never exceed 95)
  65-79 = clean technical setup with sector/macro support, but no stock-specific catalyst
  50-64 = decent setup with one clear caveat (thin volume, mixed macro, stretched RSI)
  under 50 = speculative — use WATCH or HOLD rather than BUY
Keep confidence within 25 points of the stock's technical score.

newsHeadline: copy a headline verbatim from MACRO CONTEXT only if it directly concerns this stock or its sector; otherwise exactly "No recent news". Never invent headlines.`,
      },
    ],
  });

  const text = resp.choices[0]?.message?.content ?? "";
  // Unwrap { signals: [...] } wrapper from JSON-mode response
  const parsed = extractJSON<{ signals?: AISignal[] } | AISignal[]>(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && "signals" in parsed && Array.isArray(parsed.signals)) return parsed.signals;
  return [];
}
