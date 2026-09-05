# Decisions log

Reasoning behind significant choices, newest first. This is *why*, not *what* — for what changed, read `git log`.

## UI overhaul: Watchlist gets its own component, not a reuse of Opportunities' cards (2026-09-05)

**Decided:** `components/WatchlistRow.tsx` is a new, genuinely different presentation — a real table on desktop, a two-line compact row on mobile — rather than rendering Watchlist through the same `StockRow` cards Opportunities uses.

**Why:** Opportunities and Watchlist answer different questions. Opportunities is discovery — "show me the best few setups right now," where one card per stock with room for a sparkline, reasons and fundamentals is appropriate. Watchlist is monitoring — "let me scan everything I'm tracking at a glance," which wants many rows visible at once, not many cards. Reusing `StockRow` for both (the pre-overhaul state) meant Watchlist inherited Opportunities' card chrome and information density regardless of how many tickers were on it. `WatchlistRow` shares the same underlying atoms (`hueOf`, `StockDetailBody`, `TechnicalScoreChip`) so the expanded detail is identical either way — only the collapsed row differs, which is where the two use cases actually diverge.

**Deterministic technical reasons replace three redundant restatements of the same facts.** Before this pass, an expanded card could show: a generated narrative sentence about RSI/EMA/volume (`buildTechnicalNarrative`), a "Why it works"/"Watch out for" split fabricated from the *same* RSI/EMA/volume values relabeled as catalysts/risks (`techCatalysts`/`techRisks`), and a chips row repeating RSI/EMA/volume a third time — while `TechnicalScore.reasons` (already computed, already correctly regime-aware language) sat unused in the type. All three heuristic re-derivations are deleted; the real `reasons` array is now the single source of the technical explanation, shown once as "Key technical reasons," with the first entry additionally serving as the collapsed row's one-line summary (deduplicated so it isn't shown twice when expanded — see `dedupedReasons()` in `StockRow.tsx`).

**AI catalysts/risks are shown only when the AI actually produced them.** The old fallback (`techCatalysts(tech)`/`techRisks(tech)` when no AI signal existed) manufactured a catalysts/risks framing that didn't exist as a distinct data source — it was just the same technical facts reworded twice more. Now that section simply doesn't render when there's no real AI narrative, rather than filling the space with a fabricated one.

**Technical Score gets one shared component (`components/ui/TechnicalScore.tsx`) used everywhere it appears**, specifically so it is structurally impossible for a future edit to introduce bare-percentage or confidence-flavored copy in one place while another place still says "Technical Score N/100" — there's only one implementation to get right.

## Automated daily scan: Redis, not Postgres; EOD-date freshness check, not a holiday calendar (2026-09-05)

**Persistence: Upstash Redis over Postgres**, despite no database existing yet to constrain the choice. The access pattern is write-once-daily / read-"give-me-latest"-many-times with no relational queries — a key-value shape, not a relational one. Redis also gives an atomic `SET NX EX` lock for free (Vercel's own cron docs recommend exactly this for preventing overlapping invocations), which a plain object store (Vercel Blob) cannot do atomically. Postgres would be the right call instead if cross-scan analytics (e.g. charting one ticker's score over 30 days) becomes an actual near-term goal — flagged, not built.

**Env var names are resolved, not assumed.** Vercel's own docs (checked live) explicitly decline to commit to one fixed naming scheme for third-party Redis marketplace integrations, and a legacy Vercel-KV-migrated-to-Upstash store literally uses different names (`KV_REST_API_URL`/`TOKEN`) than a fresh Upstash-for-Redis install (`UPSTASH_REDIS_REST_URL`/`TOKEN`). `lib/scan-store.ts` checks both rather than guessing one.

**Freshness check is one EOD probe fetch, not a holiday calendar.** Before running the expensive ~90-call full scan, the cron path fetches ONE ticker's latest EOD bar and compares its date to the last successful scan's `scanDate`. If unchanged, it skips (market holiday, or Vercel redelivering the same cron invocation twice — both documented as real occurrences, not edge cases). This deliberately does NOT try to detect "unchanged prices but genuinely new news" — a hardcoded PSX holiday list was explicitly rejected as unnecessary complexity for a first version, and the EOD-date check already covers the two situations that actually matter (holidays, duplicate delivery) without needing one. A probe-fetch failure is treated as ambiguous and the scan proceeds anyway — never silently skip on an error with no explanation.

