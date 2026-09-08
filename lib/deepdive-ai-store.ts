/**
 * Redis cache for Deep Dive AI interpretations.
 *
 * Kept deliberately separate from lib/scan-store.ts. That file is the
 * automated scan's persistence and locking layer and is load-bearing for the
 * cron; this cache is an optimisation for a different feature with a
 * different lifecycle. The ~15 lines of client resolution below are
 * duplicated from it rather than exported out of it, so the scan store keeps
 * a zero-line diff — see its header for why both env-var namings are checked.
 *
 * Three rules this file exists to enforce:
 *   - Redis is optional. If it isn't configured or is failing, Deep Dive
 *     still works; only the caching does not. Nothing here ever throws.
 *   - Only validated analyses are written. Malformed model output must never
 *     reach the cache, so callers write after validation, never before.
 *   - A failed regeneration never destroys a good cached analysis: this
 *     module has no delete-on-failure path, and writes only happen on success.
 */

import { Redis } from "@upstash/redis";
import type { DeepDiveAnalysis } from "./deepdive-ai";

const ENV_CANDIDATES: Array<[url: string, token: string]> = [
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], // native Upstash Marketplace integration
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],               // legacy Vercel KV naming
];

let client: Redis | null | undefined; // undefined = not yet resolved this process

function getClient(): Redis | null {
  if (client !== undefined) return client;
  for (const [urlKey, tokenKey] of ENV_CANDIDATES) {
    const url = process.env[urlKey];
    const token = process.env[tokenKey];
    if (url && token) {
      client = new Redis({ url, token });
      return client;
    }
  }
  client = null;
  return null;
}

export function isDeepDiveAICacheConfigured(): boolean {
  return getClient() !== null;
}

/**
 * Keyed by ticker AND the evidence fingerprint, so invalidation is automatic:
 * when the underlying Deep Dive data changes (new trading session, new fiscal
 * year, a changed sector median, a new matched press mention), dataVersion
 * changes and the old entry is simply never read again.
 */
function cacheKey(ticker: string, dataVersion: string): string {
  return `deepdive:ai:${ticker.toUpperCase()}:${dataVersion}`;
}

/** Long enough to cover repeat visits within a data version, short enough
 *  that superseded versions don't accumulate forever. */
const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

/** Cached analysis for this exact evidence version, or null. Never throws. */
export async function getCachedAnalysis(
  ticker: string,
  dataVersion: string
): Promise<DeepDiveAnalysis | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    return (await redis.get<DeepDiveAnalysis>(cacheKey(ticker, dataVersion))) ?? null;
  } catch {
    return null; // a cache miss and a broken cache are the same thing to the caller
  }
}

/** Store a VALIDATED analysis. Callers must not pass unvalidated output. Never throws. */
export async function cacheAnalysis(
  ticker: string,
  dataVersion: string,
  analysis: DeepDiveAnalysis
): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(cacheKey(ticker, dataVersion), analysis, { ex: TTL_SECONDS });
  } catch {
    // Caching is best-effort; a write failure must not fail the request.
  }
}

/**
 * Drop the cached analysis for one evidence version — the hook a future
 * "Re-analyze" action uses to force a fresh reading of unchanged data.
 * Deliberately explicit: nothing in the normal request path calls this, so a
 * provider failure can never evict a good analysis.
 */
export async function invalidateAnalysis(ticker: string, dataVersion: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.del(cacheKey(ticker, dataVersion));
  } catch {
    // Best-effort.
  }
}
