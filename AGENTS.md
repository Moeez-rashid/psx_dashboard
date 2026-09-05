<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PSX Scanner (psxscraper.site)

Next.js app tracking the Pakistan Stock Exchange. Scrapes the official PSX portal (`dps.psx.com.pk`) for market data, layers on bring-your-own-key AI analysis (Groq / Claude / OpenAI / Gemini — keys live in the browser, never on a server), and produces a ranked slate of buy opportunities plus holdings/watchlist tracking and a news briefing. Personal investment tool for one user (Moeez); deployed on Vercel, auto-deploys on push to `master`.

## Current state (2026-07-10)

**Opportunities is a deterministic technical scanner.** `lib/technicals.ts` computes a 0-100 **Technical Score** (Trend 35 · Momentum 25 · Volume 20 · Entry 20) from price and volume only — no LLM, news, sentiment or fundamentals. It must stay that way: the same market data has to produce the same score and the same ranking whichever AI provider is configured, or none. The AI writes the narrative for the slate; it does not score or order it. `AISignal.confidence` still exists but is deliberately unread by Opportunities — it is reserved for the **Deep Dive** page, which is NOT built yet (do not build it unprompted). See DECISIONS.md for the weighting rationale.

Also live: the full "compact rows" redesign shipped in PR #1 — two-tier collapsible rows on all tabs (`components/StockRow.tsx`), News tab (`components/NewsView.tsx`) with daily briefing / sentiment history / sector watch / clickable headlines / ranked movers / dividends strip, KSE-100 points strip, fundamentals via askanalyst's `rationew` endpoint (`lib/askanalyst.ts`), and a confidence-calibration rubric in all four provider prompts (`lib/providers/`).

For recent activity, run `git log --oneline -20` — don't trust any hardcoded changelog here to stay current.

## Automated daily scan (2026-09-05, PR stacked on the Technical Score PR)

**Implemented in code, NOT yet operational** — it requires Vercel/Redis configuration that has not been done yet (see DECISIONS.md for the exact checklist). Do not tell Moeez the automated scan is "live" until he confirms that setup.

- `lib/scan-store.ts` persists scans to Redis (Upstash via Vercel Marketplace) — `scan:latest`, `scan:by-date:{date}` (45-day TTL), `scan:lock` (distributed lock, 240s TTL). Completely separate from `lib/scanner.ts`, which still has no idea who calls it (cron, browser, anything).
- `app/api/scan/route.ts` GET (the existing cron handler `vercel.json` already pointed at `0 4 * * 1-5` = 9am PKT) now: checks `CRON_SECRET`, checks a server-side `ANTHROPIC_API_KEY`, acquires the lock, probes EOD freshness (skips if no new trading day since the last success — see DECISIONS.md, this is deliberately simple), runs `runFullScan()`, persists. POST (manual/BYOK) now persists on success too and shares the same lock.
- `GET /api/scan/latest` (new) returns the latest **successful** scan only, fast, no AI key, no secrets — `{ scan: null }` when none exists or the store isn't configured.
- `components/AppShell.tsx` (new, now what `app/page.tsx` renders) races a ~2.4s minimum splash against that fetch, then mounts `Dashboard` already hydrated via its new `initialScan` prop — no scan is ever triggered by opening the site.
- **Server-side AI key is separate from BYOK.** `ANTHROPIC_API_KEY` (or `SCAN_ANTHROPIC_API_KEY` to use a different key than any other server use) drives the unattended cron scan only; the browser's own key (Settings) is untouched and still required for manual scans if no persisted scan exists yet.

## UI overhaul (2026-09-05, PR stacked on the automated-scan PR)

Full frontend pass toward a "professional financial product" feel — no scanner/algorithm changes, no Deep Dive.

- **Icons: `lucide-react`.** Every emoji and ad-hoc Unicode glyph used as a UI icon (📰💼💰📡👁⚙↻⟳✕✦★☆) was replaced. Inline directional text (`Technical Score ↓`, `View all →`) was deliberately left alone — those are typographic conventions, not the emoji problem.
- **`components/ui/TechnicalScore.tsx`** (new) is now the one place the score renders — always "N/100" plus the literal label "Technical Score", never a bare percentage, never near AI-confidence language. `TechnicalScoreMeter` (Opportunities, prominent) and `TechnicalScoreChip` (Watchlist, compact) share the same scoring→color logic.
- **`components/WatchlistRow.tsx`** (new) replaces Watchlist's reuse of Opportunities' `StockRow` cards with an actual dense table (desktop) / two-line compact row (mobile) — see DECISIONS.md for why "Watchlist = monitoring, Opportunities = discovery" drove this split.
- **Deduplication in `StockRow.tsx`'s `StockDetailBody`**: the old narrative-prose generator (`buildTechnicalNarrative`) and the technicals-derived fake "catalysts/risks" (`StockBits.tsx`'s `techCatalysts`/`techRisks`, now deleted) were replaced by one "Key technical reasons" list sourced directly from `TechnicalScore.reasons` — the real deterministic explanation was already being computed and then re-derived three different ways in the UI. AI catalysts/risks now only render when the AI pass actually produced its own (never fabricated from technicals).
- **`components/ui/primitives.tsx`**: added `EmptyState` and `IconButton` — every hand-rolled emoji-headline empty state (Opportunities/Holdings/Watchlist/News) now shares one component.
- **Stale-scan indicator**: a small dot next to "Last scan …" (green pulse = today, muted = earlier day) — not a banner. `lib/format.ts` gained `toPKT()` (extracted from `pktNow()`) to support the day-comparison correctly.

## Open threads

- **Deep Dive page** — planned home for AI reasoning over fundamentals, news, macro, catalysts and risks. Not started; do not add AI-generated scores back into Opportunities.
- `redesign/compact-bo-fundamentals` branch is merged and can be deleted.

## Gotchas

- askanalyst.com is an unofficial dependency and has broken before (see DECISIONS.md) — if fundamentals vanish, check their endpoints first.
- Vercel preview deploys sit behind SSO — unauthenticated `/api/*` returns 302. Verify APIs on a local dev server instead.
- PSX's DPS announcements page is JS-rendered with no public JSON — do NOT try to scrape it; link out instead.
- The PSX EOD feed gives close/open/volume only — no high/low, so true ATR and any high/low indicator are not computable.
- Volume ratio compares today against the average of the **prior** 20 sessions. Do not "simplify" it to include today: that dilutes the spike it exists to detect.

See `DECISIONS.md` for why things are built the way they are.
