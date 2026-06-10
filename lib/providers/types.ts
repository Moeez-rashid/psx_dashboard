/** Shared types across all AI providers */

export interface AISignal {
  ticker: string;
  signal: "BUY" | "STRONG_BUY" | "WATCH" | "HOLD" | "SELL" | "AVOID";
  confidence: number;       // 0-100
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
  groq: "llama-3.3-70b-versatile",
};
