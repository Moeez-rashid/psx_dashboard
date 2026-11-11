/**
 * End-of-day price history, built from PSX's published daily market-summary
 * files (dps.psx.com.pk/download/mkt_summary/YYYY-MM-DD.Z).
 *
 * Each file is a small zip holding one pipe-delimited table with every
 * instrument that traded that session:
 *
 *   06NOV2026|MEBL|0807|Meezan Bank LtdXD|551.98|552.5|544.61|550.25|539664|555.02|||
 *   date     |sym |sect|name(+flags)     |open  |high |low   |close |volume|ldcp
 *
 * Why this instead of a per-symbol timeseries endpoint: it is the exchange's
 * own published record, it needs one request per SESSION rather than one per
 * SYMBOL (a 130-session store serves every ticker in the market), and it
 * carries true high/low, which the old feed never had.
 *
 * Corporate actions: the file's LDCP is the exchange's reference price for
 * the session. When it differs from the previous session's close, the
 * exchange adjusted for a bonus/right/split, and every earlier bar is scaled
 * by the same ratio so indicators don't read the adjustment as a crash.
 */

import zlib from "node:zlib";
import { psxFetch } from "./psx-http";
import { recordFailure, recordSuccess } from "./cache";
import { pktDateStr } from "./format";

export interface EodRow {
  symbol: string;
  sector: string;
  name: string;
  /** Exchange markers carried on the name: XD (ex-dividend), XB (ex-bonus), XR (ex-right). */
  flags: string[];
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ldcp: number;
}

export interface EodDay {
  date: string; // YYYY-MM-DD
  rows: Map<string, EodRow>;
}

export interface EODPoint {
  timestamp: number;
  date: string;
  price: number; // close
  open: number;
  volume: number;
  high?: number;
  low?: number;
}

const SOURCE = "psx-eod";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Regular-market equities, funds, REITs and ETFs. Futures (40/41) and debt (36) are excluded. */
const EQUITY_SECTOR = /^08\d\d$/;
const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

// ─── Zip (single-entry) reader ──────────────────────────────────────────────

/** Extract the first file from a zip archive. Throws if the buffer is not a zip. */
export function unzipFirstEntry(buf: Buffer): Buffer {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip archive");
  // Sizes in the local header can be zero when a data descriptor is used, so
  // read them from the central directory, which is always authoritative.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: no end-of-central-directory record");
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error("zip: bad central directory");
  const method = buf.readUInt16LE(cd + 10);
  const compressedSize = buf.readUInt32LE(cd + 20);
  const localOffset = buf.readUInt32LE(cd + 42);
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compressedSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error(`zip: unsupported compression method ${method}`);
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function parseFileDate(raw: string): string | null {
  const m = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(raw.trim().toUpperCase());
  if (!m || !MONTHS[m[2]]) return null;
  return `${m[3]}-${MONTHS[m[2]]}-${m[1]}`;
}

function splitNameFlags(raw: string): { name: string; flags: string[] } {
  const flags: string[] = [];
  let name = raw.trim();
  // Flags are appended with no separator and can stack ("...LtdXDXB").
  for (;;) {
    const m = /(XD|XB|XR)$/.exec(name);
    if (!m) break;
    flags.unshift(m[1]);
    name = name.slice(0, -2).trim();
  }
  return { name, flags };
}

export function parseMarketSummary(text: string, expectedDate?: string): EodDay | null {
  const rows = new Map<string, EodRow>();
  let date: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const c = line.split("|");
    if (c.length < 10) continue;
    const sector = c[2].trim();
    if (!EQUITY_SECTOR.test(sector)) continue;
    const symbol = c[1].trim().toUpperCase();
    const close = Number(c[7]);
    if (!symbol || !Number.isFinite(close) || close <= 0) continue;
    date ??= parseFileDate(c[0]);
    const num = (s: string) => { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : 0; };
    const { name, flags } = splitNameFlags(c[3]);
    rows.set(symbol, {
      symbol, sector, name, flags,
      open: num(c[4]) || close,
      high: num(c[5]) || close,
      low: num(c[6]) || close,
      close,
      volume: num(c[8]),
      ldcp: num(c[9]),
    });
  }
  if (rows.size === 0) return null;
  return { date: date ?? expectedDate ?? "", rows };
}

// ─── Per-day loading ────────────────────────────────────────────────────────

interface DayEntry { day: EodDay | null; at: number }
const dayCache = new Map<string, DayEntry>();
const dayInflight = new Map<string, Promise<EodDay | null>>();

