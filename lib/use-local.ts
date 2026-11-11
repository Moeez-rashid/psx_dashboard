"use client";
import { useMemo, useSyncExternalStore } from "react";
import {
  ALERTS_EVENT, ALERTS_KEY, DEFAULT_COST_PREFS, PREFS_EVENT, PREFS_KEY, WATCH_EVENT, WATCH_KEY,
  readAlerts, readCostPrefs, readWatchlist, type CostPrefs, type PriceAlert, type WatchItem,
} from "./local-store";

/**
 * React bindings for the localStorage-backed stores. Subscribing through
 * useSyncExternalStore means a change made anywhere — another component, the
 * command palette, another tab — re-renders every reader, with no effect
 * that copies storage into state.
 */
// Each hook memoises on the raw stored string: it is the cache key, and the
// reader re-parses (and validates) storage whenever it changes.
function useRaw(key: string, event: string): string {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(event, onChange);
      window.addEventListener("storage", onChange);
      return () => { window.removeEventListener(event, onChange); window.removeEventListener("storage", onChange); };
    },
    () => { try { return localStorage.getItem(key) ?? ""; } catch { return ""; } },
    () => "" // server render: nothing stored
  );
}

export function useWatchlist(): WatchItem[] {
  const raw = useRaw(WATCH_KEY, WATCH_EVENT);
  return useMemo(() => (raw ? readWatchlist() : []), [raw]);
}

export function useWatchSet(): Set<string> {
  const list = useWatchlist();
  return useMemo(() => new Set(list.map((w) => w.ticker)), [list]);
}

export function useAlerts(): PriceAlert[] {
  const raw = useRaw(ALERTS_KEY, ALERTS_EVENT);
  return useMemo(() => (raw ? readAlerts() : []), [raw]);
}

export function useCostPrefs(): CostPrefs {
  const raw = useRaw(PREFS_KEY, PREFS_EVENT);
  return useMemo(() => (raw ? readCostPrefs() : DEFAULT_COST_PREFS), [raw]);
}
