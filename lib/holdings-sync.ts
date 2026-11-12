/**
 * Server side of holdings sync — the only place holdings ever leave the
 * browser, and only when the user turns sync on.
 *
 * There are no accounts. A device that turns sync on generates a long random
 * key (lib/holdings-sync-client.ts); whoever holds the key can read and write
 * that one holdings list, like a secret link. The key itself is never
 * stored: Redis is keyed by its SHA-256, so a dump of the store can't be
 * turned back into working keys. Only ticker, name, shares, average price and
 * the Shariah flag are kept — nothing that identifies the person.
 */

import { createHash } from "node:crypto";
import { getRedisClient } from "./scan-store";

export const SYNC_KEY_RE = /^[A-Za-z0-9_-]{32,64}$/;
const MAX_HOLDINGS = 200;
const TTL_SECONDS = 400 * 24 * 60 * 60; // refreshed on every save; an abandoned key quietly expires

export interface SyncedHolding {
  ticker: string;
  name: string;
  shares: number;
  avgPrice: number;
  shariah: boolean;
}

export interface SyncedHoldings {
  holdings: SyncedHolding[];
  updatedAt: string; // ISO — when the holdings were last edited on any device
}

export class SyncUnavailableError extends Error {
  constructor() { super("Holdings sync is not configured on this server"); this.name = "SyncUnavailableError"; }
}

// Local development has no Redis; keep sync testable there without ever
// pretending to persist in production.
// On globalThis because dev bundles each route separately — the sync and
// widget routes must see the same map.
const devStore: Map<string, SyncedHoldings> =
  ((globalThis as { __psxDevHoldings?: Map<string, SyncedHoldings> }).__psxDevHoldings ??= new Map());
const devStoreAllowed = () => process.env.NODE_ENV !== "production";

const redisKey = (syncKey: string) => `holdings:v1:${createHash("sha256").update(syncKey).digest("hex")}`;

export function isValidSyncKey(k: unknown): k is string {
  return typeof k === "string" && SYNC_KEY_RE.test(k);
}

/** Keep only well-formed rows; throws on anything that isn't a holdings list at all. */
export function sanitizeHoldings(raw: unknown): SyncedHolding[] {
  if (!Array.isArray(raw)) throw new Error("holdings must be an array");
  if (raw.length > MAX_HOLDINGS) throw new Error(`at most ${MAX_HOLDINGS} holdings`);
  const out: SyncedHolding[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const ticker = typeof o.ticker === "string" ? o.ticker.trim().toUpperCase() : "";
    const shares = Number(o.shares), avgPrice = Number(o.avgPrice);
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker) || seen.has(ticker)) continue;
    if (!Number.isFinite(shares) || shares <= 0 || shares > 1e10) continue;
    if (!Number.isFinite(avgPrice) || avgPrice < 0 || avgPrice > 1e7) continue;
    seen.add(ticker);
    out.push({
      ticker, shares, avgPrice,
      name: typeof o.name === "string" ? o.name.slice(0, 120) : ticker,
      shariah: o.shariah === true,
    });
  }
  return out;
}

export async function loadHoldings(syncKey: string): Promise<SyncedHoldings | null> {
  const redis = getRedisClient();
  if (!redis) {
    if (devStoreAllowed()) return devStore.get(syncKey) ?? null;
    throw new SyncUnavailableError();
  }
  return (await redis.get<SyncedHoldings>(redisKey(syncKey))) ?? null;
}

export async function saveHoldings(syncKey: string, data: SyncedHoldings): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    if (devStoreAllowed()) { devStore.set(syncKey, data); return; }
    throw new SyncUnavailableError();
  }
  await redis.set(redisKey(syncKey), data, { ex: TTL_SECONDS });
}

export async function deleteHoldings(syncKey: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    if (devStoreAllowed()) { devStore.delete(syncKey); return; }
    throw new SyncUnavailableError();
  }
  await redis.del(redisKey(syncKey));
}

/** The key travels in a header, not the URL, so it stays out of access logs. */
export function syncKeyFrom(req: Request): string | null {
  const k = req.headers.get("x-sync-key");
  return isValidSyncKey(k) ? k : null;
}
