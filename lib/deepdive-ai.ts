/**
 * Deep Dive AI interpretation layer.
 *
 * Sits strictly ON TOP of the deterministic evidence:
 *
 *   PSX / askanalyst / RSS → deterministic calculations → DeepDiveData
 *                                                             ↓
 *                                              this file (interpretation only)
 *
 * The model is an INTERPRETER, never a source of facts. Everything it is
 * allowed to talk about is assembled here into a labelled evidence digest;
 * anything not in that digest does not exist as far as the analysis is
 * concerned. Nothing here computes a score, a ranking, a probability, a
 * confidence, or a price target — the Technical Score in lib/technicals.ts
 * remains the only score this product has.
 *
 * Three layers of defence against fabrication, in order:
 *   1. The digest itself — compact, provenance-labelled, and explicit about
 *      the four distinct kinds of absence (unavailable / not applicable /
 *      deliberately not computed / degraded), so the model never has to
 *      guess what a missing number means.
 *   2. The prompt — states the rules and the exact output shape.
 *   3. validateAnalysis() — the part that actually enforces them. Prompts are
 *      requests; this is the check. Schema, forbidden fields, forbidden
 *      phrasing and numeric grounding are all verified after the fact, and
 *      output that fails is discarded rather than shown or cached.
 */

import type { DeepDiveData } from "./deepdive";
import { completeJSON, DEFAULT_MODELS, type ProviderConfig } from "./providers";
import { cacheAnalysis, getCachedAnalysis, invalidateAnalysis } from "./deepdive-ai-store";

// ─── The analysis shape ──────────────────────────────────────────────────────
// Deliberately NOT derived from AISignal: that type carries `confidence`,
// which must never reach Deep Dive. There is no numeric field of any kind in
// here — every field is prose the reader can check against the evidence shown
// alongside it on the page.

export interface DeepDiveScenarios {
  bull: string;
  base: string;
  bear: string;
}

export interface DeepDiveAnalysisMeta {
  provider: string;
  model: string;
  generatedAt: string;
  /** The evidence fingerprint this reading was produced from (DeepDiveData.meta.dataVersion). */
  dataVersion: string;
  tradingDate: string | null;
  /** Numbers or phrasings the validator flagged but judged tolerable. Surfaced,
   *  never silently swallowed — if this is non-empty the reader should know. */
  groundingWarnings: string[];
}

export interface DeepDiveAnalysis {
  summary: string;
  technicalInterpretation: string;
  valuationInterpretation: string;
  fundamentalInterpretation: string;
  marketInterpretation: string;
  riskInterpretation: string;
  /** Where independent categories of evidence agree. */
  confluence: string[];
  /** Where they contradict each other — usually the most useful part. */
  divergence: string[];
  catalysts: string[];
  risks: string[];
  scenarios: DeepDiveScenarios;
  whatToWatch: string[];
  limitations: string[];
  meta: DeepDiveAnalysisMeta;
}

export type DeepDiveAIStatus =
  | "ok"
  | "not-generated"        // no cached analysis and generation wasn't requested
  | "no-provider"          // no server-side AI key configured
  | "insufficient-evidence" // too little deterministic data to interpret honestly
  | "provider-failed"      // the model call threw
  | "invalid-output";      // the model answered, but the answer failed validation

export interface DeepDiveAIResult {
  analysis: DeepDiveAnalysis | null;
  status: DeepDiveAIStatus;
  /** Human-readable explanation when analysis is null. */
  detail: string | null;
  cached: boolean;
}

// ─── Evidence digest ─────────────────────────────────────────────────────────

const UNAVAILABLE = "UNAVAILABLE";
const NOT_APPLICABLE = "NOT_APPLICABLE (not reported under bank schema)";

function num(v: number | null | undefined, suffix = ""): string {
  return v === null || v === undefined ? UNAVAILABLE : `${v}${suffix}`;
}

/**
 * Build the labelled evidence block the model is allowed to reason over.
 *
 * Excludes application internals deliberately: no dataVersion, no source
 * URLs, no generation timestamps, and none of the 252-point price series —
 * the computed indicators already say everything the raw series would, at a
 * fraction of the tokens, and handing over a long number list is an
 * invitation to quote arbitrary values from it.
 */
