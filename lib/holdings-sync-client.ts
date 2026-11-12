"use client";
/**
 * Browser side of holdings sync (server side: lib/holdings-sync.ts).
 *
 * Off by default — holdings stay in this browser until the user turns sync
 * on. Then every edit is pushed under a random key, and any device holding
 * the same key (another browser, the iPhone widget) reads the same list.
 * Conflicts are last-edit-wins on `updatedAt`.
 */

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import type { Holding } from "@/components/HoldingsOverview";

export const SYNC_KEY_STORAGE = "psx_sync_key";
const UPDATED_STORAGE = "psx_holdings_updated";
const HOLDINGS_STORAGE = "psx_holdings";
export const SYNC_EVENT = "psx:sync-changed";
/** Fired with the remote list when another device's newer edit is pulled in. */
export const SYNC_APPLY_EVENT = "psx:sync-apply";

export interface RemoteHoldings { holdings: Holding[]; updatedAt: string }

function ls(): Storage | null { try { return window.localStorage; } catch { return null; } }

export function getSyncKey(): string | null {
  const k = ls()?.getItem(SYNC_KEY_STORAGE) ?? null;
  return k && /^[A-Za-z0-9_-]{32,64}$/.test(k) ? k : null;
}

function setSyncKeyRaw(k: string | null) {
  const s = ls();
  if (!s) return;
  if (k) s.setItem(SYNC_KEY_STORAGE, k); else s.removeItem(SYNC_KEY_STORAGE);
  window.dispatchEvent(new Event(SYNC_EVENT));
}

/** 24 random bytes → 32 URL-safe characters (192 bits; not guessable). */
export function generateSyncKey(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getLocalUpdatedAt(): string | null { return ls()?.getItem(UPDATED_STORAGE) ?? null; }
function setLocalUpdatedAt(iso: string) { ls()?.setItem(UPDATED_STORAGE, iso); }

export function readLocalHoldings(): Holding[] {
  try { const h = JSON.parse(ls()?.getItem(HOLDINGS_STORAGE) ?? "null"); return Array.isArray(h) ? h : []; } catch { return []; }
}

async function call(method: "GET" | "PUT" | "DELETE", key: string, body?: unknown): Promise<Response> {
  return fetch("/api/sync/holdings", {
    method,
    headers: { "x-sync-key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

export async function pullHoldings(key: string): Promise<RemoteHoldings | null> {
  const res = await call("GET", key);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Sync failed (${res.status})`);
  return res.json();
}

export async function pushHoldings(key: string, holdings: Holding[], updatedAt: string): Promise<void> {
  const res = await call("PUT", key, { holdings, updatedAt });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Sync failed (${res.status})`);
}

// ─── Turning sync on / off ──────────────────────────────────────────────────

/** Start syncing this browser's holdings under a brand-new key. */
export async function enableSync(): Promise<string> {
  const key = generateSyncKey();
  const updatedAt = getLocalUpdatedAt() ?? new Date().toISOString();
  await pushHoldings(key, readLocalHoldings(), updatedAt);
  setLocalUpdatedAt(updatedAt);
  setSyncKeyRaw(key);
  return key;
}

/** Use a key created on another device. Its holdings replace this browser's. */
export async function joinSync(key: string): Promise<RemoteHoldings> {
  const k = key.trim();
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(k)) throw new Error("That doesn't look like a sync key — it's 32 letters, digits, - or _.");
  const remote = await pullHoldings(k);
  if (!remote) throw new Error("No holdings are stored for that key. Check it, or turn sync on from the device that has your holdings.");
  setSyncKeyRaw(k);
  applyRemote(remote);
  return remote;
}

/** Swap to a new key: the old one stops working immediately. */
export async function rotateSyncKey(): Promise<string> {
  const old = getSyncKey();
  const key = await enableSync();
  if (old) await call("DELETE", old).catch(() => {});
  return key;
}

/** Stop syncing and delete the copy on the server. Holdings stay in this browser. */
export async function disableSync(): Promise<void> {
  const key = getSyncKey();
  if (key) await call("DELETE", key).catch(() => {});
  setSyncKeyRaw(null);
}

function applyRemote(remote: RemoteHoldings) {
  ls()?.setItem(HOLDINGS_STORAGE, JSON.stringify(remote.holdings));
  setLocalUpdatedAt(remote.updatedAt);
  window.dispatchEvent(new CustomEvent<Holding[]>(SYNC_APPLY_EVENT, { detail: remote.holdings }));
}

// ─── React bindings ─────────────────────────────────────────────────────────

const subscribe = (cb: () => void) => {
  window.addEventListener(SYNC_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(SYNC_EVENT, cb); window.removeEventListener("storage", cb); };
};

export function useSyncKey(): string | null {
  return useSyncExternalStore(subscribe, getSyncKey, () => null);
}

/**
 * Keeps the Dashboard's holdings and the synced copy in step:
 *  - pulls on load, when the tab becomes visible and every 2 minutes, and
 *    adopts the remote list when it was edited more recently;
 *  - pushes (debounced) whenever the user edits holdings here.
 * `loadedRef` must turn true once Dashboard has restored holdings from
 * localStorage, so that restore isn't mistaken for an edit.
 */
export function useHoldingsSync(holdings: Holding[], loadedRef: RefObject<boolean>) {
  const key = useSyncKey();
  // Last list known to match the server (or the restored baseline): a change
  // away from it is a local edit worth pushing.
  const baseline = useRef<string | null>(null);
  const initial = useRef(holdings);

  useEffect(() => {
    // First run is at mount, before Dashboard writes anything back to
    // localStorage — so what's stored there now is the restored baseline.
    if (baseline.current === null) baseline.current = JSON.stringify(readLocalHoldings());
    // While `holdings` is still Dashboard's initial (pre-restore) array it says
    // nothing about what the user has — whatever order the restore effect runs
    // in, and however often React re-runs effects in development.
    if (holdings === initial.current || !loadedRef.current) return;
    const json = JSON.stringify(holdings);
    if (json === baseline.current) return;
    baseline.current = json;
    const updatedAt = new Date().toISOString();
    setLocalUpdatedAt(updatedAt);
    if (!key) return;
    const t = setTimeout(() => { pushHoldings(key, holdings, updatedAt).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [holdings, key, loadedRef]);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const pull = () => {
      if (document.visibilityState !== "visible") return;
      pullHoldings(key).then((remote) => {
        if (!alive) return;
        if (!remote) { // key exists here but the server copy is gone — re-seed it
          pushHoldings(key, readLocalHoldings(), getLocalUpdatedAt() ?? new Date().toISOString()).catch(() => {});
          return;
        }
        const local = Date.parse(getLocalUpdatedAt() ?? "") || 0;
        if (Date.parse(remote.updatedAt) > local) {
          baseline.current = JSON.stringify(remote.holdings);
          applyRemote(remote);
        }
      }).catch(() => {});
    };
    const first = setTimeout(pull, 300);
    const id = setInterval(pull, 120_000);
    document.addEventListener("visibilitychange", pull);
    return () => { alive = false; clearTimeout(first); clearInterval(id); document.removeEventListener("visibilitychange", pull); };
  }, [key]);
}
