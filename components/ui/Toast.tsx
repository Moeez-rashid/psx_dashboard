"use client";
import { useEffect, useState } from "react";

type Tone = "ok" | "err" | "info";
interface ToastMsg { id: number; text: string; tone: Tone; }

let nextId = 1;
let push: ((t: ToastMsg) => void) | null = null;

/** Fire a toast from anywhere in client code. */
export function toast(text: string, tone: Tone = "ok") {
  push?.({ id: nextId++, text, tone });
}

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-up/50 text-up-2",
  err: "border-down/50 text-down-2",
  info: "border-sky/50 text-sky-2",
};

/** Mount once near the root. Renders the toast stack. */
export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    push = (t: ToastMsg) => {
      setItems(prev => [...prev.slice(-2), t]);
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), 2600);
    };
    return () => { push = null; };
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-150 flex flex-col gap-2 items-center pointer-events-none">
      {items.map(t => (
        <div key={t.id} className={`bg-raised border rounded-lg px-4 py-2 text-xs font-medium shadow-xl shadow-black/50 animate-slide-up ${TONE_CLASS[t.tone]}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