**A failed scan never touches `scan:latest`.** Success and failure are written to different keys (`scan:latest` only ever moves forward on success; `scan:by-date:{date}` records every outcome including failed/skipped) specifically so a broken Tuesday cron run can't erase Monday's still-valid results. `GET /api/scan/latest` only ever reads `scan:latest`, so a failed scan is structurally incapable of being served to the frontend as "the latest scan" — this isn't a runtime check, it's which key gets written.

**Manual scans persist too, sharing the same lock as cron**, so a "Rerun Full Scan" click and a scheduled 9am run can never overlap and burn AI budget on two simultaneous expensive scans. Without Redis configured, the lock degrades to "always proceeds" rather than blocking every scan forever — documented as a real behavior change, not silently ignored.

**Splash screen mounts Dashboard once, already hydrated**, rather than mounting it empty and updating it after an async fetch resolves. `AppShell.tsx` waits for both the minimum splash duration AND `/api/scan/latest` before ever rendering `<Dashboard/>`, passing the result as an `initialScan` prop consumed only via `useState`/`useRef` lazy initializers — no post-mount effect re-hydrates state, so there's no risk of `scanTickersRef` and `scanResult` ever disagreeing about whether real data has arrived yet.

## Opportunities ranks on a deterministic Technical Score, not AI confidence (2026-07-10)

**Decided:** Opportunities displays and ranks by a 0–100 **Technical Score** computed only from price and volume in `lib/technicals.ts`. No LLM, news, sentiment or fundamentals (P/E, EPS, ROE) touch it. The file imports exactly one thing — a *type* — so the dependency is structurally impossible, not merely avoided.

**Why:** A score that changes when you switch from Groq to Claude isn't a measure of the stock, it's a measure of the model. The user must be able to read a score as the objective technical quality of a setup. AI reasoning is still valuable, but it belongs in the planned Deep Dive page where fundamentals and news are the point. `AISignal.confidence` is retained in the type for that future page and is deliberately unread by Opportunities.

**Weights (sum to exactly 100):** Trend structure 35 · Momentum/RSI 25 · Volume confirmation 20 · Entry quality 20.

**Reasoning behind each:**
- **Trend and crossover are one bucket, not two.** The old engine scored EMA trend (25) and EMA crossover (25) separately — 50% of the score on two views of the same signal. A crossover *is* a trend event, so it is now a ±4/−6 adjustment inside the trend bucket.
- **RSI is regime-aware.** The old engine gave its single largest award (30/100) to RSI < 30 unconditionally, so the top of the list was reliably whatever was falling fastest. RSI 25 in an intact uptrend is a dip worth buying; RSI 25 in a downtrend is a stock still being sold. The same number now pays 22 or 5 depending on whether EMA20 > EMA50 and price holds EMA50.
- **Entry quality is volatility-normalised.** Being 5% above EMA20 means something different for a stock that normally moves 0.5%/day than one that moves 3%/day. Extension is divided by the stock's own 20-day return volatility, clamped to 0.7–2.0× so the normaliser can never dominate.
- **Volume saturates and knows direction.** An 8× day is not four times as meaningful as a 2× day, so points cap at 1.8× and are *reduced* above 4× (extreme single-session spikes are usually block trades or news dumps). Heavy volume into a ≥1% down close is distribution, not accumulation, and halves the volume score.

**Rejected:** adding recent-return and price-momentum indicators. Both are strongly correlated with price-versus-EMA, which trend already scores — more indicators would have re-introduced the double-counting the redesign set out to remove. True ATR was also rejected: the PSX EOD feed carries only close/open/volume, no high/low, so close-to-close volatility is used instead.

**Thresholds moved from 75/50/30 to 78/60/40.** The old numbers were calibrated against a scale whose maximum was 108 before clamping and which handed out 30 free points for being oversold. Measured across 33 liquid KMI-30 names on live data, the new scale gives median 45, p75 71, max 95 — so 40 sits at the middle of the market, 60 marks the top third, and 78 the top ~18%. The scanner's `minTechnicalScore: 45` gate was left alone: it passes 18 of 33, which keeps the AI narrative pass well fed.

