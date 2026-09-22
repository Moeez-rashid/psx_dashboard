/**
 * Deterministic scan-freshness classification.
 *
 * Exists to answer one question honestly: is the Opportunities slate the
 * user is looking at CURRENT, or is it several trading sessions old? A
 * bare "Last scan {time}" timestamp answers a different question (when did
 * the code last run) and can look identical whether that run reflected
 * today's market or a stale session from last week — see DECISIONS.md /
 * the freshness incident this module was written to fix (a missing
 * server-side AI key silently blocked every scheduled scan for weeks while
 * the last manually-triggered scan kept rendering as if nothing were wrong).
 *
 * Deliberately clock-blind about market timing: this never asks "is it
 * after 9am" or "has today's session closed" — it only compares the scan's
 * own recorded TRADING date (PersistedScan.scanDate, resolved from the live
 * EOD feed) against today's PKT calendar date. That is what the brief means
 * by "use the actual scan metadata and trading-data date," not the clock.
 *
 * Known, disclosed limitation: PSX public holidays are not modeled. This
 * app has no holiday calendar anywhere (verified — there is nothing to
 * extend), and fabricating one risks being wrong in the opposite, worse
 * direction (silently treating a real holiday as a missed session, or
 * missing a real gap because a fabricated calendar excused it). Weekends
 * ARE handled, because they are a fixed, always-correct rule. A single PSX
 * holiday will make `tradingSessionsBehind` read one session higher than
 * reality on the days immediately after it — a false "stale" by at most a
 * handful of days a year — never a false "current." See the test suite's
 * "PSX holiday" case for the documented behavior this produces.
 */

import { pktNow } from "./format";
import type { PersistedScan } from "./scan-store";

export type ScanFreshnessStatus =
  | "no-scan"  // no successful scan has ever completed
  | "current"  // reflects today's session, or the one normal session of lag
  | "stale";   // at least one trading session beyond that normal lag is missing

export interface ScanFreshness {
  status: ScanFreshnessStatus;
  /** Weekday calendar days strictly after the scan's trading date, up to and
   *  including today (PKT) — a proxy for trading sessions possibly missed.
   *  Null when there is no scan, or its trading date can't be parsed. */
  tradingSessionsBehind: number | null;
  /** The PSX trading/market-data date this scan reflects — PersistedScan.scanDate. */
  scanDate: string | null;
  /** When the scan itself finished running — PersistedScan.completedAt. */
  scanCompletedAt: string | null;
  /** True when a scheduled (cron) attempt exists for TODAY (PKT) and did not
   *  complete successfully — independent of how stale `latest` is, since a
   *  same-day failure is worth surfacing even when the previous good scan is
   *  still within its normal one-session lag. */
  todayAttemptFailed: boolean;
}

/** `tradingSessionsBehind` at or below this is normal, expected lag — e.g. a
 *  Monday-morning scan legitimately reflects Friday's close before Monday's
 *  own session has even opened (see vercel.json's cron schedule). Two or
 *  more means a session that SHOULD have been scanned was missed. */
const CURRENT_THRESHOLD_SESSIONS = 1;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a "YYYY-MM-DD" string as a UTC-midnight instant. These date
 *  strings carry no timezone of their own (they are calendar dates, not
 *  instants) — anchoring both sides to UTC keeps the day-counting below
 *  immune to the machine's local timezone, which has nothing to do with
 *  either PKT or the trading calendar. */
function parseDateUTC(s: unknown): number | null {
  if (typeof s !== "string" || !DATE_RE.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * Count weekdays (Mon–Fri) strictly after `fromDateStr` up to and including
 * `toDateStr`. Returns null for unparseable input or when `to` precedes
 * `from` (a scan claiming a future trading date — never trusted, never
 * turned into a negative count).
 *
 * Exported standalone because it's the one piece of this module worth
 * testing in complete isolation from PersistedScan/status semantics.
 */
export function countWeekdaysBetween(fromDateStr: string, toDateStr: string): number | null {
  const from = parseDateUTC(fromDateStr);
  const to = parseDateUTC(toDateStr);
  if (from === null || to === null || to < from) return null;

  let count = 0;
  for (let t = from + DAY_MS; t <= to; t += DAY_MS) {
    const day = new Date(t).getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/**
 * The status/tradingSessionsBehind half of the classification, from a raw
 * trading-date string alone — no PersistedScan wrapper required. Exported
 * standalone so a client that already holds a fresh scan result in memory
 * (e.g. right after a manual scan completes) can recompute the SAME
 * classification live, without re-fetching /api/scan/latest just to learn
 * what it already knows.
 */
export function freshnessFromScanDate(
  scanDate: string | null,
  nowPKT: Date = pktNow()
): { status: Exclude<ScanFreshnessStatus, "no-scan">; tradingSessionsBehind: number | null } {
  const today = `${nowPKT.getFullYear()}-${String(nowPKT.getMonth() + 1).padStart(2, "0")}-${String(nowPKT.getDate()).padStart(2, "0")}`;
  const behind = scanDate ? countWeekdaysBetween(scanDate, today) : null;
  const status = behind !== null && behind <= CURRENT_THRESHOLD_SESSIONS ? "current" : "stale";
  return { status, tradingSessionsBehind: behind };
}

/**
 * The one entry point server-side consumers should use. Never throws, never
 * produces NaN — a malformed or missing date degrades to "stale"
 * (tradingSessionsBehind null) rather than either crashing or silently
 * reading as current, matching this module's one job: never let uncertain
 * data masquerade as fresh.
 *
 * `todayAttempt` is the by-date scan record (any status) for today's PKT
 * calendar date, independent of `latest` — pass null when there is none
 * (cron hasn't fired yet today, or today isn't a scheduled day).
 */
export function computeScanFreshness(
  latest: PersistedScan | null,
  todayAttempt: PersistedScan | null,
  nowPKT: Date = pktNow()
): ScanFreshness {
  const todayAttemptFailed = todayAttempt !== null && todayAttempt.status !== "success";

  if (!latest) {
    return {
      status: "no-scan",
      tradingSessionsBehind: null,
      scanDate: null,
      scanCompletedAt: null,
      todayAttemptFailed,
    };
  }

  const scanDate = typeof latest.scanDate === "string" ? latest.scanDate : null;
  const scanCompletedAt = typeof latest.completedAt === "string" ? latest.completedAt : null;
  const { status, tradingSessionsBehind } = freshnessFromScanDate(scanDate, nowPKT);

  return { status, tradingSessionsBehind, scanDate, scanCompletedAt, todayAttemptFailed };
}
