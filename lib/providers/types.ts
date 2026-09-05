/** Shared types across all AI providers */

export interface AISignal {
  ticker: string;
  signal: "BUY" | "STRONG_BUY" | "WATCH" | "HOLD" | "SELL" | "AVOID";
  /**
   * The model's own stated conviction, 0-100.
   * NOT used to score, rank or display anything in Opportunities — that is the
   * deterministic Technical Score from lib/technicals.ts. Retained here for the
   * planned Deep Dive page, where AI reasoning is the point.
   */
  confidence: number;
  reason: string;           // max ~15 words
  newsHeadline: string;     // latest relevant headline or "No recent news"
  catalysts: string[];      // 1-3 bullet points: why now
  risks: string[];          // 1-2 bullet points: what could go wrong
  suggestedEntry?: string;  // e.g. "PKR 310-315 on dip"
}

export interface SectorSignal {
  sectorName: string;
  sectorCode: string;
  impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  reason: string;
}

export interface NewsAnalysis {
  summary: string;           // 2-3 sentence macro overview
  detailedNarrative?: string; // 4-6 sentence prose: situation → causes → sector impact → outlook
  affectedSectors: SectorSignal[];
  globalFactors: string[];   // e.g. ["Oil -3%", "USD/PKR stable", "IMF tranche approved"]
}

export interface ProviderConfig {
  provider: "claude" | "gemini" | "openai" | "groq";
  apiKey: string;
  model?: string;
}

export const DEFAULT_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-6",
  gemini: "gemini-2.0-flash-lite",
  openai: "gpt-4o-mini",
  groq: "openai/gpt-oss-120b",
};