**AI failure is now non-fatal.** Both the news pass and the signal pass are wrapped; an outage degrades Opportunities to the deterministic technical slate behind an explanatory banner instead of failing the scan. Verified with a deliberately invalid API key: HTTP 200, 13 stocks scored and ranked identically to the offline run.

## Fundamentals: switched to askanalyst `rationew/{id}` (2026-06/07, PR #1)

The previous source, `sharepricedatanew/{id}`, started returning HTTP 500 for every ticker (upstream SQL error: `Unknown column 'dividend' in 'pk_payout'`), so fundamentals silently never rendered. askanalyst's own site had migrated to `rationew/{id}`, which works and carries richer data. Two normalizations were required: banks don't report PER or D/E, so the UI derives trailing P/E = price ÷ EPS; upstream D/E is a percentage, stored here as a ratio (47.9% → 0.48×). Verified against banks (MEBL/HBL/UBL) and non-banks (LUCK/OGDC/SYS/...). **Accepted risk:** askanalyst is unofficial and can break again without notice.

## Two-tier collapsible rows instead of always-expanded cards (PR #1)

The Buy Opportunities page felt overwhelming with every card fully expanded, and the separate detail modal (`SignalDetailModal`) plus a mobile-only fundamentals toggle meant three different detail UIs. Replaced with one pattern everywhere: `StockRow` (dense collapsed grid row) + `StockDetailBody` (inline expanded panel). Design rules that survived iteration: single hue per row with a left-edge accent, no prose in the collapsed tier, discrete labeled confidence/P&L instead of ambiguous bars, 2-step in-icon remove (mis-taps were deleting holdings). Rejected: keeping the modal (context loss on mobile).

## Market movers live on the News tab, not Buy Opportunities (2026-07-05)

Movers + macro banner + scan results made BO three competing surfaces. Decision: News owns the full ranked movers section; BO keeps only a one-ticker compact "pulse" with an "All movers →" link. Same pass removed the dead "Daily Auto-Scan Time" setting (client-side scheduling can't work — browser must be open) and the BO disclaimer paragraph (noise).

## AI: bring-your-own-key, multi-provider, keys never leave the browser

`lib/providers/` supports Groq, Claude, OpenAI, Gemini behind one interface. Keys are entered in Settings and stay client-side — no server proxy. Why: zero server cost/liability for a personal tool, and provider churn is real (Groq retired all Llama 3.x models on 2026-06-17 with ~zero notice — never hardcode one model). Scanning is two-pass: news/macro context first, then per-stock signals consuming that context.

## Confidence: LLM number is calibrated, not trusted (2026-07-06)

LLM confidence scores clustered unrealistically high. All four provider prompts now share a calibration rubric: defined bands, confidence must land within 25 points of the rules-based technical score, and cited headlines must be verbatim from supplied context (hallucination guard). Relatedly, `compositeScore` (rules-based technicals) was deliberately kept separate from LLM confidence and demoted to a chip in the expanded view — merging them would hide *why* a signal scored well.

## BO returns a ranked slate with guardrails, not raw model picks (2026-07-06)

The scan produces a 5–8 stock ranked slate with hard rules the model can't override: no BUY when RSI > 70 or price > 8% above EMA20 (don't chase extended stocks — technical score instead rewards pullbacks near EMA20 in an uptrend), and sector diversity is enforced. Reasoning: the LLM alone kept recommending momentum chases.

## News pipeline: word-boundary filters, structured items (2026-07-06)

Early headline filtering used substring matching (sports leaked in: "PSX" in unrelated text) and had an entity-decode-order bug that leaked raw HTML. Now: word-boundary keyword match + blocklist, ARY switched to its business-category feed, and headlines are structured `NewsItem`s with real article links (Google News fallback). PSX's own DPS announcements are JS-rendered with no public JSON — decided to link out rather than scrape.

## Market data: official PSX portal, JSON-first (original architecture)

Data comes from `dps.psx.com.pk/market-watch` — JSON endpoint first, HTML-regex fallback. Chosen over news-site scraping for sturdiness; it's the exchange's own data.

## Rejected: email digest for scheduled scans (2026-07-06)

Proposed and rejected by Moeez — nothing was built. The open alternative (Vercel Cron + KV + server-side Groq key) is documented in AGENTS.md under "Open threads".
