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

/**
 * The tab a nav link asked for, read once when the dashboard mounts.
 * Needed because Next reuses the dashboard's first URL for "/": open the
 * site on /?tab=holdings (the widget does), go to Markets, tap Signals, and
 * the router lands on /?tab=holdings again. The tapped tab wins over that.
 */
let requested: DashboardTab | null = null;
export function requestDashboardTab(tab: DashboardTab): void { requested = tab; }
export function takeRequestedTab(): DashboardTab | null { const t = requested; requested = null; return t; }

/** Same idea for "Settings" in the More sheet: its ?settings=1 can be lost the same way. */
let settingsRequested = false;
export function requestSettings(): void { settingsRequested = true; }
export function takeSettingsRequest(): boolean { const s = settingsRequested; settingsRequested = false; return s; }
