# Decisions log

Reasoning behind significant choices, newest first. This is *why*, not *what* — for what changed, read `git log`.

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
