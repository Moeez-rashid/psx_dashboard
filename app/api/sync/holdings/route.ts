import { NextResponse } from "next/server";
import {
  deleteHoldings, loadHoldings, sanitizeHoldings, saveHoldings, syncKeyFrom, SyncUnavailableError,
} from "@/lib/holdings-sync";

/**
 * Holdings sync — GET reads, PUT replaces, DELETE forgets the list stored
 * under the `x-sync-key` header. See lib/holdings-sync.ts.
 */

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

function fail(err: unknown) {
  if (err instanceof SyncUnavailableError) return json({ error: err.message }, 503);
  console.error("[/api/sync/holdings]", err);
  return json({ error: "Sync failed" }, 500);
}

export async function GET(req: Request) {
  const key = syncKeyFrom(req);
  if (!key) return json({ error: "Missing or malformed sync key" }, 400);
  try {
    const data = await loadHoldings(key);
    return data ? json(data) : json({ error: "No holdings stored for this key" }, 404);
  } catch (err) { return fail(err); }
}

export async function PUT(req: Request) {
  const key = syncKeyFrom(req);
  if (!key) return json({ error: "Missing or malformed sync key" }, 400);
  let body: { holdings?: unknown; updatedAt?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Body must be JSON" }, 400); }
  let holdings;
  try { holdings = sanitizeHoldings(body.holdings); } catch (e) { return json({ error: (e as Error).message }, 400); }
  // The client's edit time decides which device's list is newer; never accept one from the future.
  const t = typeof body.updatedAt === "string" ? Date.parse(body.updatedAt) : NaN;
  const updatedAt = new Date(Number.isFinite(t) ? Math.min(t, Date.now()) : Date.now()).toISOString();
  try {
    await saveHoldings(key, { holdings, updatedAt });
    return json({ ok: true, count: holdings.length, updatedAt });
  } catch (err) { return fail(err); }
}

export async function DELETE(req: Request) {
  const key = syncKeyFrom(req);
  if (!key) return json({ error: "Missing or malformed sync key" }, 400);
  try {
    await deleteHoldings(key);
    return json({ ok: true });
  } catch (err) { return fail(err); }
}
