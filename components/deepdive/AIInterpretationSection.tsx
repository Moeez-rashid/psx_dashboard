"use client";
import { useState } from "react";
import {
  Sparkles, RefreshCw, Loader2, GitMerge, Split, Zap, ShieldAlert,
  TrendingUp, Minus, TrendingDown, ListChecks, CircleAlert, Info,
} from "lucide-react";
import { Section } from "./shared";
import { timeAgo } from "@/lib/format";
import type { DeepDiveAnalysis, DeepDiveAIResult, DeepDiveAIStatus } from "@/lib/deepdive-ai";

/**
 * The Phase 4 AI layer's UI. Cache-only by default — `initialResult` comes
 * from a server-side, cache-only lookup (no model call) done alongside the
 * deterministic page render, so a plain page view never generates anything.
 * Generation only happens from here, in response to an explicit click,
 * against the same /api/deepdive route the rest of Deep Dive already uses.
 *
 * Never fabricates a score or confidence number — this renders exactly the
 * DeepDiveAnalysis prose fields and nothing else.
 */
export default function AIInterpretationSection({
  ticker, initialResult,
}: {
  ticker: string;
  initialResult: DeepDiveAIResult;
}) {
  const [result, setResult] = useState(initialResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "generate" | "refresh") {
    setLoading(true);
    setError(null);
    try {
      const qs = mode === "refresh" ? "refresh=1" : "ai=1";
      const res = await fetch(`/api/deepdive?symbol=${encodeURIComponent(ticker)}&${qs}`);
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to reach the analysis service.");
      } else if (data?.ai) {
        setResult(data.ai as DeepDiveAIResult);
      }
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  }

  const hasAnalysis = result.status === "ok" && !!result.analysis;

  const aside = hasAnalysis ? (
    <button onClick={() => run("refresh")} disabled={loading} className="btn text-[10px] px-2.5 py-1">
      {loading
        ? <Loader2 size={11} strokeWidth={2.5} className="animate-spin" aria-hidden />
        : <RefreshCw size={11} strokeWidth={2.5} aria-hidden />}
      Re-analyze
    </button>
  ) : undefined;

  return (
    <Section
      icon={Sparkles}
      title="AI interpretation"
      kicker="A reading of the evidence above — the numbers stay the source of truth."
      aside={aside}
    >
      {hasAnalysis && result.analysis ? (
        <div className={loading ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
          <AnalysisBody analysis={result.analysis} />
        </div>
      ) : loading ? (
        <LoadingState />
      ) : (
        <RequestState status={result.status} detail={result.detail} onRun={() => run("generate")} />
      )}

      {loading && hasAnalysis && (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-3 mt-3">
          <Loader2 size={12} strokeWidth={2.5} className="animate-spin" aria-hidden />
          Re-analyzing the available evidence…
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-down-dim border border-down/40 rounded-lg px-3 py-2.5 mt-3">
          <CircleAlert size={13} strokeWidth={2} className="text-down-2 shrink-0 mt-0.5" aria-hidden />
          <p className="text-[11px] text-ink-2 leading-relaxed">{error}</p>
        </div>
      )}
    </Section>
  );
}

function LoadingState() {
  return (
    <div className="border border-dashed border-line-2 rounded-xl px-4 py-8 text-center bg-inset/40">
      <Loader2 size={18} strokeWidth={2} className="text-ink-3 animate-spin mx-auto mb-3" aria-hidden />
      <p className="text-[12px] text-ink-2">Analyzing the available evidence…</p>
      <p className="text-[11px] text-ink-3 mt-1.5">One pass over the technical, valuation, fundamental and market evidence above.</p>
    </div>
  );
}

const STATUS_COPY: Record<DeepDiveAIStatus, { title: string; retry: "generate" | "retry" | "check" | null }> = {
  "ok": { title: "", retry: null }, // handled separately (hasAnalysis)
  "not-generated": { title: "AI interpretation is available on request.", retry: "generate" },
  "no-provider": { title: "AI interpretation isn't configured for this deployment.", retry: null },
  "insufficient-evidence": { title: "Too little evidence to interpret honestly yet.", retry: null },
  "provider-failed": { title: "The analysis service didn't respond.", retry: "retry" },
  "invalid-output": { title: "The model's answer didn't pass validation, so nothing is shown.", retry: "retry" },
  "generation-in-progress": { title: "Another request is already generating this interpretation.", retry: "check" },
};

function RequestState({
  status, detail, onRun,
}: {
  status: DeepDiveAIStatus;
  detail: string | null;
  onRun: () => void;
}) {
  const copy = STATUS_COPY[status];
  const buttonLabel = { generate: "Analyze with AI", retry: "Try again", check: "Check again" }[copy.retry ?? "generate"];
  return (
    <div className="border border-dashed border-line-2 rounded-xl px-4 py-6 text-center bg-inset/40">
      <p className="text-[12px] text-ink-2">{copy.title}</p>
      {detail && <p className="text-[11px] text-ink-3 mt-2 leading-relaxed max-w-lg mx-auto">{detail}</p>}
      {copy.retry && (
        <button onClick={onRun} className="btn-accent mt-4 px-4 py-2 font-semibold text-[11px]">
          <Sparkles size={13} strokeWidth={2.25} aria-hidden />
          {buttonLabel}
        </button>
      )}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-[11px] text-ink-3 italic">None identified from the current evidence.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="text-[12px] text-ink-2 leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-ink-3">
          {it}
        </li>
      ))}
    </ul>
  );
}