function ageInDays(date: string): number {
  return Math.round((Date.parse(`${pktDateStr()}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS);
}

/**
 * One session's table, or null when PSX published no file for that date
 * (weekend, holiday, or today's file not out yet). Network failures THROW —
 * "couldn't ask" is never recorded as "no session".
 */
export async function getEodDay(date: string): Promise<EodDay | null> {
  const hit = dayCache.get(date);
  const settled = ageInDays(date) > 3; // older files never change, and never appear late
  if (hit && (hit.day || settled || Date.now() - hit.at < 15 * 60 * 1000)) return hit.day;

  let p = dayInflight.get(date);
  if (!p) {
    p = (async () => {
      const res = await psxFetch(`/download/mkt_summary/${date}.Z`, {
        revalidate: settled ? 30 * 24 * 3600 : 600,
      });
      let day: EodDay | null = null;
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        // A missing date answers with an HTML page, not a zip.
        if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
          day = parseMarketSummary(unzipFirstEntry(buf).toString("latin1"), date);
          if (day) day.date = date;
        }
      } else if (res.status !== 404) {
        throw new Error(`PSX mkt_summary ${date} ${res.status}`);
      }
      dayCache.set(date, { day, at: Date.now() });
      return day;
    })().finally(() => dayInflight.delete(date));
    dayInflight.set(date, p);
  }
  return p;
}

// ─── Session window ─────────────────────────────────────────────────────────

const CONCURRENCY = 12;

function weekdaysBack(fromDate: string, count: number): string[] {
  const out: string[] = [];
  let t = Date.parse(`${fromDate}T00:00:00Z`);
  while (out.length < count) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(t).toISOString().slice(0, 10));
    t -= DAY_MS;
  }
  return out;
}

let sessionsInflight: Promise<EodDay[]> | null = null;
let sessionsLoaded: EodDay[] = []; // newest first
let latestKnownDate = "";
let latestCheckedAt = 0;

/**
 * The most recent `n` trading sessions, newest first. Loads lazily and only
 * ever extends: asking for 30 then 130 fetches just the 100 older files.
 */
export async function getRecentSessions(n: number): Promise<EodDay[]> {
  // Serialise loads so two callers never fetch the same window twice.
  while (sessionsInflight) await sessionsInflight.catch(() => undefined);

  const today = pktDateStr();
  const fresh = sessionsLoaded.length > 0 && sessionsLoaded[0].date === latestKnownDate && Date.now() - latestCheckedAt < 10 * 60 * 1000;
  if (fresh && sessionsLoaded.length >= n) return sessionsLoaded.slice(0, n);

  sessionsInflight = (async () => {
    // Generous candidate list: ~15 holidays a year on top of weekends.
    const candidates = weekdaysBack(today, Math.ceil(n * 1.12) + 12);
    const found: EodDay[] = [];
    let failures = 0;
    let lastErr: unknown;
    for (let i = 0; i < candidates.length && found.length < n; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(batch.map((d) => getEodDay(d)));
      for (const r of settled) {
        if (r.status === "fulfilled") { if (r.value) found.push(r.value); }
        else { failures++; lastErr = r.reason; }
      }
    }
    found.sort((a, b) => b.date.localeCompare(a.date));
    if (found.length === 0) {
      const err = lastErr instanceof Error ? lastErr : new Error("PSX market-summary files unavailable");
      recordFailure(SOURCE, err);
      throw err;
    }
    if (failures > 0) recordFailure(SOURCE, new Error(`${failures} session file(s) failed to load`));
    else recordSuccess(SOURCE);
    sessionsLoaded = found;
    latestKnownDate = found[0].date;
    latestCheckedAt = Date.now();
    historyCache.clear();
    return found;
  })().finally(() => { sessionsInflight = null; });

  return (await sessionsInflight).slice(0, n);
}

/** Date (YYYY-MM-DD) of the newest published session. */
export async function getLatestSessionDate(): Promise<string> {
  return (await getRecentSessions(1))[0].date;
}

/** The newest published session's full table. */
export async function getLatestSession(): Promise<EodDay> {
  return (await getRecentSessions(1))[0];
}

// ─── History assembly ───────────────────────────────────────────────────────

const historyCache = new Map<string, Map<string, EODPoint[]>>();
/** Below this an LDCP/previous-close gap is rounding, not a corporate action. */
const ADJUST_THRESHOLD = 0.005;

function assemble(days: EodDay[]): Map<string, EODPoint[]> {
  const out = new Map<string, EODPoint[]>(); // oldest first while building
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    const ts = Math.floor(Date.parse(`${day.date}T00:00:00Z`) / 1000);
    for (const row of day.rows.values()) {
      let pts = out.get(row.symbol);
      if (!pts) { pts = []; out.set(row.symbol, pts); }
      const prev = pts[pts.length - 1];
      if (prev && row.ldcp > 0 && prev.price > 0) {
        const factor = row.ldcp / prev.price;
        if (Math.abs(factor - 1) > ADJUST_THRESHOLD) {
          for (const p of pts) {
            p.price *= factor; p.open *= factor;
            if (p.high !== undefined) p.high *= factor;
            if (p.low !== undefined) p.low *= factor;
            p.volume = Math.round(p.volume / factor);
          }
        }
      }
      pts.push({ timestamp: ts, date: day.date, price: row.close, open: row.open, high: row.high, low: row.low, volume: row.volume });
    }
  }
  for (const pts of out.values()) pts.reverse(); // newest first, the shape every consumer expects
  return out;
}

/** Histories for every equity over the last `sessions` sessions, newest first. */
export async function getAllHistories(sessions: number): Promise<Map<string, EODPoint[]>> {
  const days = await getRecentSessions(sessions);
  const key = `${days.length}:${days[0].date}`;
  let h = historyCache.get(key);
  if (!h) {
    h = assemble(days);
    historyCache.set(key, h);
  }
  return h;
}

/** Sessions of history each consumer tier needs. */
export const HISTORY_SESSIONS = { sparkline: 32, technicals: 130, deepDive: 262 } as const;

export async function getEodHistory(symbol: string, sessions: number = HISTORY_SESSIONS.technicals): Promise<EODPoint[]> {
  return (await getAllHistories(sessions)).get(symbol.toUpperCase()) ?? [];
}
