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
