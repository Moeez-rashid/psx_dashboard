import { NextResponse } from "next/server";
import { getSourceHealth } from "@/lib/cache";
import { getSnapshot } from "@/lib/psx-snapshot";
import { getLatestSessionDate } from "@/lib/psx-eod";
import { getIndices } from "@/lib/psx-market";
import { isScanStoreConfigured } from "@/lib/scan-store";

export const dynamic = "force-dynamic";

/** GET /api/health
 *  Actively probes the core PSX sources, then reports the health ledger for
 *  every upstream this instance has talked to. Exists because a dead feed
 *  once looked like a quiet market for six weeks.
 */
export async function GET() {
  const [snap, eod, idx] = await Promise.allSettled([getSnapshot(), getLatestSessionDate(), getIndices()]);
  const core = {
    quotes: snap.status === "fulfilled" && !snap.value.stale,
    history: eod.status === "fulfilled",
    indices: idx.status === "fulfilled" && !idx.value.stale,
  };
  const ok = core.quotes && core.history;
  return NextResponse.json({
    ok,
    core,
    latestSession: eod.status === "fulfilled" ? eod.value : null,
    symbols: snap.status === "fulfilled" ? snap.value.value.length : 0,
    scanStore: isScanStoreConfigured(),
    sources: getSourceHealth(),
    checkedAt: new Date().toISOString(),
  }, { status: ok ? 200 : 503 });
}
