import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { runFullScan, runNewsRefresh } from "@/lib/scanner";
import type { ProviderConfig } from "@/lib/providers";
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

// In-memory cache for the last scan result (survives across requests in same process).
// This is a short-lived request-coalescing cache, NOT the persistence layer —
// see lib/scan-store.ts for that.
let cachedScan: { result: Awaited<ReturnType<typeof runFullScan>>; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
      const scanDate = (await getLatestTradingDate()) ?? result.timestamp.slice(0, 10);
      await saveSuccess({ id, startedAt, scanDate, trigger: "manual", results: result });

      return NextResponse.json(result);
    } catch (err) {
      const scanDate = new Date().toISOString().slice(0, 10);
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
  const apiKey = process.env.SCAN_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fail safely: the previous successful scan (if any) is untouched, so the
    // site does not go empty just because this env var was never set.
    console.error("[cron/scan] no server-side AI key configured (ANTHROPIC_API_KEY) — skipping");
    return NextResponse.json(
      { ok: false, reason: "No server-side AI key configured" },
      { status: 503 }
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
      { provider: "claude", apiKey, model: "claude-sonnet-4-5" },
      { minTechnicalScore: 45, minAvgVolume: 200_000, maxPicks: 8 }
    );
    cachedScan = { result: results, at: Date.now() };

    const scanDate = probedDate ?? results.timestamp.slice(0, 10);
    await saveSuccess({ id, startedAt, scanDate, trigger: "cron", results });

    return NextResponse.json({ ok: true, scannedAt: results.timestamp, scanDate });
  } catch (err) {
    console.error("[cron/scan] scheduled scan failed", err);
    const scanDate = new Date().toISOString().slice(0, 10);
    await saveFailure({ id, startedAt, scanDate, trigger: "cron", error: err });
    // Generic message only — never forward the raw error (which could
    // reference the server-side key) to whatever triggered this GET.
    return NextResponse.json({ ok: false, error: "Scheduled scan failed — see server logs" }, { status: 500 });
  } finally {
    await releaseLock();
  }
}
