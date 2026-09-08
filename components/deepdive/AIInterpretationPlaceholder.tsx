import { Sparkles } from "lucide-react";
import { Section } from "./shared";

/**
 * Reserved slot for the Phase 4 AI pass. Sits last on purpose: the evidence
 * above is the page, and the model's reading of it is a commentary on that
 * evidence rather than the headline.
 *
 * Nothing here calls a model, and nothing here will ever carry a confidence
 * percentage — the AI's job is to interpret the deterministic numbers above,
 * not to score them.
 */
export default function AIInterpretationPlaceholder() {
  return (
    <Section
      icon={Sparkles}
      title="AI interpretation"
      kicker="A reading of the evidence above — the numbers stay the source of truth."
    >
      <div className="border border-dashed border-line-2 rounded-xl px-4 py-6 text-center bg-inset/40">
        <p className="text-[12px] text-ink-2">Not yet available.</p>
        <p className="text-[11px] text-ink-3 mt-2 leading-relaxed max-w-lg mx-auto">
          This section will summarise where the technical, valuation, fundamental and sector evidence agree or conflict, with bull, base and bear framings and what would invalidate each. It reads the figures above rather than producing its own, and reports plainly when data it would want is unavailable.
        </p>
      </div>
    </Section>
  );
}
