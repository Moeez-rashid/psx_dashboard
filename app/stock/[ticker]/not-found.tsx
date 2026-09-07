import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

/**
 * Reached for a malformed ticker, or one where neither PSX price history nor
 * askanalyst fundamentals exist — i.e. nothing this app could research.
 */
export default function DeepDiveNotFound() {
  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[11px] text-ink-3 hover:text-ink transition-colors mb-8">
        <ArrowLeft size={13} strokeWidth={2} aria-hidden />
        Back to scanner
      </Link>

      <div className="card text-center py-12 px-5">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-inset mb-4">
          <SearchX size={20} strokeWidth={1.75} className="text-ink-3" aria-hidden />
        </div>
        <h1 className="text-sm font-semibold text-ink mb-1.5">No data for this ticker</h1>
        <p className="text-xs text-ink-3 leading-relaxed max-w-md mx-auto">
          Neither PSX price history nor company fundamentals could be found. Check the symbol — Deep Dive expects a PSX ticker such as OGDC or LUCK.
        </p>
        <Link href="/" className="btn-accent mt-6 px-5 py-2 font-semibold inline-flex">
          Back to scanner
        </Link>
      </div>
    </main>
  );
}