function SubHeading({ children }: { children: string }) {
  return <h3 className="label mb-2">{children}</h3>;
}

function AnalysisBody({ analysis }: { analysis: DeepDiveAnalysis }) {
  const a = analysis;
  const interpretations: Array<[string, string]> = [
    ["Technical", a.technicalInterpretation],
    ["Valuation", a.valuationInterpretation],
    ["Fundamentals", a.fundamentalInterpretation],
    ["Market & sector", a.marketInterpretation],
    ["Risk", a.riskInterpretation],
  ].filter(([, text]) => !!text) as Array<[string, string]>;

  return (
    <div>
      {/* Thesis — the one thing meant to be read even at a glance. */}
      {a.summary && (
        <p className="text-[13px] text-ink leading-relaxed font-medium mb-6">{a.summary}</p>
      )}

      {/* Reading the evidence — the per-category interpretations the schema requires,
          kept terse so they read as analysis rather than restating numbers already shown above. */}
      {interpretations.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mb-6">
          {interpretations.map(([label, text]) => (
            <div key={label}>
              <SubHeading>{label}</SubHeading>
              <p className="text-[12px] text-ink-2 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Confluence / divergence — the heart of the interpretation: where the
          independent categories above agree or contradict each other. */}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5 mb-6 border-t border-line pt-5">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <GitMerge size={13} strokeWidth={2} className="text-up-2" aria-hidden />
            <h3 className="label">Confluence</h3>
          </div>
          <Bullets items={a.confluence ?? []} />
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Split size={13} strokeWidth={2} className="text-sky-2" aria-hidden />
            <h3 className="label">Divergence</h3>
          </div>
          <Bullets items={a.divergence ?? []} />
        </div>
      </div>

      {/* Catalysts / risks */}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5 mb-6 border-t border-line pt-5">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={13} strokeWidth={2} className="text-gold-2" aria-hidden />
            <h3 className="label">Catalysts</h3>
          </div>
          <Bullets items={a.catalysts ?? []} />
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldAlert size={13} strokeWidth={2} className="text-down-2" aria-hidden />
            <h3 className="label">Risks</h3>
          </div>
          <Bullets items={a.risks ?? []} />
        </div>
      </div>

      {/* Scenarios — explicitly framed as scenarios, never predictions. */}
      <div className="border-t border-line pt-5 mb-6">
        <h3 className="label mb-3">Scenarios — not predictions, ways the evidence could resolve</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <ScenarioCard icon={TrendingUp} tone="text-up-2" border="border-up/30" label="Bull scenario" text={a.scenarios?.bull} />
          <ScenarioCard icon={Minus} tone="text-ink-2" border="border-line-2" label="Base scenario" text={a.scenarios?.base} />
          <ScenarioCard icon={TrendingDown} tone="text-down-2" border="border-down/30" label="Bear scenario" text={a.scenarios?.bear} />
        </div>
      </div>

      {/* What to watch */}
      <div className="border-t border-line pt-5 mb-2">
        <div className="flex items-center gap-1.5 mb-2">
          <ListChecks size={13} strokeWidth={2} className="text-ink-3" aria-hidden />
          <h3 className="label">What to watch</h3>
        </div>
        <Bullets items={a.whatToWatch ?? []} />
      </div>

      {/* The AI's own stated limitations for this reading — separate from the
          page's structural "what this page cannot tell you" disclosure below. */}
      {a.limitations && a.limitations.length > 0 && (
        <details className="mt-5 pt-4 border-t border-line group">
          <summary className="flex items-center gap-1.5 cursor-pointer text-[10px] text-ink-3 hover:text-ink-2 transition-colors list-none">
            <Info size={11} strokeWidth={2} aria-hidden />
            Limitations of this reading ({a.limitations.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {a.limitations.map((l, i) => (
              <li key={i} className="text-[10px] text-ink-3 leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0">
                {l}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Provenance — quiet, always present so a reading is never unattributed. */}
      {a.meta && (
        <p className="text-[10px] text-ink-3 mt-4 pt-3 border-t border-line">
          Generated {timeAgo(a.meta.generatedAt)} via {a.meta.provider}
          {a.meta.groundingWarnings?.length > 0 && ` · ${a.meta.groundingWarnings.length} item(s) flagged for review during grounding checks`}
        </p>
      )}
    </div>
  );
}

function ScenarioCard({
  icon: Icon, tone, border, label, text,
}: {
  icon: typeof TrendingUp;
  tone: string;
  border: string;
  label: string;
  text?: string;
}) {
  return (
    <div className={`border ${border} rounded-lg px-3.5 py-3 bg-inset/40`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} strokeWidth={2.25} className={tone} aria-hidden />
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{label}</span>
      </div>
      <p className="text-[11px] text-ink-2 leading-relaxed">{text || "—"}</p>
    </div>
  );
}
