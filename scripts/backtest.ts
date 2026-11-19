/**
 * Backtest of the Technical Score.
 * ---------------------------------------------------------------------------
 * Replays lib/technicals.ts day by day over PSX's published end-of-day files,
 * using only the data that existed on each day, and measures what each label
 * did over the next 5 / 10 / 20 sessions — against the average Shariah stock
 * on the same day (equal-weighted), so a rising market doesn't flatter it.
 *
 * It also tests the candidate rules before any of them reach the app:
 *   • rupee liquidity floor vs the 200k-share floor
 *   • market breadth (% of Shariah stocks above their EMA50) as a regime gate
 *   • the 200-day average as a long-term trend gate
 *   • an ATR stop / 2R target exit plan
 *
 * usage:  npx tsx scripts/backtest.ts [sessions=480]
 * Session files are cached in .backtest-cache/ (gitignored); re-runs are offline.
 *
 * Honest limits, printed with the report: the Shariah list is TODAY's (stocks
 * that left the index are missing — survivorship bias), samples from
 * consecutive days overlap (so they are not independent), the news-driven
 * sector expansion can't be replayed, and trading costs are not deducted.
 */
import fs from "node:fs";
import path from "node:path";
import { getEodDay, assemble, type EodDay, type EodRow, type EODPoint } from "../lib/psx-eod";
import { getIndexConstituents } from "../lib/psx-snapshot";
import { scoreStock, compareByTechnicalScore, type TechnicalScore } from "../lib/technicals";

const SESSIONS = Number(process.argv[2]) || 480;
const CACHE = path.join(process.cwd(), ".backtest-cache");
const WINDOW = 262;          // history handed to the scorer each day (matches production)
const FIRST_TEST = 200;      // first test session index — SMA200 needs 200 sessions
const HORIZONS = [5, 10, 20] as const;
const SLATE = 8;             // the scanner's maxPicks
const MIN_SCORE = 45;        // the scanner's minTechnicalScore
const DAY_MS = 86_400_000;

// ─── Session files (disk-cached) ────────────────────────────────────────────

async function loadDay(date: string): Promise<EodDay | null> {
  const file = path.join(CACHE, `${date}.json`);
  if (fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as { date: string; rows: EodRow[] } | null;
    return j ? { date: j.date, rows: new Map(j.rows.map((r) => [r.symbol, r])) } : null;
  }
  let day: EodDay | null = null;
  for (let attempt = 0; ; attempt++) {
    try { day = await getEodDay(date); break; }
    catch (e) { if (attempt >= 2) throw e; await new Promise((r) => setTimeout(r, 1500)); }
  }
  fs.writeFileSync(file, JSON.stringify(day ? { date: day.date, rows: [...day.rows.values()] } : null));
  return day;
}

async function loadSessions(n: number): Promise<EodDay[]> {
  fs.mkdirSync(CACHE, { recursive: true });
  // Yesterday backwards: today's file may not be out yet, and an empty result must not be cached.
  const dates: string[] = [];
  let t = Date.now() - DAY_MS;
  while (dates.length < Math.ceil(n * 1.12) + 15) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(d.toISOString().slice(0, 10));
    t -= DAY_MS;
  }
  const found: EodDay[] = [];
  for (let i = 0; i < dates.length && found.length < n; i += 6) {
    const batch = await Promise.all(dates.slice(i, i + 6).map(loadDay));
    for (const d of batch) if (d) found.push(d);
    process.stderr.write(`\r  sessions loaded: ${found.length}/${n}`);
  }
  process.stderr.write("\n");
  return found.sort((a, b) => b.date.localeCompare(a.date)).slice(0, n); // newest first
}

