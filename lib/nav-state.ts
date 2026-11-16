"use client";
import { useSyncExternalStore } from "react";
import type { DashboardTab } from "./nav";

/**
 * Which dashboard tab is showing, for the phone tab bar. The dashboard keeps
 * its tab in React state and the URL is updated with replaceState, so the
 * bar can't read it from the router — the dashboard publishes it here.
 * null whenever the dashboard isn't mounted.
 */
let current: DashboardTab | null = null;
const listeners = new Set<() => void>();

export function publishDashboardTab(tab: DashboardTab | null): void {
  if (current === tab) return;
  current = tab;
  listeners.forEach((l) => l());
}

export function useDashboardTab(): DashboardTab | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
    () => null
  );
}
