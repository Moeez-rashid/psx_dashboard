/**
 * In-process caching + upstream health tracking shared by every data client.
 *
 * Two things the old data layer did not have, and whose absence let a dead
 * upstream look like a quiet market for six weeks:
 *
 *  1. Stale-on-error. When a refresh fails, the last good value keeps being
 *     served (flagged stale) instead of the failure propagating as "no data".
 *  2. A health ledger. Every upstream call records success or failure here,
 *     so /api/health and the UI can say WHICH source is down and since when.
 */

export interface Cached<T> {
  value: T;
  fetchedAt: number;
  /** True when the loader failed and this is the previous good value. */
  stale: boolean;
}

interface Entry<T> {
  value?: T;
  fetchedAt: number;
  inflight?: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();

/**
 * Memoise an async loader for `ttlMs`, collapsing concurrent callers onto one
 * in-flight request. If the loader throws and an older value exists that is
 * younger than `maxStaleMs`, that value is returned with `stale: true`.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  maxStaleMs = 24 * 60 * 60 * 1000
): Promise<Cached<T>> {
  const now = Date.now();
  let entry = store.get(key) as Entry<T> | undefined;
  if (entry && entry.value !== undefined && now - entry.fetchedAt < ttlMs) {
    return { value: entry.value, fetchedAt: entry.fetchedAt, stale: false };
  }
  if (!entry) {
    entry = { fetchedAt: 0 };
    store.set(key, entry as Entry<unknown>);
  }
  if (!entry.inflight) {
    const e = entry;
    e.inflight = loader()
      .then((value) => {
        e.value = value;
        e.fetchedAt = Date.now();
        return value;
      })
      .finally(() => {
        e.inflight = undefined;
      });
  }
  try {
    const value = (await entry.inflight) as T;
    return { value, fetchedAt: entry.fetchedAt, stale: false };
  } catch (err) {
    if (entry.value !== undefined && now - entry.fetchedAt < maxStaleMs) {
      return { value: entry.value, fetchedAt: entry.fetchedAt, stale: true };
    }
    throw err;
  }
}

// ─── Upstream health ledger ─────────────────────────────────────────────────

export interface SourceHealth {
  source: string;
  ok: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

const health = new Map<string, SourceHealth>();

function entryFor(source: string): SourceHealth {
  let h = health.get(source);
  if (!h) {
    h = { source, ok: true, lastSuccessAt: null, lastFailureAt: null, lastError: null, consecutiveFailures: 0 };
    health.set(source, h);
  }
  return h;
}

export function recordSuccess(source: string): void {
  const h = entryFor(source);
  h.ok = true;
  h.lastSuccessAt = new Date().toISOString();
  h.consecutiveFailures = 0;
}

export function recordFailure(source: string, err: unknown): void {
  const h = entryFor(source);
  h.ok = false;
  h.lastFailureAt = new Date().toISOString();
  h.lastError = (err instanceof Error ? err.message : String(err)).slice(0, 200);
  h.consecutiveFailures += 1;
}

export function getSourceHealth(): SourceHealth[] {
  return [...health.values()].sort((a, b) => a.source.localeCompare(b.source));
}

/** Run `fn`, recording the outcome against `source` in the health ledger. */
export async function tracked<T>(source: string, fn: () => Promise<T>): Promise<T> {
  try {
    const v = await fn();
    recordSuccess(source);
    return v;
  } catch (err) {
    recordFailure(source, err);
    throw err;
  }
}
