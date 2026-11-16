"use client";
import { useEffect, useState } from "react";
import { flagInfo } from "@/lib/corporate-flags";

/**
 * PSX's XD / XB / XR marker as a small tappable badge; tapping shows one
 * short line saying what it means. A span (not a button) so it can sit
 * inside a tappable row without nesting buttons.
 */
export default function FlagBubble({ code, size = "sm" }: { code: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const t = setTimeout(() => document.addEventListener("click", close), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", close); };
  }, [open]);

  const toggle = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); setOpen((v) => !v); };

  return (
    <span className="relative inline-flex shrink-0">
      <span
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${code}: what this means`}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(e); }}
        className={`font-bold text-gold-2 border border-gold/40 rounded cursor-pointer select-none
          ${size === "md" ? "text-[10px] px-2 py-0.5 rounded-md" : "text-[8px] px-1"} ${open ? "bg-gold-dim" : ""}`}
      >
        {code}
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full mt-1 z-30 w-max max-w-[220px] whitespace-normal rounded-md border border-line-2 bg-raised px-2 py-1 text-[11px] font-normal text-ink-2 shadow-lg shadow-black/50"
        >
          {flagInfo(code).meaning}
        </span>
      )}
    </span>
  );
}
