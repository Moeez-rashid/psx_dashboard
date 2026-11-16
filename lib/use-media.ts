"use client";
import { useSyncExternalStore } from "react";

const PHONE = "(max-width: 639.98px)"; // below Tailwind's sm

/** True on phone-width screens. False during server render and hydration's first pass. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(PHONE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(PHONE).matches,
    () => false
  );
}
