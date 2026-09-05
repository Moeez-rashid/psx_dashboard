"use client";

/**
 * Branded loading screen shown while AppShell races a minimum display
 * duration against the initial /api/scan/latest fetch. Pure CSS — no fake
 * progress percentage, since there is nothing real to report progress on.
 * The mark is the same one used in the Dashboard header (components/Dashboard.tsx),
 * just larger, so this reads as part of the app rather than a separate splash brand.
 */
export default function SplashScreen({ exiting }: { exiting: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-surface transition-opacity duration-500 ${
        exiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-hidden={exiting}
    >
      <div className="relative flex items-center justify-center">
        <div
          className="absolute w-48 h-48 rounded-full blur-3xl opacity-30"
          style={{ background: "var(--color-up)" }}
        />
        <svg width="72" height="72" viewBox="0 0 24 24" aria-hidden className="relative rounded-2xl">
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

      <div className="mt-9 w-36 h-[3px] rounded-full bg-line-2/60 overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-up-2 animate-splash-bar" />
      </div>
    </div>
  );
}
