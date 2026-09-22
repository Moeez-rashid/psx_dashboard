import { NextResponse } from "next/server";
import { getLatestScan, getScanAttempt } from "@/lib/scan-store";
import { computeScanFreshness } from "@/lib/scan-freshness";
import { pktDateStr } from "@/lib/format";

/**
 * GET /api/scan/latest — the most recently completed SUCCESSFUL scan, plus a
 * deterministic freshness classification, or { scan: null } if none exists
 * yet (first run, or the store isn't configured). Never triggers a scan,
 * never requires an AI key, and never touches a server secret — this is the
 * endpoint the frontend polls on load.
 *
 * `freshness` exists so the frontend never has to infer staleness from a
 * bare timestamp: it separates the scan's execution time from the PSX
 * trading date it reflects, and says explicitly whether today's scheduled
 * attempt (if any) failed — see lib/scan-freshness.ts.
 */
export async function GET() {
  try {
    const [scan, todayAttempt] = await Promise.all([
      getLatestScan(),
      getScanAttempt(pktDateStr()),
    ]);
    return NextResponse.json({ scan, freshness: computeScanFreshness(scan, todayAttempt) });
  } catch {
    // getLatestScan()/getScanAttempt() already swallow their own errors; this
    // is a final backstop so this route can never throw or leak internals.
    return NextResponse.json({ scan: null, freshness: computeScanFreshness(null, null) });
  }
}
