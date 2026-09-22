import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { runFullScan, runNewsRefresh } from "@/lib/scanner";
import type { ProviderConfig } from "@/lib/providers";
import { DEFAULT_MODELS } from "@/lib/providers/types";
import { pktDateStr } from "@/lib/format";
import {
  acquireLock,
  releaseLock,
  saveSuccess,
  saveFailure,
  saveSkipped,
  getLatestScan,
  getLatestTradingDate,
  isScanStoreConfigured,
} from "@/lib/scan-store";

// Explicit rather than relying on the platform default: a full scan fans out
// across 30+ tickers plus two AI passes and the Dashboard's own copy already
// says "Takes 30–90 seconds" for the manual path. 120s gives comfortable
// margin under Vercel's cron-invoked-function ceiling (300s) while staying
// well inside the distributed lock's TTL below (240s), so a run that somehow
// used the full budget still can't outlive its own lock.
export const maxDuration = 120;

// In-memory cache for the last scan result (survives across requests in same process).
// This is a short-lived request-coalescing cache, NOT the persistence layer —
// see lib/scan-store.ts for that.
let cachedScan: { result: Awaited<ReturnType<typeof runFullScan>>; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolves the unattended cron scan's own server-side provider config —
 * completely separate from the browser's BYOK key, and never exposed to it.
 * Checked in this order: Groq first (free — the sensible default for an
 * unattended job with no cost ceiling of its own), then whichever paid
 * provider key has actually been configured. SCAN_<PROVIDER>_API_KEY lets the
 * cron use a different key than any other server-side use of the same
 * provider; the plain name is the fallback.
 */
function resolveServerScanConfig(): ProviderConfig | null {
  const candidates: ProviderConfig["provider"][] = ["groq", "claude", "gemini", "openai"];
  for (const provider of candidates) {
    const envKey = provider.toUpperCase();
    const apiKey = process.env[`SCAN_${envKey}_API_KEY`] ?? process.env[`${envKey}_API_KEY`];
    if (apiKey) return { provider, apiKey, model: DEFAULT_MODELS[provider] };
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, apiKey, model, mode } = body as {
      provider: string;
      apiKey: string;
      model?: string;
      mode?: "full" | "news-only" | "cached";
    };

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "provider and apiKey are required" },
        { status: 400 }
      );
    }

    const config: ProviderConfig = {
      provider: provider as ProviderConfig["provider"],
      apiKey,
      model,
    };

    // Return cached result if fresh enough and mode allows it
    if (
      mode === "cached" &&
      cachedScan &&
      Date.now() - cachedScan.at < CACHE_TTL_MS
    ) {
      return NextResponse.json({ ...cachedScan.result, fromCache: true });
    }

    // News-only refresh (lightweight) — not gated by the full-scan lock below.
    if (mode === "news-only") {
      const news = await runNewsRefresh(config);
      return NextResponse.json({ newsAnalysis: news });
    }

    // Full scan is expensive — hold the same distributed lock the scheduled
    // cron uses, so a manual click can't overlap a scheduled run (or another
    // manual click). Best-effort: if no store is configured, proceeds unlocked.
    const gotLock = await acquireLock();
    if (!gotLock) {
      return NextResponse.json(
        { error: "A scan is already running — please wait for it to finish and try again." },
        { status: 409 }
      );
    }

    const startedAt = new Date().toISOString();
    const id = randomUUID();

    try {
      const result = await runFullScan(config, {
        minTechnicalScore: 45,
        minAvgVolume: 200_000,
        maxPicks: 8,
      });

      cachedScan = { result, at: Date.now() };

      // Persist exactly like a scheduled scan (BYOK key is never stored — only the result is).
      // PKT, not UTC: scanDate is a trading-calendar date, and the two disagree
      // for five hours a day (UTC midnight is 5am PKT) — see lib/scan-freshness.ts.
      const scanDate = (await getLatestTradingDate()) ?? pktDateStr(new Date(result.timestamp));
      await saveSuccess({ id, startedAt, scanDate, trigger: "manual", results: result });

      // scanDate travels with the response so the frontend can show "Market
      // data: {scanDate}" right after a manual scan too, not only on the
      // next page load — see components/Dashboard.tsx's freshness display.
      return NextResponse.json({ ...result, scanDate });
    } catch (err) {
      const scanDate = pktDateStr();
      await saveFailure({ id, startedAt, scanDate, trigger: "manual", error: err });
      throw err;
    } finally {
      await releaseLock();
    }
  } catch (err) {
    console.error("[/api/scan]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}

// Scheduled cron hits GET (no body needed — uses server-side env API key).
// Vercel sends `Authorization: Bearer $CRON_SECRET` automatically on its own
// cron invocations when CRON_SECRET is set — see vercel.json + Vercel docs.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Unattended scans use a server-side key — never the browser's BYOK key.
  // Deliberately NOT a hard-stop when absent: runFullScan() degrades to a
  // fully valid, current, deterministic Technical-Score slate without one —
  // the same "no AI narrative" outcome it already produces when a configured
  // provider's call fails mid-run. Root-caused in production: this used to
  // return 503 here unconditionally, which meant a single missing env var
  // silently blocked every scheduled scan indefinitely — the automated scan
  // never once ran, while the last manually-triggered scan kept rendering as
  // current. See lib/scan-freshness.ts for how staleness is now surfaced
  // explicitly instead of relying on a scan never failing.
  const scanConfig = resolveServerScanConfig();
  if (!scanConfig) {
    console.warn(
      "[cron/scan] no server-side AI key configured (checked GROQ_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY) — proceeding with a deterministic-only scan"
    );
  }

  if (!isScanStoreConfigured()) {
    // Without a store there is nowhere to put the result, so running the
    // expensive pipeline here would just burn AI-call budget for nothing.
    console.error("[cron/scan] scan store not configured (Redis env vars missing) — skipping");
    return NextResponse.json(
      { ok: false, reason: "Scan store not configured" },
      { status: 503 }
    );
  }

  const gotLock = await acquireLock();
  if (!gotLock) {
    return NextResponse.json({ ok: false, reason: "A scan is already running" }, { status: 409 });
  }

  const startedAt = new Date().toISOString();
  const id = randomUUID();

  try {
    // Freshness check: skip the expensive full scan if there's no new EOD bar
    // since the last successful scan (market holiday, or Vercel redelivering
    // the same cron invocation — both documented as real possibilities).
    // This does NOT try to detect "new news with unchanged prices" — see
    // DECISIONS.md for why a simple EOD-only check was chosen deliberately.
    const probedDate = await getLatestTradingDate();
    if (probedDate) {
      const latest = await getLatestScan();
      if (latest && latest.scanDate === probedDate) {
        await saveSkipped({ id, startedAt, scanDate: probedDate });
        return NextResponse.json({ ok: true, skipped: true, scanDate: probedDate });
      }
    }

    const results = await runFullScan(
      scanConfig,
      { minTechnicalScore: 45, minAvgVolume: 200_000, maxPicks: 8 }
    );
    cachedScan = { result: results, at: Date.now() };

    const scanDate = probedDate ?? pktDateStr(new Date(results.timestamp));
    await saveSuccess({ id, startedAt, scanDate, trigger: "cron", results });

    return NextResponse.json({
      ok: true, scannedAt: results.timestamp, scanDate,
      aiAvailable: !!scanConfig, aiError: results.aiError ?? null,
    });
  } catch (err) {
    console.error("[cron/scan] scheduled scan failed", err);
    const scanDate = pktDateStr();
    await saveFailure({ id, startedAt, scanDate, trigger: "cron", error: err });
    // Generic message only — never forward the raw error (which could
    // reference the server-side key) to whatever triggered this GET.
    return NextResponse.json({ ok: false, error: "Scheduled scan failed — see server logs" }, { status: 500 });
  } finally {
    await releaseLock();
  }
}
