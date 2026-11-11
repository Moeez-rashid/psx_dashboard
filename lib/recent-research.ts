/**
 * Local, per-browser history of tickers researched via Deep Dive. Deliberately
 * not a server-side feature — this is a convenience for the one user of this
 * app to jump back into a recent research session, not analytics.
 */

const KEY = "psx_deepdive_recent";
const MAX_ENTRIES = 8;

export interface RecentResearchEntry {
  ticker: string;
  name: string | null;
  at: string; // ISO timestamp
}

export function getRecentResearch(): RecentResearchEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Record (or bump) a ticker as just-researched. Call once per Deep Dive page visit. */
export function recordResearch(entry: { ticker: string; name: string | null }): void {
  try {
    const existing = getRecentResearch().filter((e) => e.ticker !== entry.ticker);
    const next = [{ ticker: entry.ticker, name: entry.name, at: new Date().toISOString() }, ...existing].slice(
      0,
      MAX_ENTRIES
    );
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private browsing, quota) — recent research is a nicety, not load-bearing.
  }
}

// ─── The stock currently being researched (this tab only) ───────────────────
// Lets the Deep Dive nav item return to the stock you were on instead of the
// empty search screen — including when you left while it was still loading.

const ACTIVE_KEY = "psx_deepdive_active";
export const ACTIVE_EVENT = "psx:deepdive-active";

export function getActiveResearch(): string {
  try { return sessionStorage.getItem(ACTIVE_KEY) ?? ""; } catch { return ""; }
}

export function setActiveResearch(ticker: string): void {
  try {
    sessionStorage.setItem(ACTIVE_KEY, ticker);
    window.dispatchEvent(new Event(ACTIVE_EVENT));
  } catch { /* storage unavailable — the nav item just opens the search screen */ }
}
