<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PSX Scanner (psxscraper.site)

Next.js app for investing on the Pakistan Stock Exchange: market overview, full-market screener, a deterministic technical scanner for Shariah stocks, per-stock research (Deep Dive), holdings/watchlist tracking, company announcements, price alerts and a news briefing. Personal tool for one user (Moeez); deployed on Vercel, auto-deploys on push to `master`.

For recent activity run `git log --oneline -20` — don't trust any changelog here to stay current. `DECISIONS.md` has the *why*.

## Where data comes from (read this before touching anything in `lib/psx*`)

Only **public pages and published files** on `dps.psx.com.pk`, fetched by an honestly identified client (`lib/psx-http.ts`):

| Module | Source | Gives |
|---|---|---|
| `lib/psx-snapshot.ts` | `/screener` | every equity: price, day change, 1Y change, P/E, yield, market cap, **index membership** |
| `lib/psx-eod.ts` | `/download/mkt_summary/YYYY-MM-DD.Z` | daily OHLCV for every equity → history, back-adjusted for dividends/bonus via the file's LDCP |
| `lib/psx-market.ts` | `/indices`, `/trading-panel`, `/circuit-breakers` | indices, market state/breadth/turnover, circuit board |
| `lib/psx-company.ts` | `/company/SYMBOL` | full quote, limits, financials, announcements (with PDFs) |
| `lib/psx.ts` | facade over the above | `getAllStocks`, `getQuotes`, `getHistory`, `getKSE100`, `getKmi30Tickers`, … |

**Do NOT call `/market-watch`, `/timeseries/*`, `/performers` or any other XHR feed.** PSX put those behind a per-page token in Sept 2026; they answer 404 to everything else, and working around that is bot-check circumvention. The app ran on them until then — and silently produced empty scans for six weeks afterwards.

Other upstreams: `lib/askanalyst.ts` (annual fundamentals, unofficial, has broken before), `lib/news-fetcher.ts` (RSS: Business Recorder, Dawn, Tribune, The News, ProPakistani).

Reliability primitives live in `lib/cache.ts`: `cached()` (TTL + single-flight + stale-on-error) and a per-source health ledger surfaced at `GET /api/health`. **A scan with no price history throws** (`lib/scanner.ts`) — it must never be saved as an empty success again.

## Hard rules

- **Technical Score is deterministic.** `lib/technicals.ts` computes 0-100 (Trend 35 · Momentum 25 · Volume 20 · Entry 20) from price and volume only — no LLM, news, sentiment or fundamentals. Same data → same score, whichever AI provider is configured, or none. AI writes narrative; it never scores or orders.
- **Shariah status and KMI-30 membership come from PSX index membership** (`KMIALLSHR` / `KMI30` in the screener's "listed in" column), never a hardcoded list. `KMI30_FALLBACK` in `lib/psx.ts` is a dated last resort only.
- **No fabrication.** A missing value renders as missing with a reason; nothing is estimated to look complete. User-editable assumptions (tax, commission in `lib/local-store.ts`) are labelled as such.
- **BYOK.** The browser's AI key (Settings) never reaches the server except in the request that uses it, is never persisted server-side and is excluded from backups. Holdings leave the browser only when the user turns on sync, and then only ticker, name, shares, average price and the Shariah flag. The cron scan uses a separate server-side key (`GROQ_API_KEY` etc. — env var names are case-sensitive on Vercel).

## Map

- **Routes:** `/` dashboard (tabs: Opportunities, Watchlist, Holdings, News — `?tab=` deep-links), `/market`, `/screener`, `/deep-dive`, `/stock/[ticker]`, `/widget` (iPhone widget setup, not in the nav). Nav is defined once in `lib/nav.ts`, rendered by `components/nav/TopNav.tsx` (`NavRow`).
- **Global client layer** (`components/GlobalClient.tsx`, mounted in the root layout): command palette (⌘K), price alerts, trade calculator, toasts.
- **Browser-local state:** `lib/local-store.ts` (watchlist, alerts, cost prefs, backup/restore) with React bindings in `lib/use-local.ts` (`useSyncExternalStore`). Holdings still live in `Dashboard.tsx` state. There are no accounts.
- **Holdings sync + iPhone widget (opt-in):** `lib/holdings-sync-client.ts` (random key in localStorage, `useHoldingsSync` push/pull, last-edit-wins) ↔ `app/api/sync/holdings` ↔ `lib/holdings-sync.ts` (Redis `holdings:v1:<sha256(key)>`, in-memory in local dev). The Scriptable widget reads `GET /api/widget/holdings` (key in the `x-sync-key` header). Its layout is `public/scriptable/holdings-widget.js`, fetched on every run by the loader the user pastes once from `/widget`, so layout changes ship without re-pasting. Keep that file plain JS for Scriptable, with no imports.
- **Scan pipeline:** `lib/scanner.ts` (pure) → `app/api/scan/route.ts` (GET = Vercel cron `0 4 * * 1-5` = 9am PKT with `CRON_SECRET`; POST = manual BYOK) → `lib/scan-store.ts` (Upstash Redis: `scan:latest` success-only, `scan:by-date:*`, lock) → `GET /api/scan/latest` + `lib/scan-freshness.ts`.
- **Deep Dive:** `lib/deepdive.ts` aggregates deterministic evidence; `lib/deepdive-ai.ts` is the optional AI interpretation over it; `components/deepdive/PsxFactsSection.tsx` renders PSX's own company record.

## Gotchas

- First request on a cold instance loads the session store (~10s for 130 sessions, ~20s for Deep Dive's 262). History-backed routes set `maxDuration`.
- Today's market-summary file appears after the close; intraday the newest session is the previous one, and `StockQuote.volume`/open/high/low describe `sessionDate`, not necessarily today.
- Price alerts are checked only while the app is open in a tab — there is no push server.
- Vercel preview deploys sit behind SSO — unauthenticated `/api/*` returns 302. Verify APIs on a local dev server.
- Local dev has no Redis or AI key: `/api/scan/latest` returns `{ scan: null }`. To browser-test scan UI, temporarily stub that route with `runFullScan(null, …)` and revert.
- Volume ratio compares today against the average of the **prior** 20 sessions. Do not "simplify" it to include today.
- `components/Dashboard.tsx` is a ~1,600-line monolith with pre-existing lint findings; new features should be separate components/routes, not more state in there.
