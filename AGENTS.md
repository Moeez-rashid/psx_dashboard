<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PSX Scanner (psxscraper.site)

Next.js app tracking the Pakistan Stock Exchange. Scrapes the official PSX portal (`dps.psx.com.pk`) for market data, layers on bring-your-own-key AI analysis (Groq / Claude / OpenAI / Gemini — keys live in the browser, never on a server), and produces a ranked slate of buy opportunities plus holdings/watchlist tracking and a news briefing. Personal investment tool for one user (Moeez); deployed on Vercel, auto-deploys on push to `master`.

## Current state (2026-07-10)

Live and working: the full "compact rows" redesign shipped in PR #1 — two-tier collapsible rows on all tabs (`components/StockRow.tsx`), News tab (`components/NewsView.tsx`) with daily briefing / sentiment history / sector watch / clickable headlines / ranked movers / dividends strip, KSE-100 points strip, fundamentals via askanalyst's `rationew` endpoint (`lib/askanalyst.ts`), and a confidence-calibration rubric in all four provider prompts (`lib/providers/`).

For recent activity, run `git log --oneline -20` — don't trust any hardcoded changelog here to stay current.

## Open threads

- **Scheduled/background scans**: undecided. Client-side scheduling is impossible (browser must be open); an email digest was proposed and **rejected**. The viable design (Vercel Cron + KV storage + server-side Groq key) was offered to Moeez — awaiting his decision. Don't build it unprompted.
- `redesign/compact-bo-fundamentals` branch is merged and can be deleted.

## Gotchas

- askanalyst.com is an unofficial dependency and has broken before (see DECISIONS.md) — if fundamentals vanish, check their endpoints first.
- Vercel preview deploys sit behind SSO — unauthenticated `/api/*` returns 302. Verify APIs on a local dev server instead.
- PSX's DPS announcements page is JS-rendered with no public JSON — do NOT try to scrape it; link out instead.

See `DECISIONS.md` for why things are built the way they are.
