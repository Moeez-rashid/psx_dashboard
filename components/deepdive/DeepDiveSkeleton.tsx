import { Skeleton } from "@/components/ui/primitives";

/**
 * Streamed fallback for the slow part of Deep Dive (the full data
 * aggregation), used as a local <Suspense> boundary inside page.tsx rather
 * than a route-level loading.tsx — see the comment in page.tsx for why:
 * a route-level loading.tsx would wrap the ticker-existence check too,
 * which is exactly the thing that has to resolve BEFORE any response is
 * sent for a proper 404 to be possible.
 *
 * Mirrors the real page's rhythm — header, then stacked sections — so the
 * layout doesn't jump when the data lands.
 */
export default function DeepDiveSkeleton() {
  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <div className="pb-6 border-b border-line">
        <Skeleton className="h-3 w-28 mb-5" />
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <Skeleton className="h-7 w-32 mb-2.5" />
            <Skeleton className="h-3.5 w-56 mb-2" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="flex items-end gap-8">
            <div>
              <Skeleton className="h-7 w-32 mb-2.5" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-11 w-24" />
          </div>
        </div>
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} className="mt-8">
          <Skeleton className="h-3.5 w-40 mb-2" />
          <Skeleton className="h-2.5 w-72 mb-5" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => (
              <div key={j}>
                <Skeleton className="h-2.5 w-16 mb-2" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-[11px] text-ink-3 mt-10 text-center">
        Gathering price history, fundamentals, sector valuation and news…
      </p>
    </main>
  );
}
