"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Modal, ModalHeader } from "@/components/ui/primitives";
import TickerInput from "@/components/ui/TickerInput";
import { toast } from "@/components/ui/Toast";
import { OPEN_ALERTS_EVENT } from "@/lib/nav";
import { addAlert, readAlerts, saveAlerts, type PriceAlert } from "@/lib/local-store";
import { useAlerts } from "@/lib/use-local";
import { timeAgo } from "@/lib/format";

const POLL_MS = 60_000;

/** Open the alerts panel pre-filled for a ticker (e.g. from a stock row). */
export function openAlertFor(ticker: string, price?: number) {
  window.dispatchEvent(new CustomEvent(OPEN_ALERTS_EVENT, { detail: { ticker, price } }));
}

/**
 * Price alerts: the panel to manage them, plus the background check that
 * fires them. Alerts are checked against PSX prices once a minute WHILE THIS
 * APP IS OPEN in a browser tab — there is no server pushing notifications.
 */
export default function AlertsCenter() {
  const [open, setOpen] = useState(false);
  const alerts = useAlerts();
  const [ticker, setTicker] = useState("");
  const [direction, setDirection] = useState<PriceAlert["direction"]>("above");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission)
  );
  const checking = useRef(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ ticker?: string; price?: number } | undefined>).detail;
      if (d?.ticker) {
        setTicker(d.ticker);
        setPrice(d.price ? d.price.toFixed(2) : "");
      }
      setError("");
      setOpen(true);
    };
    window.addEventListener(OPEN_ALERTS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ALERTS_EVENT, onOpen);
  }, []);

  const check = useCallback(async () => {
    const all = readAlerts();
    const active = all.filter((a) => !a.triggeredAt);
    if (active.length === 0 || checking.current) return;
    checking.current = true;
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [...new Set(active.map((a) => a.ticker))] }),
      });
      if (!res.ok) return;
      const quotes: Record<string, { currentPrice: number }> = await res.json();
      let changed = false;
      const next = all.map((a) => {
        if (a.triggeredAt) return a;
        const p = quotes[a.ticker]?.currentPrice;
        if (!p) return a;
        const hit = a.direction === "above" ? p >= a.price : p <= a.price;
        if (!hit) return a;
        changed = true;
        const text = `${a.ticker} is ${a.direction === "above" ? "at or above" : "at or below"} ${a.price.toFixed(2)} — now ${p.toFixed(2)}`;
        toast(text, "info");
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification("PSX price alert", { body: text, tag: a.id }); } catch { /* notification blocked by the platform */ }
        }
        return { ...a, triggeredAt: new Date().toISOString(), triggeredPrice: p };
      });
      if (changed) saveAlerts(next);
    } catch {
      // Offline or PSX unreachable — try again on the next tick.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [check]);

  const create = () => {
    const t = ticker.trim().toUpperCase();
    const p = parseFloat(price);
    if (!/^[A-Z0-9]{2,10}$/.test(t)) { setError("Enter a ticker symbol."); return; }
    if (!Number.isFinite(p) || p <= 0) { setError("Enter a target price."); return; }
    addAlert(t, direction, p);
    setTicker(""); setPrice(""); setError("");
    toast(`Alert set: ${t} ${direction} ${p.toFixed(2)}`);
    check();
  };

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  };

  if (!open) return null;
  const active = alerts.filter((a) => !a.triggeredAt);
  const triggered = alerts.filter((a) => a.triggeredAt);

  return (
    <Modal onClose={() => setOpen(false)} maxWidth="max-w-md">
      <ModalHeader title="Price alerts" sub="Checked every minute while PSX Scanner is open in a tab" onClose={() => setOpen(false)} />

      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex flex-col gap-1 flex-1 min-w-28">
          <span className="label">Ticker</span>
          <TickerInput value={ticker} onChange={setTicker} placeholder="e.g. MEBL" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="label">When price is</span>
          <div className="flex bg-inset rounded-lg p-0.5 border border-line-2">
            {(["above", "below"] as const).map((d) => (
              <button key={d} onClick={() => setDirection(d)} aria-pressed={direction === d}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md cursor-pointer ${direction === d ? "bg-raised text-ink" : "text-ink-3"}`}>
                {d === "above" ? <ArrowUp size={11} strokeWidth={2.5} aria-hidden /> : <ArrowDown size={11} strokeWidth={2.5} aria-hidden />}{d}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 w-24">
          <span className="label">PKR</span>
          <input className="input" inputMode="decimal" placeholder="0.00" value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && create()} aria-label="Target price" />
        </div>
        <button onClick={create} className="btn-accent px-4 py-2">Add</button>
      </div>
      {error && <p className="text-[11px] text-down-2 mt-2">{error}</p>}

      {permission === "default" && (
        <button onClick={enableNotifications} className="btn-sky w-full mt-3 text-[11px] py-2">
          <BellRing size={13} strokeWidth={2} aria-hidden />Also show a browser notification when an alert fires
        </button>
      )}
      {permission === "denied" && (
        <p className="text-[10px] text-ink-3 mt-3">Browser notifications are blocked for this site, so alerts will appear only inside the app.</p>
      )}

      <div className="mt-4">
        <div className="label mb-1.5">Active · {active.length}</div>
        {active.length === 0 && (
          <p className="text-[11px] text-ink-3 flex items-center gap-1.5"><Bell size={12} strokeWidth={2} aria-hidden />No active alerts.</p>
        )}
        <div className="space-y-1">
          {active.map((a) => <AlertRow key={a.id} a={a} onDelete={() => saveAlerts(readAlerts().filter((x) => x.id !== a.id))} />)}
        </div>
      </div>

      {triggered.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="label">Triggered · {triggered.length}</span>
            <button onClick={() => saveAlerts(readAlerts().filter((x) => !x.triggeredAt))} className="text-[10px] text-ink-3 hover:text-ink-2 cursor-pointer">Clear</button>
          </div>
          <div className="space-y-1">
            {triggered.slice(0, 10).map((a) => <AlertRow key={a.id} a={a} onDelete={() => saveAlerts(readAlerts().filter((x) => x.id !== a.id))} />)}
          </div>
        </div>
      )}
    </Modal>
  );
}

function AlertRow({ a, onDelete }: { a: PriceAlert; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 bg-inset border border-line rounded-lg px-3 py-2">
      {a.direction === "above"
        ? <ArrowUp size={12} strokeWidth={2.5} className="text-up-2 shrink-0" aria-hidden />
        : <ArrowDown size={12} strokeWidth={2.5} className="text-down-2 shrink-0" aria-hidden />}
      <span className="text-xs font-semibold text-ink">{a.ticker}</span>
      <span className="text-[11px] text-ink-2 num">{a.direction} {a.price.toFixed(2)}</span>
      <span className="text-[10px] text-ink-3 flex-1 truncate">
        {a.triggeredAt ? `hit ${a.triggeredPrice?.toFixed(2) ?? ""} · ${timeAgo(a.triggeredAt)}` : `set ${timeAgo(a.createdAt)}`}
      </span>
      <button onClick={onDelete} title="Delete alert" aria-label={`Delete ${a.ticker} alert`} className="text-ink-3 hover:text-down-2 cursor-pointer">
        <Trash2 size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
