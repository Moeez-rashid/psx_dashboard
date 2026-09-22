"use client";
import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import SplashScreen from "./SplashScreen";
import type { PersistedScan } from "@/lib/scan-store";
import type { ScanFreshness } from "@/lib/scan-freshness";

const MIN_SPLASH_MS = 2400;   // "approximately 2-3 seconds"
const TRANSITION_MS = 500;    // must match SplashScreen's transition-opacity duration

/**
 * Owns the startup sequence: race a minimum splash duration against
 * GET /api/scan/latest (started in parallel, not after the timer), then
 * mount Dashboard already hydrated with whatever was found — never trigger
 * a scan from here. Dashboard itself is unaware any of this happened; it
 * just receives an initialScan/initialFreshness prop like any other piece
 * of initial data.
 */
export default function AppShell() {
  const [ready, setReady] = useState(false);
  const [scan, setScan] = useState<PersistedScan | null>(null);
  const [freshness, setFreshness] = useState<ScanFreshness | null>(null);
  const [exiting, setExiting] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, MIN_SPLASH_MS));
    const fetchLatest = fetch("/api/scan/latest")
      .then((r) => (r.ok ? r.json() : { scan: null, freshness: null }))
      .catch(() => ({ scan: null as PersistedScan | null, freshness: null as ScanFreshness | null }));

    Promise.all([minDelay, fetchLatest]).then(([, data]) => {
      if (cancelled) return;
      const d = data as { scan: PersistedScan | null; freshness: ScanFreshness | null };
      setScan(d.scan ?? null);
      setFreshness(d.freshness ?? null);
      setReady(true);
      setExiting(true);
      setTimeout(() => {
        if (!cancelled) setSplashMounted(false);
      }, TRANSITION_MS);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {ready && (
        <div className={`transition-opacity duration-500 ${exiting ? "opacity-100" : "opacity-0"}`}>
          <Dashboard initialScan={scan} initialFreshness={freshness} />
        </div>
      )}
      {splashMounted && <SplashScreen exiting={exiting} />}
    </>
  );
}
