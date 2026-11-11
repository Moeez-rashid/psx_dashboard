/**
 * The one way this app talks to dps.psx.com.pk.
 *
 * Only public pages and published download files are requested — the same
 * documents any visitor's browser loads by typing the URL. The portal's
 * token-gated XHR feeds (/market-watch, /timeseries/*, /performers, ...) are
 * deliberately NOT used: they are protected against automated access, and
 * this client identifies itself honestly rather than imitating a browser.
 */

export const PSX_BASE = "https://dps.psx.com.pk";

const USER_AGENT = "PSX-Scanner/2.0 (+https://psxscraper.site; personal research dashboard)";

export interface PsxFetchOptions {
  /** Next.js data-cache lifetime in seconds. */
  revalidate: number;
  timeoutMs?: number;
  /** Extra attempts after the first, for transient network errors / 5xx. */
  retries?: number;
}

export async function psxFetch(path: string, opts: PsxFetchOptions): Promise<Response> {
  const { revalidate, timeoutMs = 20_000, retries = 1 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${PSX_BASE}${path}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/octet-stream,*/*" },
        signal: AbortSignal.timeout(timeoutMs),
        next: { revalidate },
      });
      // 4xx is a definitive answer (e.g. no market-summary file for a holiday);
      // only 5xx is worth retrying.
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`PSX ${path} ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`PSX ${path} failed`);
}

/** Fetch a public HTML page; throws on any non-200 so callers never parse an error page. */
export async function psxPage(path: string, revalidate: number): Promise<string> {
  const res = await psxFetch(path, { revalidate });
  if (!res.ok) throw new Error(`PSX ${path} ${res.status}`);
  return res.text();
}

/** "1,234.50" / "(12.5)" / "-0.85%" / "398.9M" style cells → number (NaN-free). */
export function parseNum(raw: string | undefined | null): number {
  if (!raw) return 0;
  const s = raw.replace(/,/g, "").trim();
  if (!s || s === "-" || s === "—" || /^n\/?a$/i.test(s)) return 0;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}
