"use client";

/**
 * Branded loading screen shown while AppShell races a minimum display
 * duration against the initial /api/scan/latest fetch. No progress
 * indicator of any kind — there's nothing real to report progress on, so
 * the mark itself just breathes gently rather than implying a countable
 * step. The mark is the same one used in the Dashboard header
 * (components/Dashboard.tsx), just much larger, so this reads as part of
 * the app rather than a separate splash brand.
 */
export default function SplashScreen({ exiting }: { exiting: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-surface transition-opacity duration-500 ${
        exiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-hidden={exiting}
    >
      <div className="flex flex-col items-center gap-5 animate-splash-breathe">
        <div className="relative flex items-center justify-center">
          <div
            className="absolute w-64 h-64 rounded-full blur-3xl opacity-30"
            style={{ background: "var(--color-up)" }}
          />
          <svg width="128" height="128" viewBox="0 0 24 24" aria-hidden className="relative rounded-[28px]">
            <rect width="24" height="24" rx="6" fill="var(--color-up-dim)" />
            <polyline
              points="4,16 9,11 13,14 20,7"
              fill="none"
              stroke="var(--color-up-2)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="15,7 20,7 20,12"
              fill="none"
              stroke="var(--color-up-2)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="relative text-lg font-bold tracking-tight text-ink">PSX Scanner</span>
      </div>
    </div>
  );
}