export function buildEvidenceDigest(data: DeepDiveData): string {
  const { identity, technical: t, valuation: v, fundamentals: f, fundamentalHistory: h,
          marketContext: m, news, risk: r, meta } = data;

  const L: string[] = [];

  L.push(`## IDENTITY`);
  L.push(`Ticker: ${identity.ticker}`);
  L.push(`Company: ${identity.companyName ?? UNAVAILABLE}`);
  L.push(`Sector: ${identity.sectorName ?? UNAVAILABLE}`);
  L.push(`Current price (PKR): ${num(identity.currentPrice)} [source: ${identity.priceSource ?? UNAVAILABLE}]`);
  L.push(`Change today: ${num(identity.changePercent, "%")}`);
  L.push(`Latest EOD trading session: ${identity.tradingDate ?? UNAVAILABLE}`);

  L.push(``);
  L.push(`## TECHNICAL — computed from EOD close/volume history, as of ${t.asOfDate ?? UNAVAILABLE}`);
  if (!t.available) {
    L.push(`Technical Score: ${UNAVAILABLE} — ${t.unavailableReason ?? "not computable"}`);
    L.push(`Sessions of price history available: ${t.historySessions}`);
  } else {
    L.push(`Technical Score: ${num(t.score)}/100 (deterministic, price+volume only; NOT an AI output)`);
    L.push(`Technical signal: ${t.signal ?? UNAVAILABLE}`);
    if (t.components) {
      L.push(`Score components (max in brackets): trend ${t.components.trend}[35], momentum ${t.components.momentum}[25], volume ${t.components.volume}[20], entry ${t.components.entry}[20]`);
    }
    L.push(`Deterministic reasons behind the score:`);
    for (const reason of t.reasons) L.push(`  - ${reason}`);
    L.push(`RSI(14): ${num(t.rsi)}`);
    L.push(`EMA20: ${num(t.ema20)} (price is ${t.priceVsEma20 ?? UNAVAILABLE})`);
    L.push(`EMA50: ${num(t.ema50)} (price is ${t.priceVsEma50 ?? UNAVAILABLE})`);
    L.push(`SMA200: ${num(t.sma200)}${t.priceVsSma200 ? ` (price is ${t.priceVsSma200})` : ""}`);
    L.push(`EMA20 slope over 5 sessions: ${num(t.ema20SlopePct, "%")}`);
    L.push(`EMA20 vs EMA50 gap: ${num(t.emaGapPct, "%")} — trend regime: ${t.trendRegime ?? UNAVAILABLE}`);
    L.push(`EMA crossover within last 10 sessions: ${t.crossoverSignal ?? UNAVAILABLE}`);
    L.push(`Volume vs prior 20-session average: ${num(t.volumeRatio, "x")}`);
    L.push(t.macd
      ? `MACD(12,26,9): macd ${t.macd.macd}, signal ${t.macd.signal}, histogram ${t.macd.histogram} — ${t.macd.trend}`
      : `MACD(12,26,9): ${UNAVAILABLE}`);
    L.push(t.bollinger
      ? `Bollinger(20,2): lower ${t.bollinger.lower}, middle ${t.bollinger.middle}, upper ${t.bollinger.upper}, %B ${t.bollinger.percentB ?? UNAVAILABLE}, bandwidth ${t.bollinger.bandwidthPct}%`
      : `Bollinger(20,2): ${UNAVAILABLE}`);
    L.push(t.closingRange52w
      ? `52-week CLOSING range (closing prices only, NOT intraday highs/lows, NOT support/resistance): low ${t.closingRange52w.low}, high ${t.closingRange52w.high}, ${t.closingRange52w.distanceFromHighPct}% vs high`
      : `52-week closing range: ${UNAVAILABLE}`);
    L.push(`NOTE: MACD, SMA200, Bollinger and the 52-week closing range are SUPPLEMENTARY. They are not inputs to the Technical Score.`);
  }

  L.push(``);
  L.push(`## VALUATION — annual accounts${v.fiscalYear ? `, fiscal year ${v.fiscalYear}` : ""} (NOT live data)`);
  L.push(`P/E: ${num(v.pe, "x")} [${v.peSource === "derived-from-eps" ? "DERIVED as price divided by EPS, because the bank ratio schema reports no P/E" : v.peSource === "reported" ? "as reported" : UNAVAILABLE}]`);
  L.push(`P/B: ${num(v.pbv, "x")}`);
  L.push(v.peg !== null
    ? `PEG: ${v.peg}`
    : `PEG: ${UNAVAILABLE} — ${v.pegUnavailableReason ?? "not meaningful"}`);
  L.push(`Dividend yield: ${num(v.dividendYield, "%")}`);
  if (v.sector) {
    L.push(v.sector.medianPE !== null
      ? `Sector median P/E (${v.sector.sectorName}): ${v.sector.medianPE}x, median of ${v.sector.sampleSize} of ${v.sector.totalConstituents} constituents`
      : `Sector median P/E (${v.sector.sectorName}): ${UNAVAILABLE} — only ${v.sector.sampleSize} of ${v.sector.totalConstituents} constituents had a usable P/E, below the minimum sample size, so NO sector comparison can be made`);
  } else {
    L.push(`Sector median P/E: ${UNAVAILABLE} — sector could not be resolved`);
  }
  L.push(`Premium/discount vs sector median: ${v.premiumDiscountVsSectorPct === null ? UNAVAILABLE : `${v.premiumDiscountVsSectorPct}% (positive = premium)`}`);
  L.push(v.marketProxy?.medianPE != null
    ? `KMI-30 median P/E: ${v.marketProxy.medianPE}x over ${v.marketProxy.sampleSize} constituents. THIS IS A MARKET VALUATION PROXY ONLY. It is NOT the KSE-100 P/E — no index-level earnings data exists for this app. Never call it the KSE-100 P/E.`
    : `KMI-30 median P/E proxy: ${UNAVAILABLE}`);
  L.push(`Premium/discount vs KMI-30 proxy: ${v.premiumDiscountVsMarketProxyPct === null ? UNAVAILABLE : `${v.premiumDiscountVsMarketProxyPct}%`}`);

  L.push(``);
  L.push(`## FUNDAMENTALS — annual accounts${f.fiscalYear ? `, fiscal year ${f.fiscalYear}` : ""} (NOT live data)`);
  if (!f.available) {
    L.push(`${UNAVAILABLE} — no fundamental data exists for this ticker from the fundamentals source.`);
  } else {
    const na = new Set(f.notReportedUnderBankSchema);
    const line = (key: string, label: string, value: number | null, suffix = "") =>
      L.push(`${label}: ${na.has(key) ? NOT_APPLICABLE : num(value, suffix)}`);
    L.push(`Reports under bank schema: ${f.isBank ? "YES" : "no"}`);
    line("eps", "EPS (PKR)", f.eps);
    line("epsGrowth", "EPS growth YoY", f.epsGrowth, "%");
    line("revenueGrowth", "Revenue growth YoY", f.revenueGrowth, "%");
    line("roe", "ROE", f.roe, "%");
    line("roa", "ROA", f.roa, "%");
    line("roce", "ROCE", f.roce, "%");
    line("netMargin", "Net margin", f.netMargin, "%");
    line("grossMargin", "Gross margin", f.grossMargin, "%");
    line("operatingMargin", "Operating margin", f.operatingMargin, "%");
    line("ebitdaMargin", "EBITDA margin", f.ebitdaMargin, "%");
    line("debtToEquity", "Debt/equity", f.debtToEquity, "x");
    line("currentRatio", "Current ratio", f.currentRatio, "x");
    line("quickRatio", "Quick ratio", f.quickRatio, "x");
    line("interestCoverage", "Interest coverage (EBIT/interest)", f.interestCoverage, "x");
    line("dps", "DPS (PKR)", f.dps);
    line("payoutRatio", "Payout ratio", f.payoutRatio, "%");
    if (f.notReportedUnderBankSchema.length > 0) {
      L.push(`Fields marked NOT_APPLICABLE are absent BY DESIGN because banks report a different set of measures. They are NOT missing data and must NOT be described as unavailable, missing, or a gap.`);
    }
  }

  const series = (label: string, points: Array<{ year: string; value: number }>) => {
    if (points.length === 0) return;
    L.push(`${label}: ${points.map((p) => `FY${p.year}=${p.value}`).join(", ")}`);
  };
  if (h.years.length > 0) {
    L.push(``);
    L.push(`## FUNDAMENTAL HISTORY — one value per reported fiscal year (annual, not live)`);
    series("EPS", h.eps);
    series("EPS growth %", h.epsGrowth);
    series("DPS", h.dps);
    series("P/E", h.pe);
    series("ROE %", h.roe);
    if (h.dpsPositiveStreakYears !== null) {
      L.push(`Consecutive most-recent years with a dividend: ${h.dpsPositiveStreakYears}`);
    }
  }

  L.push(``);
  L.push(`## MARKET CONTEXT — TODAY'S SINGLE SESSION ONLY (no historical sector series exists)`);
  if (m.sector) {
    L.push(`Sector (${m.sector.sectorName}) average change today: ${num(m.sector.avgChangePercentToday, "%")} across ${m.sector.constituentCount} constituents`);
    L.push(`Sector breadth today: ${m.sector.advancing} advancing, ${m.sector.declining} declining`);
  } else {
    L.push(`Sector snapshot: ${UNAVAILABLE}`);
  }
  L.push(`Stock vs sector today: ${m.stockVsSectorTodayPct === null ? UNAVAILABLE : `${m.stockVsSectorTodayPct} percentage points`}`);
  L.push(m.kse100
    ? `KSE-100 today: ${m.kse100.changePercent}% (index level ${m.kse100.value}). This is the real index's DAILY MOVE — unrelated to the KMI-30 valuation proxy above.`
    : `KSE-100 today: ${UNAVAILABLE}`);
  L.push(`Stock vs KSE-100 today: ${m.stockVsKse100TodayPct === null ? UNAVAILABLE : `${m.stockVsKse100TodayPct} percentage points`}`);
  L.push(`These are single-day comparisons. They say nothing about relative strength over any longer period.`);

  L.push(``);
  L.push(`## COMPANY NEWS — press mentions only`);
  L.push(`Source type: ${news.source}. These are articles from general business RSS feeds that name the company. They are NOT official PSX filings, NOT company announcements, and NOT earnings releases. Never describe them as such.`);
  if (news.items.length === 0) {
    L.push(`No company-specific press mentions were found in the ${news.scannedCount} articles scanned. This means none were found in these sources — NOT that nothing is happening at the company.`);
  } else {
    for (const item of news.items) {
      L.push(`  - "${item.title}" [${item.source}, matched on ${item.matchedOn}]`);
    }
  }

  L.push(``);
  L.push(`## RISK`);
  L.push(`Daily volatility (stdev of last 20 daily closes): ${num(r.dailyVolatilityPct, "%")}`);
  L.push(r.maxDrawdown1y
    ? `Max drawdown over the last year: ${r.maxDrawdown1y.maxDrawdownPct}% (peak ${r.maxDrawdown1y.peakDate} to trough ${r.maxDrawdown1y.troughDate})`
    : `Max drawdown: ${UNAVAILABLE}`);
  L.push(`Extension vs EMA20 (chase risk): ${num(r.extensionPct, "%")}`);
  L.push(r.liquidity
    ? `Average daily traded value: PKR ${r.liquidity.avgDailyValueTraded} over ${r.liquidity.lookbackSessions} sessions (turnover, NOT order-book depth); average daily volume ${r.liquidity.avgVolume} shares; liquidity tier: ${r.liquidityTier ?? UNAVAILABLE}`
    : `Liquidity: ${UNAVAILABLE}`);

  L.push(``);
  L.push(`## DELIBERATELY NOT COMPUTED — these are design decisions, NOT missing data and NOT unavailable`);
  for (const item of r.notComputed) L.push(`  - ${item}`);

  if (meta.degraded.length > 0) {
    L.push(``);
    L.push(`## DEGRADED THIS REQUEST — a source failed while assembling this data`);
    for (const d of meta.degraded) L.push(`  - ${d}`);
  }

  L.push(``);
  L.push(`## STRUCTURAL LIMITATIONS OF THIS DATA`);
  for (const l of meta.limitations) L.push(`  - ${l}`);

  return L.join("\n");
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an analytical assistant interpreting supplied Pakistan Stock Exchange (PSX) data for one company.

The EVIDENCE block you are given is authoritative and complete. It is the only information you have and the only information you may use.

Absolute rules:
- Never state a number that does not appear in the EVIDENCE block. Do not compute new figures, ratios, averages, targets or projections.
- Never produce a score, rating, confidence value, probability, percentage likelihood, or price target. The Technical Score in the evidence is a deterministic calculation that already exists; you interpret it, you never restate it as your own judgement and never propose an alternative.
- Never claim analysis you have no data for: no ATR, no reward/risk ratios, no candlestick patterns, no intraday support or resistance levels.
- Distinguish carefully between four different kinds of absence, which mean different things:
  UNAVAILABLE = we tried to obtain it and could not.
  NOT_APPLICABLE = the company's reporting schema does not include it (banks). It is absent by design; never call it missing or a gap.
  DELIBERATELY NOT COMPUTED = we chose not to calculate it because the required input data does not exist. Say so that way.
  DEGRADED = a source failed on this particular request.
- Separate fact from interpretation. Facts come from the evidence; interpretation is your reading of them. Never present your reading as a fact.
- Write analytically, not promotionally. Prefer "the evidence favours", "the setup appears", "the main contradiction is", "this reading weakens if". Avoid "will rise", "guaranteed", "high probability", "certain".
- If the evidence is thin or contradictory, say so plainly. A cautious, well-hedged reading is correct; a confident one built on absent data is a failure.

Your most valuable contribution is identifying CONFLUENCE (independent categories of evidence agreeing) and DIVERGENCE (them contradicting each other). Do not manufacture either. If technical and fundamental evidence genuinely point the same way, say so and name the specific evidence. If they conflict, that conflict is usually the single most useful thing on the page.

Respond with valid JSON only.`;

const OUTPUT_SHAPE = `{
  "summary": "3-4 sentences: the overall interpretation of this setup, naming the strongest supporting evidence and the biggest caveat.",
  "technicalInterpretation": "2-4 sentences on trend, momentum, volume and entry quality, plus what the supplementary indicators (MACD, SMA200, Bollinger, closing range) add or contradict. State clearly that supplementary indicators are not part of the Technical Score.",
  "valuationInterpretation": "2-4 sentences on P/E, the sector comparison, P/B, PEG and dividend yield. If the sector median is unavailable, say the comparison cannot be made rather than substituting the KMI-30 proxy for it.",
  "fundamentalInterpretation": "2-4 sentences on earnings, growth, returns, margins, leverage, liquidity ratios, coverage and dividends. Treat NOT_APPLICABLE fields as absent by design, not missing.",
  "marketInterpretation": "2-3 sentences on today's sector move, the stock against its sector, and the KSE-100's daily move. These are single-session facts only.",
  "riskInterpretation": "2-3 sentences on volatility, drawdown, extension/chase risk and liquidity, plus the limitations that materially affect confidence in this reading.",
  "confluence": ["2-4 specific points where independent evidence categories agree, each naming the actual evidence"],
  "divergence": ["1-4 specific points where evidence conflicts, each naming both sides"],
  "catalysts": ["1-4 evidence-based things that could support the case; no invented events"],
  "risks": ["2-4 evidence-based risks"],
  "scenarios": {
    "bull": "1-2 sentences, qualitative, no price targets and no probabilities",
    "base": "1-2 sentences, qualitative",
    "bear": "1-2 sentences, qualitative"
  },
  "whatToWatch": ["2-4 concrete, checkable things to monitor next"],
  "limitations": ["2-4 limitations that materially affect this interpretation"]
}`;

function buildUserPrompt(digest: string): string {
  return `Interpret the following evidence for one PSX-listed company.

===== EVIDENCE (authoritative — the only facts you may use) =====
${digest}
===== END EVIDENCE =====

Return JSON in exactly this shape, with no extra keys:
${OUTPUT_SHAPE}

Reminders before you answer:
- Every figure you cite must appear verbatim in the EVIDENCE above.
- No confidence value, no probability, no score of your own, no price target.
- NOT_APPLICABLE means absent by design (bank schema), not missing.
- Items under DELIBERATELY NOT COMPUTED must be described that way, not as unavailable.
- The KMI-30 figure is a valuation proxy, never "the KSE-100 P/E".
- Company news items are press mentions, never official filings or announcements.`;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Keys the model must never return. Anything score-shaped is stripped and flagged. */
const FORBIDDEN_KEYS = [
  "confidence", "score", "rating", "probability", "likelihood", "conviction",
  "certainty", "pricetarget", "targetprice", "target", "expectedreturn", "upside", "downside",
];

/** Phrasing that asserts certainty or invents quantified prediction. Fail closed. */
const FORBIDDEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b\d{1,3}\s*%\s*(chance|probability|likelihood|confiden)/i, label: "percentage likelihood" },
  { re: /\b(probability|chance|odds)\s+of\s+(a\s+)?(rise|gain|profit|increase|decline|drop)/i, label: "probability claim" },
  { re: /\bguarantee(d|s)?\b/i, label: "guarantee" },
  { re: /\bwill\s+(definitely\s+|certainly\s+)?(rise|fall|surge|crash|drop|climb|reach|hit|break out)\b/i, label: "certain prediction" },
  { re: /\b(price target|target price)\b/i, label: "price target" },
  { re: /\bai confidence\b/i, label: "AI confidence" },
  { re: /\bconfidence (score|level|rating)\b/i, label: "confidence score" },
  { re: /\b(certain|guaranteed|sure) to (rise|fall|profit|gain)\b/i, label: "certainty claim" },
  // Score-shaped verdicts in prose. The schema has no numeric field, so the
  // only way the model can smuggle a rating back in is by writing one out.
  { re: /\b\d{1,2}\s*(out of|\/)\s*(10|100)\b/, label: "self-assigned rating" },
  { re: /\b(i|we)\s+(would\s+)?rate\b/i, label: "self-assigned rating" },
  { re: /\bmy (rating|score|conviction)\b/i, label: "self-assigned rating" },
  // Claiming a value for something we deliberately do not compute. Scoped to
  // "<indicator> <number>" so the model can still correctly SAY that ATR is
  // deliberately not computed — which it should.
  { re: /\b(atr|average true range)\b[^.]{0,20}?\d/i, label: "fabricated ATR value" },
  { re: /\b(support|resistance)\s+(level\s+)?(at|of|near|around)\s+(pkr\s*)?\d/i, label: "fabricated support/resistance level" },
  { re: /\breward[/\s-]*(to[\s-]*)?risk\b[^.]{0,20}?\d\s*(:|to)\s*\d/i, label: "fabricated reward/risk ratio" },
  // Asserting an index P/E we have no data for (the KMI-30 proxy is not it).
  { re: /kse-?\s?100[^.]{0,40}p\/e[^.]{0,15}\d/i, label: "fabricated KSE-100 P/E" },
];

/**
 * Indicator periods, score denominators and similar structural numbers that
 * legitimately appear in prose without being a claim about this company.
 */
const STRUCTURAL_NUMBERS = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 20, 25, 26, 30, 35, 50, 52, 100, 200, 252,
]);

/**
 * Reject at two. The asymmetry matters: a rejected analysis costs the reader
 * nothing (the deterministic page is untouched and the status explains
 * itself), while an accepted fabricated figure is a number an investor might
 * act on. One stray figure is tolerated with a visible warning because
 * rounding and restatement produce occasional near-misses; two is a pattern.
 */
const MAX_UNGROUNDED_NUMBERS = 1;

function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d[\d,]*\.?\d*/g) ?? [];
  return matches
    .map((m) => parseFloat(m.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

/**
 * A number is grounded if it appears in the evidence (allowing for the model
 * rounding it), is a structural constant, or is a plausible fiscal year.
 */
function isGrounded(n: number, evidence: number[]): boolean {
  const abs = Math.abs(n);
  if (STRUCTURAL_NUMBERS.has(abs)) return true;
  if (Number.isInteger(abs) && abs >= 1900 && abs <= 2100) return true; // fiscal years
  return evidence.some((e) => Math.abs(Math.abs(e) - abs) <= Math.max(0.05, Math.abs(e) * 0.01));
}

function asStringArray(v: unknown, max: number, maxLen: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((s) => (s.length > maxLen ? `${s.slice(0, maxLen)}…` : s));
  return out;
}

function asProse(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

/** Recursively remove score-shaped keys the model was told not to produce. */
function stripForbiddenKeys(value: unknown, found: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => stripForbiddenKeys(v, found));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const norm = k.toLowerCase().replace(/[^a-z]/g, "");
      if (FORBIDDEN_KEYS.includes(norm)) {
        found.push(k);
        continue;
      }
      out[k] = stripForbiddenKeys(v, found);
    }
    return out;
  }
  return value;
}

export interface ValidationOutcome {
  analysis: DeepDiveAnalysis | null;
  /** Why it was rejected, when analysis is null. */
  rejection: string | null;
  warnings: string[];
}

/**
 * The enforcement layer. The prompt asks; this verifies. Anything that fails
 * schema, uses forbidden phrasing, or cites numbers that don't exist in the
 * evidence is rejected outright — never shown, never cached.
 */
export function validateAnalysis(
  raw: unknown,
  digest: string,
  meta: Omit<DeepDiveAnalysisMeta, "groundingWarnings">
): ValidationOutcome {
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { analysis: null, rejection: "Model output was not a JSON object.", warnings };
  }

  const strippedKeys: string[] = [];
  const cleaned = stripForbiddenKeys(raw, strippedKeys) as Record<string, unknown>;
  if (strippedKeys.length > 0) {
    warnings.push(`Removed disallowed field(s) from model output: ${[...new Set(strippedKeys)].join(", ")}`);
  }

  const summary = asProse(cleaned.summary, 1200);
  const technicalInterpretation = asProse(cleaned.technicalInterpretation, 1200);
  const valuationInterpretation = asProse(cleaned.valuationInterpretation, 1200);
  const fundamentalInterpretation = asProse(cleaned.fundamentalInterpretation, 1200);
  const marketInterpretation = asProse(cleaned.marketInterpretation, 1200);
  const riskInterpretation = asProse(cleaned.riskInterpretation, 1200);

  const missing: string[] = [];
  if (!summary) missing.push("summary");
  if (!technicalInterpretation) missing.push("technicalInterpretation");
  if (!valuationInterpretation) missing.push("valuationInterpretation");
  if (!fundamentalInterpretation) missing.push("fundamentalInterpretation");
  if (!marketInterpretation) missing.push("marketInterpretation");
  if (!riskInterpretation) missing.push("riskInterpretation");

  const scenariosRaw = cleaned.scenarios as Record<string, unknown> | undefined;
  const bull = asProse(scenariosRaw?.bull, 600);
  const base = asProse(scenariosRaw?.base, 600);
  const bear = asProse(scenariosRaw?.bear, 600);
  if (!bull || !base || !bear) missing.push("scenarios.bull/base/bear");

  const confluence = asStringArray(cleaned.confluence, 6, 400);
  const divergence = asStringArray(cleaned.divergence, 6, 400);
  const catalysts = asStringArray(cleaned.catalysts, 6, 400);
  const risks = asStringArray(cleaned.risks, 6, 400);
  const whatToWatch = asStringArray(cleaned.whatToWatch, 6, 400);
  const limitations = asStringArray(cleaned.limitations, 6, 400);
  if (!confluence || !divergence || !catalysts || !risks || !whatToWatch || !limitations) {
    missing.push("one or more list fields (confluence/divergence/catalysts/risks/whatToWatch/limitations)");
  }

  if (missing.length > 0) {
    return {
      analysis: null,
      rejection: `Model output was missing or malformed: ${missing.join(", ")}.`,
      warnings,
    };
  }

  const analysis: DeepDiveAnalysis = {
    summary: summary!,
    technicalInterpretation: technicalInterpretation!,
    valuationInterpretation: valuationInterpretation!,
    fundamentalInterpretation: fundamentalInterpretation!,
    marketInterpretation: marketInterpretation!,
    riskInterpretation: riskInterpretation!,
    confluence: confluence!,
    divergence: divergence!,
    catalysts: catalysts!,
    risks: risks!,
    scenarios: { bull: bull!, base: base!, bear: bear! },
    whatToWatch: whatToWatch!,
    limitations: limitations!,
    meta: { ...meta, groundingWarnings: [] },
  };

  // Everything the model actually wrote, as one blob, for content checks.
  const prose = [
    analysis.summary, analysis.technicalInterpretation, analysis.valuationInterpretation,
    analysis.fundamentalInterpretation, analysis.marketInterpretation, analysis.riskInterpretation,
    ...analysis.confluence, ...analysis.divergence, ...analysis.catalysts, ...analysis.risks,
    analysis.scenarios.bull, analysis.scenarios.base, analysis.scenarios.bear,
    ...analysis.whatToWatch, ...analysis.limitations,
  ].join("\n");

  const violations = FORBIDDEN_PATTERNS.filter(({ re }) => re.test(prose)).map(({ label }) => label);
  if (violations.length > 0) {
    return {
      analysis: null,
      rejection: `Model output used forbidden certainty/score language: ${[...new Set(violations)].join(", ")}.`,
      warnings,
    };
  }

  // Numeric grounding — every figure in the prose must trace to the evidence.
  const evidenceNumbers = extractNumbers(digest);
  const ungrounded = [...new Set(extractNumbers(prose).filter((n) => !isGrounded(n, evidenceNumbers)))];
  if (ungrounded.length > MAX_UNGROUNDED_NUMBERS) {
    return {
      analysis: null,
      rejection: `Model output cited ${ungrounded.length} figures absent from the evidence (${ungrounded.slice(0, 6).join(", ")}), which indicates fabricated data.`,
      warnings,
    };
  }
  if (ungrounded.length > 0) {
    warnings.push(`Figures not found in the evidence: ${ungrounded.join(", ")} — treat with caution.`);
  }

  analysis.meta.groundingWarnings = warnings;
  return { analysis, rejection: null, warnings };
}

// ─── Generation ──────────────────────────────────────────────────────────────

function extractJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch { /* fall through */ } }
  return null;
}

/** Never let a provider error carry a key into logs, Redis or the API response. */
function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[redacted]")
    .replace(/gsk_[a-zA-Z0-9_-]{10,}/g, "[redacted]")
    .replace(/AIza[a-zA-Z0-9_-]{16,}/g, "[redacted]")
    .replace(/Bearer\s+\S{10,}/gi, "Bearer [redacted]")
    .slice(0, 300);
}

/**
 * Injection seam for the two I/O boundaries of this layer: the model call and
 * the cache. Production never passes these — the defaults are the real
 * provider dispatch and the real Redis store.
 *
 * They exist because this is the one part of the app where "it looked right
 * when I tried it" is not good enough: the grounding rules, the one-call
 * guarantee, and the cache's never-store-bad-output invariant all need to be
 * verifiable deterministically, without a live key or a live Redis.
 */
export interface DeepDiveAIDeps {
  complete?: typeof completeJSON;
  getCached?: typeof getCachedAnalysis;
  setCached?: typeof cacheAnalysis;
  invalidate?: typeof invalidateAnalysis;
}

const MAX_TOKENS = 2600;

/**
 * Interpret one DeepDiveData object. Exactly one model call, or none.
 *
 * Refuses to run at all when there is too little deterministic evidence to
 * interpret honestly — with no technicals and no fundamentals there is
 * nothing to reason over, and asking anyway is how you get a confident essay
 * about a company the model knows nothing about.
 */
export async function getDeepDiveAnalysis(
  data: DeepDiveData,
  config: ProviderConfig,
  deps: DeepDiveAIDeps = {}
): Promise<DeepDiveAIResult> {
  const complete = deps.complete ?? completeJSON;
  if (!data.technical.available && !data.fundamentals.available) {
    return {
      analysis: null,
      status: "insufficient-evidence",
      detail: "Neither technical nor fundamental data is available for this ticker, so there is nothing to interpret.",
      cached: false,
    };
  }

  const digest = buildEvidenceDigest(data);

  let text: string;
  try {
    text = await complete(config, SYSTEM_PROMPT, buildUserPrompt(digest), MAX_TOKENS);
  } catch (err) {
    return {
      analysis: null,
      status: "provider-failed",
      detail: `AI provider request failed: ${sanitizeError(err)}`,
      cached: false,
    };
  }

  const parsed = extractJSON(text);
  const outcome = validateAnalysis(parsed, digest, {
    provider: config.provider,
    model: config.model ?? "default",
    generatedAt: new Date().toISOString(),
    dataVersion: data.meta.dataVersion,
    tradingDate: data.meta.tradingDate,
  });

  if (!outcome.analysis) {
    return {
      analysis: null,
      status: "invalid-output",
      detail: outcome.rejection ?? "Model output failed validation.",
      cached: false,
    };
  }

  return { analysis: outcome.analysis, status: "ok", detail: null, cached: false };
}

// ─── Orchestration: cache + policy ───────────────────────────────────────────

/**
 * Server-side AI key for Deep Dive. Deep Dive renders on the server, so the
 * browser's BYOK key from Settings isn't available to it; this mirrors the
 * cron scan's resolution instead. `DEEPDIVE_*` wins if set, so this feature
 * can be pointed at a different key or disabled independently of the scan,
 * otherwise it shares the same provider key the rest of the server uses.
 */
export function resolveDeepDiveAIConfig(): ProviderConfig | null {
  const candidates: ProviderConfig["provider"][] = ["groq", "claude", "gemini", "openai"];
  for (const provider of candidates) {
    const envKey = provider.toUpperCase();
    const apiKey = process.env[`DEEPDIVE_${envKey}_API_KEY`] ?? process.env[`${envKey}_API_KEY`];
    if (apiKey) return { provider, apiKey, model: DEFAULT_MODELS[provider] };
  }
  return null;
}

export interface ResolveAnalysisOptions {
  /** Allow a live model call on cache miss. Default false: a plain page view
   *  reads cache only, so opening Deep Dive can never silently cost money. */
  generate?: boolean;
  /** Ignore and replace any cached analysis for this evidence version — the
   *  "Re-analyze" path. Implies generate. */
  forceRefresh?: boolean;
}

/**
 * The single entry point the API uses: cache first, one model call at most,
 * and never more than one per request.
 *
 * Failure is always soft. Whatever goes wrong — no key, no Redis, provider
 * down, malformed output — this returns a null analysis with a status
 * explaining why, and the deterministic Deep Dive is unaffected.
 */
export async function resolveDeepDiveAnalysis(
  data: DeepDiveData,
  options: ResolveAnalysisOptions = {},
  deps: DeepDiveAIDeps = {}
): Promise<DeepDiveAIResult> {
  const { generate = false, forceRefresh = false } = options;
  const getCached = deps.getCached ?? getCachedAnalysis;
  const setCached = deps.setCached ?? cacheAnalysis;
  const invalidate = deps.invalidate ?? invalidateAnalysis;
  const ticker = data.identity.ticker;
  const version = data.meta.dataVersion;

  if (forceRefresh) {
    await invalidate(ticker, version);
  } else {
    const cached = await getCached(ticker, version);
    if (cached) return { analysis: cached, status: "ok", detail: null, cached: true };
  }

  if (!generate && !forceRefresh) {
    return {
      analysis: null,
      status: "not-generated",
      detail: "No cached interpretation exists for this version of the data, and generation was not requested.",
      cached: false,
    };
  }

  const config = resolveDeepDiveAIConfig();
  if (!config) {
    return {
      analysis: null,
      status: "no-provider",
      detail: "No server-side AI key is configured, so interpretation is unavailable. The deterministic analysis above is unaffected.",
      cached: false,
    };
  }

  const result = await getDeepDiveAnalysis(data, config, deps);

  // Only validated output is ever cached, and a failure writes nothing —
  // so a bad run can't evict or overwrite a good stored analysis.
  if (result.analysis) {
    await setCached(ticker, version, result.analysis);
  }
  return result;
}
