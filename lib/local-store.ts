/**
 * Browser-local user data shared across routes: watchlist, price alerts and
 * trading-cost preferences. Everything here lives in localStorage only —
 * this app has no accounts and sends none of it to a server.
 *
 * Writers dispatch a window event so components on the same page (e.g. the
 * dashboard's own watchlist state) can pick up changes made elsewhere, such
 * as from the command palette.
 */

export interface WatchItem { ticker: string; name: string }

export const WATCH_KEY = "psx_watch";
export const HOLDINGS_KEY = "psx_holdings";
export const ALERTS_KEY = "psx_alerts";
export const PREFS_KEY = "psx_prefs";
export const WATCH_EVENT = "psx:watch-changed";
export const ALERTS_EVENT = "psx:alerts-changed";
export const PREFS_EVENT = "psx:prefs-changed";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown, event?: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (event) window.dispatchEvent(new Event(event));
  } catch {
    // Storage unavailable (private mode / quota) — the feature degrades to session-only.
  }
}

// ─── Watchlist ──────────────────────────────────────────────────────────────

export function readWatchlist(): WatchItem[] {
  const v = read<WatchItem[]>(WATCH_KEY, []);
  return Array.isArray(v) ? v.filter((w) => w && typeof w.ticker === "string") : [];
}

/** Returns false when the ticker was already on the list. */
export function addToWatchlist(ticker: string, name?: string): boolean {
  const t = ticker.toUpperCase();
  const list = readWatchlist();
  if (list.some((w) => w.ticker === t)) return false;
  write(WATCH_KEY, [...list, { ticker: t, name: name ?? t }], WATCH_EVENT);
  return true;
}

export function removeFromWatchlist(ticker: string): void {
  const t = ticker.toUpperCase();
  write(WATCH_KEY, readWatchlist().filter((w) => w.ticker !== t), WATCH_EVENT);
}

// ─── Price alerts ───────────────────────────────────────────────────────────

export interface PriceAlert {
  id: string;
  ticker: string;
  direction: "above" | "below";
  price: number;
  createdAt: string;
  /** Set once the condition was met; a triggered alert stops being checked. */
  triggeredAt?: string;
  triggeredPrice?: number;
}

export function readAlerts(): PriceAlert[] {
  const v = read<PriceAlert[]>(ALERTS_KEY, []);
  return Array.isArray(v) ? v : [];
}

export function saveAlerts(alerts: PriceAlert[]): void {
  write(ALERTS_KEY, alerts, ALERTS_EVENT);
}

export function addAlert(ticker: string, direction: PriceAlert["direction"], price: number): PriceAlert {
  const alert: PriceAlert = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ticker: ticker.toUpperCase(), direction, price, createdAt: new Date().toISOString(),
  };
  saveAlerts([alert, ...readAlerts()]);
  return alert;
}

// ─── Trading-cost preferences ───────────────────────────────────────────────

export interface CostPrefs {
  /** Capital gains tax on listed securities, %. 15 is the long-standing rate
   *  for filers on shares bought after 1 Jul 2024; non-filers pay more. This
   *  is an editable assumption, not tax advice. */
  cgtPct: number;
  /** Withholding tax on cash dividends, %. */
  dividendTaxPct: number;
  /** Broker commission per side, % of trade value. */
  commissionPct: number;
}

export const DEFAULT_COST_PREFS: CostPrefs = { cgtPct: 15, dividendTaxPct: 15, commissionPct: 0.15 };

export function readCostPrefs(): CostPrefs {
  const v = read<Partial<CostPrefs>>(PREFS_KEY, {});
  const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 100 ? x : d);
  return {
    cgtPct: num(v.cgtPct, DEFAULT_COST_PREFS.cgtPct),
    dividendTaxPct: num(v.dividendTaxPct, DEFAULT_COST_PREFS.dividendTaxPct),
    commissionPct: num(v.commissionPct, DEFAULT_COST_PREFS.commissionPct),
  };
}

export function saveCostPrefs(p: CostPrefs): void {
  write(PREFS_KEY, p, PREFS_EVENT);
}

// ─── Backup / restore ───────────────────────────────────────────────────────

const BACKUP_KEYS = [WATCH_KEY, HOLDINGS_KEY, ALERTS_KEY, PREFS_KEY, "psx_sentiment", "psx_deepdive_recent"] as const;

export interface Backup {
  app: "psx-scanner";
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

/** Everything the app stores locally EXCEPT the AI API key, which never leaves Settings. */
export function buildBackup(): Backup {
  const data: Record<string, unknown> = {};
  for (const k of BACKUP_KEYS) {
    const v = read<unknown>(k, null);
    if (v !== null) data[k] = v;
  }
  return { app: "psx-scanner", version: 1, exportedAt: new Date().toISOString(), data };
}

/** Restore a backup. Returns the number of sections written; throws on a file that isn't one of ours. */
export function restoreBackup(raw: unknown): number {
  const b = raw as Partial<Backup> | null;
  if (!b || b.app !== "psx-scanner" || typeof b.data !== "object" || b.data === null) {
    throw new Error("Not a PSX Scanner backup file");
  }
  let n = 0;
  for (const k of BACKUP_KEYS) {
    if (k in b.data) { write(k, (b.data as Record<string, unknown>)[k]); n++; }
  }
  window.dispatchEvent(new Event(WATCH_EVENT));
  window.dispatchEvent(new Event(ALERTS_EVENT));
  window.dispatchEvent(new Event(PREFS_EVENT));
  return n;
}