// ─── Stats helpers ──────────────────────────────────────────────────────────

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x: number, d = 2) => (Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%` : "—");
const share = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—");

interface Rec {
  t: number;              // session index (oldest = 0)
  sym: string;
  s: TechnicalScore;
  fwd: Partial<Record<number, number>>; // horizon → raw return
  j: number;              // index into the symbol's oldest-first bars
}

/** Mean raw return, mean excess vs the same-day benchmark, share beating it. */
function stats(recs: Rec[], h: number, bench: Map<number, number>) {
  const raw: number[] = [];
  const ex: number[] = [];
  for (const r of recs) {
    const f = r.fwd[h];
    const b = bench.get(r.t);
    if (f === undefined || b === undefined) continue;
    raw.push(f);
    ex.push(f - b);
  }
  return { n: raw.length, raw: mean(raw), med: median(raw), ex: mean(ex), beat: mean(ex.map((e) => (e > 0 ? 1 : 0))) };
}

function row(label: string, recs: Rec[], bench: Map<number, number>[]) {
  const cells = HORIZONS.map((h, i) => {
    const s = stats(recs, h, bench[i]);
    return `${pct(s.ex)} (${share(s.beat)})`;
  });
  const s10 = stats(recs, 10, bench[1]);
  return `| ${label} | ${s10.n.toLocaleString()} | ${cells.join(" | ")} | ${pct(s10.raw)} |`;
}
const HEAD = "| Group | n (10d) | 5d excess (beat) | 10d excess (beat) | 20d excess (beat) | 10d raw |\n|---|---:|---:|---:|---:|---:|";

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.error(`Loading ${SESSIONS} sessions…`);
  const days = await loadSessions(SESSIONS);
  const shariah = new Set(await getIndexConstituents("KMIALLSHR"));
  const histories = assemble(days); // split-adjusted, newest first
  const dates = days.map((d) => d.date).reverse(); // oldest first
  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const T = dates.length;

  // Per symbol: oldest-first bars, and for each session the latest bar on or before it.
  const bars = new Map<string, EODPoint[]>();
  const pos = new Map<string, Int32Array>();   // exact bar on session t, or -1
  const upTo = new Map<string, Int32Array>();  // latest bar on or before session t, or -1
  for (const sym of shariah) {
    const h = histories.get(sym);
    if (!h || h.length < 60) continue;
    const b = [...h].reverse();
    const p = new Int32Array(T).fill(-1);
    b.forEach((x, j) => { const i = dateIdx.get(x.date); if (i !== undefined) p[i] = j; });
    const u = new Int32Array(T).fill(-1);
    let last = -1;
    for (let i = 0; i < T; i++) { if (p[i] >= 0) last = p[i]; u[i] = last; }
    bars.set(sym, b); pos.set(sym, p); upTo.set(sym, u);
  }

  // Score every Shariah stock on every test day.
  console.error(`Scoring ${bars.size} Shariah stocks over ${T - FIRST_TEST} test sessions…`);
  const recs: Rec[] = [];
  const breadth = new Map<number, number>(); // t → share of scoreable stocks above EMA50
  for (let t = FIRST_TEST; t < T; t++) {
    let above = 0, counted = 0;
    for (const [sym, b] of bars) {
      const j = pos.get(sym)![t];
      if (j < 59) continue;
      const window = b.slice(Math.max(0, j - WINDOW + 1), j + 1).reverse();
      const s = scoreStock(sym, window, 0);
      if (!s) continue;
      s.reasons = []; // memory
      counted++;
      if (s.priceVsEma50 === "above") above++;
      const fwd: Rec["fwd"] = {};
      for (const hz of HORIZONS) {
        if (t + hz >= T) continue;
        const k = upTo.get(sym)![t + hz];
        if (k > j) fwd[hz] = b[k].price / b[j].price - 1;
        else if (k === j) fwd[hz] = 0; // untraded since — flat
      }
      recs.push({ t, sym, s, fwd, j });
    }
    if (counted >= 20) breadth.set(t, above / counted);
  }

  const liqShares = (r: Rec) => r.s.avgVolume20d >= 200_000;
  const liqRupees = (r: Rec) => r.s.avgValue20d >= 5_000_000;

  /** Same-day equal-weighted benchmark over a universe. */
  const benchFor = (universe: (r: Rec) => boolean) =>
    HORIZONS.map((h) => {
      const acc = new Map<number, number[]>();
      for (const r of recs) {
        const f = r.fwd[h];
        if (f === undefined || !universe(r)) continue;
        let a = acc.get(r.t); if (!a) acc.set(r.t, (a = [])); a.push(f);
      }
      return new Map([...acc].map(([t, a]) => [t, mean(a)]));
    });

  const slateOf = (universe: (r: Rec) => boolean) => {
    const byDay = new Map<number, Rec[]>();
    for (const r of recs) {
      if (!universe(r) || r.s.technicalScore < MIN_SCORE) continue;
      let a = byDay.get(r.t); if (!a) byDay.set(r.t, (a = [])); a.push(r);
    }
    const out: Rec[] = [];
    for (const a of byDay.values()) out.push(...a.sort((x, y) => compareByTechnicalScore(x.s, y.s)).slice(0, SLATE));
    return out;
  };

  const L = [`# Technical Score backtest`, ""];
  const first = dates[FIRST_TEST], lastD = dates[T - 1];
  L.push(`Test window **${first} → ${lastD}** (${T - FIRST_TEST} sessions), ${bars.size} Shariah (KMI All Share) stocks, scored with the production scorer on the history available each day.`);
  L.push(`"Excess" = the group's average return minus the average Shariah stock (same liquidity filter) over the same days. "Beat" = share of picks that did better than that average. Costs not deducted (≈0.3–0.5% round trip on PSX).`, "");

  // 1 ─ Does the score work at all? (current production liquidity rule)
  const U = recs.filter(liqShares);
  const benchS = benchFor(liqShares);
  L.push(`## 1. Labels vs the average Shariah stock (current rule: ≥200k shares/day)`, "", HEAD);
  for (const sig of ["STRONG_BUY", "BUY", "NEUTRAL", "AVOID"] as const) L.push(row(sig, U.filter((r) => r.s.technicalSignal === sig), benchS));
  const slate = slateOf(liqShares);
  L.push(row("Daily top-8 slate", slate, benchS));
  L.push(row("All (benchmark)", U, benchS), "");

  // Score buckets — is higher monotonically better?
  L.push(`### By score band`, "", HEAD);
  for (const [lo, hi] of [[0, 40], [40, 50], [50, 60], [60, 70], [70, 78], [78, 101]]) {
    L.push(row(`${lo}–${hi === 101 ? 100 : hi - 1}`, U.filter((r) => r.s.technicalScore >= lo && r.s.technicalScore < hi), benchS));
  }
  L.push("");

  // Month-by-month consistency of the slate.
  const byMonth = new Map<string, Rec[]>();
  for (const r of slate) { const m = dates[r.t].slice(0, 7); let a = byMonth.get(m); if (!a) byMonth.set(m, (a = [])); a.push(r); }
  const monthEx = [...byMonth].map(([m, a]) => [m, stats(a, 10, benchS[1])] as const).filter(([, s]) => s.n > 0);
  L.push(`### Top-8 slate, month by month (10-day excess)`, "");
  L.push(monthEx.map(([m, s]) => `${m} ${pct(s.ex, 1)}`).join(" · "));
  L.push(`Beat the average in **${monthEx.filter(([, s]) => s.ex > 0).length} of ${monthEx.length}** months.`, "");

  // 2 ─ Liquidity: shares vs rupees
  const benchR = benchFor(liqRupees);
  const perDay = (f: (r: Rec) => boolean) => recs.filter(f).length / (T - FIRST_TEST);
  const pennyPass = recs.filter((r) => liqShares(r) && !liqRupees(r));
  L.push(`## 2. Liquidity: 200k shares vs PKR 5M/day`, "");
  L.push(`Eligible stocks per day: shares rule ${perDay(liqShares).toFixed(0)}, rupee rule ${perDay(liqRupees).toFixed(0)}, both ${perDay((r) => liqShares(r) && liqRupees(r)).toFixed(0)}.`);
  L.push(`Passing on shares but under PKR 5M/day: ${(pennyPass.length / (T - FIRST_TEST)).toFixed(1)} per day, median price PKR ${median(pennyPass.map((r) => r.s.currentPrice)).toFixed(1)}.`, "", HEAD);
  L.push(row("Slate, shares rule", slate, benchS));
  L.push(row("Slate, rupee rule", slateOf(liqRupees), benchR));
  L.push(row("Slate, both rules", slateOf((r) => liqShares(r) && liqRupees(r)), benchFor((r) => liqShares(r) && liqRupees(r))));
  L.push(row("Slate, either rule", slateOf((r) => liqShares(r) || liqRupees(r)), benchFor((r) => liqShares(r) || liqRupees(r))));
  L.push(row("Shares-only names (under 5M)", pennyPass, benchS));
  // Is the shares-only group's return broad, or a few outliers?
  const bySym = new Map<string, number[]>();
  for (const r of pennyPass) { const f = r.fwd[20]; if (f === undefined) continue; let a = bySym.get(r.sym); if (!a) bySym.set(r.sym, (a = [])); a.push(f); }
  const contrib = [...bySym].map(([sym, a]) => [sym, a.reduce((x, y) => x + y, 0), a.length] as const).sort((a, b) => b[1] - a[1]);
  const total = contrib.reduce((x, c) => x + c[1], 0);
  const top5 = contrib.slice(0, 5).reduce((x, c) => x + c[1], 0);
  L.push("", `Shares-only names: ${bySym.size} symbols; the top 5 (${contrib.slice(0, 5).map((c) => c[0]).join(", ")}) account for ${share(top5 / total)} of their summed 20-day return; median 20-day return ${pct(median(pennyPass.map((r) => r.fwd[20]).filter((x): x is number => x !== undefined)))}.`, "");

  // 3 ─ Market regime from breadth
  const bvals = [...breadth.values()].sort((a, b) => a - b);
  L.push(`## 3. Market breadth (% of Shariah stocks above EMA50)`, "");
  L.push(`Distribution over the test: min ${share(bvals[0])}, 25th ${share(bvals[Math.floor(bvals.length * 0.25)])}, median ${share(median(bvals))}, 75th ${share(bvals[Math.floor(bvals.length * 0.75)])}, max ${share(bvals[bvals.length - 1])}.`, "");
  L.push(`Raw returns matter here (a weak market drags everything), so the table shows raw 10-day returns.`, "");
  L.push(`| Breadth | days | STRONG_BUY 10d raw | BUY 10d raw | Slate 10d raw | Slate 10d excess | All stocks 10d raw |`, `|---|---:|---:|---:|---:|---:|---:|`);
  for (const [lo, hi, label] of [[0, 0.3, "< 30% (weak)"], [0.3, 0.5, "30–50%"], [0.5, 0.7, "50–70%"], [0.7, 1.01, "≥ 70% (strong)"]] as const) {
    const inB = (r: Rec) => { const b = breadth.get(r.t); return b !== undefined && b >= lo && b < hi; };
    const nDays = [...breadth.values()].filter((b) => b >= lo && b < hi).length;
    const sb = stats(U.filter((r) => inB(r) && r.s.technicalSignal === "STRONG_BUY"), 10, benchS[1]);
    const b = stats(U.filter((r) => inB(r) && r.s.technicalSignal === "BUY"), 10, benchS[1]);
    const sl = stats(slate.filter(inB), 10, benchS[1]);
    const all = stats(U.filter(inB), 10, benchS[1]);
    L.push(`| ${label} | ${nDays} | ${pct(sb.raw)} (n ${sb.n}) | ${pct(b.raw)} (n ${b.n}) | ${pct(sl.raw)} | ${pct(sl.ex)} | ${pct(all.raw)} |`);
  }
  L.push("");

  // 4 ─ Long-term trend: SMA200
  L.push(`## 4. Long-term trend (200-day average)`, "", HEAD);
  for (const sig of ["STRONG_BUY", "BUY"] as const) {
    const g = U.filter((r) => r.s.technicalSignal === sig && r.s.sma200 !== null);
    L.push(row(`${sig} above 200-day`, g.filter((r) => r.s.currentPrice >= r.s.sma200!), benchS));
    L.push(row(`${sig} below 200-day`, g.filter((r) => r.s.currentPrice < r.s.sma200!), benchS));
  }
  L.push("");

  // 5 ─ Exit plan: ATR stop, 2R target, 20-session limit
  L.push(`## 5. Exit plan on the daily top-8 slate (ATR stop, target 2× the risk, max 20 sessions)`, "");
  L.push(`Entry at the scan-day close. Gap through a level fills at the open; a day touching both counts as the stop (conservative).`, "");
  L.push(`| Stop | trades | target hit | stopped | timed out | avg result (R) | avg return | plain 20d hold |`, `|---|---:|---:|---:|---:|---:|---:|---:|`);
  for (const k of [1.5, 2, 3]) {
    let tgt = 0, stp = 0, out = 0;
    const rs: number[] = [], rets: number[] = [], hold: number[] = [];
    for (const r of slate) {
      const atr = r.s.atr14;
      if (!atr || r.t + 20 >= T) continue;
      const b = bars.get(r.sym)!;
      const entry = b[r.j].price;
      const risk = k * atr;
      const stop = entry - risk, target = entry + 2 * risk;
      const lastJ = upTo.get(r.sym)![r.t + 20];
      let exit = b[lastJ].price, how = "out";
      for (let j = r.j + 1; j <= lastJ; j++) {
        const x = b[j];
        const lo = x.low ?? x.price, hi = x.high ?? x.price, op = x.open || x.price;
        if (op <= stop) { exit = op; how = "stop"; break; }
        if (lo <= stop) { exit = stop; how = "stop"; break; }
        if (op >= target) { exit = op; how = "target"; break; }
        if (hi >= target) { exit = target; how = "target"; break; }
      }
      if (how === "target") tgt++; else if (how === "stop") stp++; else out++;
      rs.push((exit - entry) / risk);
      rets.push(exit / entry - 1);
      hold.push(b[lastJ].price / entry - 1);
    }
    const n = rs.length;
    L.push(`| ${k}× ATR | ${n} | ${share(tgt / n)} | ${share(stp / n)} | ${share(out / n)} | ${rs.length ? mean(rs).toFixed(2) : "—"} | ${pct(mean(rets))} | ${pct(mean(hold))} |`);
  }
  const atrPcts = slate.filter((r) => r.s.atr14).map((r) => r.s.atr14! / r.s.currentPrice);
  L.push("", `Typical daily range (ATR) of slate stocks: median ${pct(median(atrPcts))} of price.`, "");

  L.push(`## Limits`, "");
  L.push(`- Shariah membership is today's list, so stocks that dropped out of KMI All Share are missing (survivorship bias, usually flatters results).`);
  L.push(`- Picks on consecutive days overlap heavily, so the n's overstate independent evidence; month-by-month consistency is the fairer read.`);
  L.push(`- One period of PSX history: it can reject a rule, not prove one. Thresholds were fixed before running, not tuned to this output.`);
  L.push(`- The live scanner also adds news-flagged sectors and an AI narrative; neither is replayed here.`);

  console.log(L.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
