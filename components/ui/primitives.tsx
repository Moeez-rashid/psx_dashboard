"use client";
import { useEffect, type ReactNode } from "react";

// ─── Signal styling map ─────────────────────────────────────────────────────
export const SIGNAL_STYLE: Record<string, { pill: string; bar: string; text: string }> = {
  STRONG_BUY: { pill: "bg-up-dim text-up-2 border-up/60",       bar: "bg-up",     text: "text-up-2" },
  BUY:        { pill: "bg-up-dim text-up-2 border-up/60",       bar: "bg-up",     text: "text-up-2" },
  WATCH:      { pill: "bg-sky-dim text-sky-2 border-sky/60",    bar: "bg-sky",    text: "text-sky-2" },
  NEUTRAL:    { pill: "bg-sky-dim text-sky-2 border-sky/60",    bar: "bg-sky",    text: "text-sky-2" },
  HOLD:       { pill: "bg-gold-dim text-gold-2 border-gold/60", bar: "bg-gold",   text: "text-gold-2" },
  SELL:       { pill: "bg-down-dim text-down-2 border-down/60", bar: "bg-down",   text: "text-down-2" },
  AVOID:      { pill: "bg-down-dim text-down-2 border-down/60", bar: "bg-down",   text: "text-down-2" },
};
export function signalStyle(signal?: string) {
  return SIGNAL_STYLE[signal?.toUpperCase() ?? ""] ?? SIGNAL_STYLE.WATCH;
}

// ─── Pill ───────────────────────────────────────────────────────────────────
export function Pill({ signal, small, onClick }: { signal?: string; small?: boolean; onClick?: () => void }) {
  const s = signalStyle(signal);
  return (
    <span
      onClick={onClick}
      className={[
        "inline-flex items-center border rounded-full font-semibold tracking-wide whitespace-nowrap",
        s.pill,
        small ? "text-[9px] px-2 py-px" : "text-[10px] px-2.5 py-0.5",
        onClick ? "cursor-pointer hover:brightness-125 transition" : "",
      ].join(" ")}
    >
      {(signal ?? "—").toUpperCase().replace("_", " ")}
    </span>
  );
}

// ─── Confidence bar ─────────────────────────────────────────────────────────
export function ConfBar({ pct, signal, label }: { pct: number; signal?: string; label?: string }) {
  const s = signalStyle(signal);
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[10px] text-ink-3 whitespace-nowrap">{label ?? "AI confidence"}</span>
      <div className="flex-1 h-1 bg-line-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${s.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="text-[10px] text-ink-2 num min-w-7 text-right">{pct}%</span>
    </div>
  );
}

// ─── Stat chip (label + value) ──────────────────────────────────────────────
export function Chip({ label, value, tone = "text-ink-2" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="chip">
      <span className="text-[9px] uppercase tracking-wide text-ink-3">{label}</span>
      <span className={`text-[11px] font-medium num ${tone}`}>{value}</span>
    </div>
  );
}

// ─── Price + change inline ──────────────────────────────────────────────────
export function PriceTag({ price, changePercent, big }: { price?: number; changePercent?: number; big?: boolean }) {
  if (price === undefined) return null;
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={`font-semibold num ${big ? "text-[15px]" : "text-[13px]"}`}>
        <span className="text-ink-3 font-normal text-[0.8em] mr-0.5">PKR</span>
        {price.toFixed(2)}
      </span>
      {changePercent !== undefined && (
        <span className={`text-[11px] num ${changePercent >= 0 ? "text-up-2" : "text-down-2"}`}>
          {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
        </span>
      )}
    </span>
  );
}

// ─── Sparkline ──────────────────────────────────────────────────────────────
export function Sparkline({ data, width = 84, height = 30, color, opacity = 0.9 }: { data?: number[]; width?: number; height?: number; color?: string; opacity?: number }) {
  if (!data || data.length < 5) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = data[data.length - 1] >= data[0];
  const stroke = color ?? (up ? "var(--color-up-2)" : "var(--color-down-2)");
  const fillPts = [`${pad},${height - pad}`, ...pts, `${width - pad},${height - pad}`].join(" ");
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <polygon points={fillPts} fill={stroke} opacity={0.08} />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" opacity={opacity} />
    </svg>
  );
}

// ─── Modal wrapper (centered on desktop, bottom sheet on mobile) ────────────
export function Modal({ onClose, children, maxWidth = "max-w-lg" }: { onClose: () => void; children: ReactNode; maxWidth?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-100 bg-black/75 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-5 animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`bg-card border border-line-2 w-full ${maxWidth} max-h-[88vh] overflow-y-auto p-5
                    rounded-t-2xl sm:rounded-2xl animate-slide-up shadow-2xl shadow-black/60`}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Modal header row ───────────────────────────────────────────────────────
export function ModalHeader({ title, sub, onClose }: { title: ReactNode; sub?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        {sub && <div className="text-[11px] text-ink-2 mt-0.5">{sub}</div>}
      </div>
      <button onClick={onClose} className="text-ink-2 hover:text-ink text-xl leading-none px-1 cursor-pointer" aria-label="Close">×</button>
    </div>
  );
}

// ─── Dismissible error banner ───────────────────────────────────────────────
export function ErrorBanner({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2.5 bg-down-dim border border-down/50 rounded-lg px-3 py-2.5 mb-3 animate-fade-in">
      <span className="text-[12px] text-down-2 flex-1 leading-relaxed">{msg}</span>
      <button onClick={onDismiss} className="text-ink-2 hover:text-ink leading-none cursor-pointer" aria-label="Dismiss">×</button>
    </div>
  );
}

// ─── Two-step delete confirm ────────────────────────────────────────────────
export function ConfirmDelete({ pending, onArm, onConfirm, onCancel }: {
  pending: boolean; onArm: () => void; onConfirm: () => void; onCancel: () => void;
}) {
  if (!pending) {
    return (
      <button onClick={onArm} className="btn-ghost px-1.5 py-0.5 text-base text-ink-3 hover:text-down-2" title="Remove" aria-label="Remove">×</button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 animate-fade-in">
      <button onClick={onConfirm} className="btn-danger text-[10px] px-2.5 py-1 font-semibold">Remove</button>
      <button onClick={onCancel} className="btn text-[10px] px-2.5 py-1">Keep</button>
    </span>
  );
}

// ─── Skeleton block ─────────────────────────────────────────────────────────
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
