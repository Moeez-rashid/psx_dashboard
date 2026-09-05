import { NextResponse } from "next/server";
import { getLatestScan } from "@/lib/scan-store";

/**
 * GET /api/scan/latest — the most recently completed SUCCESSFUL scan, or
 * { scan: null } if none exists yet (first run, or the store isn't
 * configured). Never triggers a scan, never requires an AI key, and never
 * touches a server secret — this is the endpoint the frontend polls on load.
 */
export async function GET() {
  try {
    const scan = await getLatestScan();
    return NextResponse.json({ scan });
  } catch {
    // getLatestScan() already swallows its own errors; this is a final
    // backstop so this route can never throw or leak internals to the client.
    return NextResponse.json({ scan: null });
  }
}
