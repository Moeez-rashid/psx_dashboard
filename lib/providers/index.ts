/**
 * Unified AI provider interface.
 * Swap Claude / Gemini / OpenAI / Groq by changing ProviderConfig.provider.
 * The rest of the app never imports a specific provider directly.
 */

import type { AISignal, NewsAnalysis, ProviderConfig } from "./types";
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
    case "claude":  return claude.getNewsAnalysis(config, newsText);
    case "gemini":  return gemini.getNewsAnalysis(config, newsText);
    case "openai":  return openai.getNewsAnalysis(config, newsText);
    case "groq":    return groq.getNewsAnalysis(config, newsText);
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
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
    case "claude":  return claude.getStockSignals(config, stockContext, newsContext);
    case "gemini":  return gemini.getStockSignals(config, stockContext, newsContext);
    case "openai":  return openai.getStockSignals(config, stockContext, newsContext);
    case "groq":    return groq.getStockSignals(config, stockContext, newsContext);
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}
