/**
 * Unified AI provider interface.
 * Swap Claude / Gemini / OpenAI / Groq by changing ProviderConfig.provider.
 * The rest of the app never imports a specific provider directly.
 */

import type { AISignal, NewsAnalysis, ProviderConfig, SectorSignal } from "./types";
import * as claude from "./claude";
import * as gemini from "./gemini";
import * as openai from "./openai";
import * as groq from "./groq";

export type { AISignal, NewsAnalysis, ProviderConfig };
export { DEFAULT_MODELS } from "./types";

/** Pass 1: Reason over pre-fetched news text → sector signals. */
export async function getNewsAnalysis(
  config: ProviderConfig,
  newsText: string
): Promise<NewsAnalysis> {
  switch (config.provider) {
    case "claude":  return normalizeNewsAnalysis(await claude.getNewsAnalysis(config, newsText));
    case "gemini":  return normalizeNewsAnalysis(await gemini.getNewsAnalysis(config, newsText));
    case "openai":  return normalizeNewsAnalysis(await openai.getNewsAnalysis(config, newsText));
    case "groq":    return normalizeNewsAnalysis(await groq.getNewsAnalysis(config, newsText));
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}

const IMPACTS = new Set(["POSITIVE", "NEGATIVE", "NEUTRAL"]);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/**
 * Model JSON is never trusted to match the schema. Seen in production
 * (2026-11-20): a sector entry with no `sectorName`, which crashed the 9am
 * scan on `undefined.trim()`. Every entry is coerced here, once, for every
 * provider: common alternate keys are accepted, entries without a usable
 * name are dropped, unknown impacts become NEUTRAL.
 */
export function normalizeNewsAnalysis(raw: NewsAnalysis): NewsAnalysis {
  const list: unknown[] = Array.isArray(raw?.affectedSectors) ? raw.affectedSectors : [];
  const affectedSectors: SectorSignal[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const sectorName = str(o.sectorName ?? o.sector ?? o.name ?? o.sector_name);
    if (!sectorName) continue;
    const impact = str(o.impact).toUpperCase();
    affectedSectors.push({
      sectorName,
      sectorCode: str(o.sectorCode ?? o.code ?? o.sector_code),
      impact: (IMPACTS.has(impact) ? impact : "NEUTRAL") as SectorSignal["impact"],
      reason: str(o.reason ?? o.rationale),
    });
  }
  return {
    summary: str(raw?.summary) || "News analysis returned no summary.",
    detailedNarrative: str(raw?.detailedNarrative) || undefined,
    affectedSectors,
    globalFactors: (Array.isArray(raw?.globalFactors) ? raw.globalFactors : []).map(str).filter(Boolean),
  };
}

/**
 * Generic structured-JSON completion, used by Deep Dive's AI interpretation
 * (lib/deepdive-ai.ts). Unlike the two functions above, this one owns no
 * prompt: the caller supplies both the system instructions and the evidence,
 * so Deep Dive's grounding rules live in exactly one place regardless of
 * which provider the user has configured.
 *
 * Returns raw model text — parsing and validation are the caller's job, and
 * for Deep Dive they are deliberately strict.
 */
export async function completeJSON(
  config: ProviderConfig,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  switch (config.provider) {
    case "claude":  return claude.completeJSON(config, system, user, maxTokens);
    case "gemini":  return gemini.completeJSON(config, system, user, maxTokens);
    case "openai":  return openai.completeJSON(config, system, user, maxTokens);
    case "groq":    return groq.completeJSON(config, system, user, maxTokens);
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/** Pass 2: Technical data + news context → final buy/watch picks. */
export async function getStockSignals(
  config: ProviderConfig,
  stockContext: string,
  newsContext: string
): Promise<AISignal[]> {
  switch (config.provider) {
    case "claude":  return normalizeSignals(await claude.getStockSignals(config, stockContext, newsContext));
    case "gemini":  return normalizeSignals(await gemini.getStockSignals(config, stockContext, newsContext));
    case "openai":  return normalizeSignals(await openai.getStockSignals(config, stockContext, newsContext));
    case "groq":    return normalizeSignals(await groq.getStockSignals(config, stockContext, newsContext));
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}

const SIGNALS = new Set(["BUY", "STRONG_BUY", "WATCH", "HOLD", "SELL", "AVOID"]);
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : []);

/** Same schema distrust for the per-stock signals: no ticker → dropped; fields coerced to their types. */
export function normalizeSignals(raw: unknown): AISignal[] {
  if (!Array.isArray(raw)) return [];
  const out: AISignal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const ticker = str(o.ticker ?? o.symbol).toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(ticker)) continue;
    const signal = str(o.signal).toUpperCase().replace(/\s+/g, "_");
    const confidence = Number(o.confidence);
    out.push({
      ticker,
      signal: (SIGNALS.has(signal) ? signal : "WATCH") as AISignal["signal"],
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0,
      reason: str(o.reason),
      newsHeadline: str(o.newsHeadline) || "No recent news",
      catalysts: strList(o.catalysts),
      risks: strList(o.risks),
      suggestedEntry: str(o.suggestedEntry) || undefined,
    });
  }
  return out;
}
