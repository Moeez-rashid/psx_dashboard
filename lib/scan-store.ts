/**
 * Persistence + orchestration primitives for the automated daily scan.
 *
 * Deliberately separate from lib/scanner.ts: the scanner has no idea whether
 * it is being invoked by Vercel Cron, a manual browser click, or anything
 * else, and this file must stay that way — it only ever calls runFullScan()
 * as a black box and stores what comes back.
 *
 * Storage: Upstash Redis via the Vercel Marketplace integration. Vercel's own
 * docs (checked live while building this) do not commit to a single fixed
 * env var naming scheme for third-party Redis add-ons — a legacy "Vercel KV"
 * store (auto-migrated to Upstash in Dec 2024) keeps the KV_REST_API_* names,
 * while a fresh Upstash-for-Redis install uses UPSTASH_REDIS_REST_*. Rather
 * than assume one, getClient() checks both and uses whichever is present.
 */
import { Redis } from "@upstash/redis";
import type { ScanResult } from "./scanner";

export type ScanStatus = "success" | "failed" | "skipped";
export type ScanTrigger = "cron" | "manual";

export interface PersistedScan {
  id: string;
  startedAt: string;   // ISO
  completedAt: string; // ISO
  status: ScanStatus;
  scanDate: string;     // PSX EOD trading date this scan reflects, e.g. "2026-09-04"
  trigger: ScanTrigger;
  results: ScanResult | null; // null for "failed" / "skipped"
  error?: string;             // sanitized — never contains API keys, see sanitizeError()
}

const HISTORY_TTL_SECONDS = 45 * 24 * 60 * 60; // ~45 days — inside the requested 30-60 day window
const LOCK_TTL_SECONDS = 240;                  // above realistic scan duration, below Vercel's 300s Hobby limit
const LATEST_KEY = "scan:latest";
const LOCK_KEY = "scan:lock";
const byDateKey = (date: string) => `scan:by-date:${date}`;

const ENV_CANDIDATES: Array<[url: string, token: string]> = [
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], // native Upstash Marketplace integration (current)
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],               // legacy Vercel KV naming (pre-Dec-2024 stores)
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

export function isScanStoreConfigured(): boolean {
  return getClient() !== null;
}

/** Strip anything credential-shaped before it is ever persisted or logged. */
function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[redacted]")
    .replace(/gsk_[a-zA-Z0-9_-]{10,}/g, "[redacted]")
    .replace(/AIza[a-zA-Z0-9_-]{16,}/g, "[redacted]")
    .replace(/Bearer\s+\S{10,}/gi, "Bearer [redacted]")
    .slice(0, 500);
}

/** The most recent successfully completed scan, or null. Never throws. */
export async function getLatestScan(): Promise<PersistedScan | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const scan = await redis.get<PersistedScan>(LATEST_KEY);
    return scan && scan.status === "success" ? scan : null;
  } catch (err) {
    console.error("[scan-store] getLatestScan failed", err);
    return null; // a Redis outage reads the same as "no scan yet" — never break the frontend
  }
}

export async function saveSuccess(params: {
  id: string; startedAt: string; scanDate: string; trigger: ScanTrigger; results: ScanResult;
}): Promise<void> {
  const redis = getClient();
  if (!redis) return; // no store configured — caller still returns its result, just unpersisted
  const scan: PersistedScan = {
    id: params.id,
    startedAt: params.startedAt,
    completedAt: new Date().toISOString(),
    status: "success",
    scanDate: params.scanDate,
    trigger: params.trigger,
    results: params.results,
  };
  try {
    await Promise.all([
      redis.set(LATEST_KEY, scan),
      redis.set(byDateKey(params.scanDate), scan, { ex: HISTORY_TTL_SECONDS }),
    ]);
  } catch (err) {
    console.error("[scan-store] saveSuccess failed", err);
  }
}

/** Records a failed run WITHOUT ever touching scan:latest. */
export async function saveFailure(params: {
  id: string; startedAt: string; scanDate: string; trigger: ScanTrigger; error: unknown;
}): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  const scan: PersistedScan = {
    id: params.id,
    startedAt: params.startedAt,
    completedAt: new Date().toISOString(),
    status: "failed",
    scanDate: params.scanDate,
    trigger: params.trigger,
    results: null,
    error: sanitizeError(params.error),
  };
  try {
    await redis.set(byDateKey(params.scanDate), scan, { ex: HISTORY_TTL_SECONDS });
  } catch (err) {
    console.error("[scan-store] saveFailure failed", err);
  }
}

/** Records a deliberate no-op (cron found no new trading data). Also never touches scan:latest. */
export async function saveSkipped(params: { id: string; startedAt: string; scanDate: string }): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  const scan: PersistedScan = {
    id: params.id,
    startedAt: params.startedAt,
    completedAt: new Date().toISOString(),
    status: "skipped",
    scanDate: params.scanDate,
    trigger: "cron",
    results: null,
  };
  try {
    await redis.set(byDateKey(params.scanDate), scan, { ex: HISTORY_TTL_SECONDS });
  } catch (err) {
    console.error("[scan-store] saveSkipped failed", err);
  }
}

// ─── Distributed lock — prevents cron/manual/duplicate-cron overlap ────────

/**
 * Best-effort: if no store is configured there is no way to lock, so this
 * returns true (proceed unlocked) rather than blocking every scan forever.
 * This is a documented degraded mode, not a silent correctness gap — without
 * Redis the concurrency guarantee simply doesn't apply, same as persistence.
 */
export async function acquireLock(): Promise<boolean> {
  const redis = getClient();
  if (!redis) return true;
  try {
    const result = await redis.set(LOCK_KEY, "1", { nx: true, ex: LOCK_TTL_SECONDS });
    return result !== null; // Redis SET NX returns null when the key already existed
  } catch (err) {
    console.error("[scan-store] acquireLock failed — proceeding unlocked", err);
    return true; // a Redis hiccup shouldn't be the reason a scan never runs
  }
}

export async function releaseLock(): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.del(LOCK_KEY);
  } catch (err) {
    console.error("[scan-store] releaseLock failed — lock will self-expire via TTL", err);
  }
}

/**
 * Lightweight freshness probe: one EOD history fetch instead of the full
 * scan, used to detect "no new trading data since the last successful scan"
 * (market holiday, or a duplicate cron delivery on the same day). Returns
 * null on any failure — callers must treat null as "ambiguous, run anyway"
 * rather than as "no new data," since silently skipping on a fetch error
 * would leave the site stuck without ever explaining why.
 */
export async function getLatestTradingDate(probeSymbol = "MEBL"): Promise<string | null> {
  try {
    const { getHistory } = await import("./psx");
    const history = await getHistory(probeSymbol);
    return history[0]?.date ?? null; // getHistory() returns newest-first
  } catch (err) {
    console.error("[scan-store] getLatestTradingDate probe failed", err);
    return null;
  }
}
