"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Cloud, CloudOff, Copy, KeyRound, RefreshCw, Smartphone } from "lucide-react";
import { Modal, ModalHeader } from "./ui/primitives";
import { toast } from "./ui/Toast";
import { disableSync, enableSync, joinSync, rotateSyncKey, useSyncKey } from "@/lib/holdings-sync-client";

/** Strip above the holdings list: sync status + the entry point to set it up. */
export default function HoldingsSync() {
  const key = useSyncKey();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex justify-end mb-2">
        <button type="button" onClick={() => setOpen(true)} className={key ? "btn-accent" : "btn"}>
          {key ? <Cloud size={13} /> : <Smartphone size={13} />}
          {key ? "Synced · iPhone widget" : "Sync & iPhone widget"}
        </button>
      </div>
      {open && <SyncDialog syncKey={key} onClose={() => setOpen(false)} />}
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="shrink-0 w-5 h-5 rounded-full bg-up-dim text-up-2 text-[11px] font-semibold flex items-center justify-center">{n}</span>
      <span className="text-xs text-ink-2 leading-relaxed pt-0.5">{children}</span>
    </li>
  );
}

function SyncDialog({ syncKey, onClose }: { syncKey: string | null; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [joinKey, setJoinKey] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const setupLink = syncKey ? `${window.location.origin}/widget#k=${syncKey}` : "";

  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label); setError("");
    try { await fn(); toast(done); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    setBusy(null);
  };
  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); }
    catch { setError(`Your browser blocked copying. Copy it by hand: ${text}`); }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader title="Sync & iPhone widget" sub="Keep the same holdings on every device, and see them on your iPhone home screen." onClose={onClose} />

      {!syncKey ? (
        <>
          <p className="text-xs text-ink-2 leading-relaxed">
            Right now your holdings live only in this browser. Turning sync on stores them on this site under a private
            key — a long random code that works like a secret link. Any device or widget with the key sees the same
            holdings, and edits on one show up on the others.
          </p>
          <ul className="text-[11px] text-ink-3 mt-2 space-y-1 list-disc pl-4">
            <li>No account or email. Only ticker, shares and average price are stored.</li>
            <li>You can replace the key or turn sync off at any time; turning it off deletes the server copy.</li>
          </ul>
          <button type="button" className="btn-accent w-full mt-4 py-2" disabled={!!busy}
            onClick={() => run("on", enableSync, "Sync is on")}>
            {busy === "on" ? <RefreshCw size={13} className="animate-spin" /> : <Cloud size={13} />} Turn on sync
          </button>

          <div className="mt-5 pt-4 border-t border-line">
            <div className="text-xs text-ink mb-1">Already turned it on on another device?</div>
            <div className="text-[11px] text-ink-3 mb-2">Paste that key here. Its holdings will replace the ones in this browser.</div>
            <div className="flex gap-2">
              <input className="input text-xs font-mono" placeholder="Sync key" value={joinKey}
                onChange={(e) => setJoinKey(e.target.value.trim())} aria-label="Sync key from another device" />
              <button type="button" className="btn shrink-0" disabled={!joinKey || !!busy}
                onClick={() => run("join", () => joinSync(joinKey), "Holdings synced from your other device")}>
                {busy === "join" ? <RefreshCw size={13} className="animate-spin" /> : <KeyRound size={13} />} Use key
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-up-2 mb-3">
            <Check size={14} /> Sync is on — edits here are saved within a second and appear on your other devices.
          </div>

          <div className="label mb-2">Add the widget to your iPhone</div>
          <ol className="space-y-2">
            <Step n={1}>Copy the setup link below and open it in Safari on your iPhone (AirDrop it, or message it to yourself).</Step>
            <Step n={2}>That page has a <b className="text-ink">Copy widget code</b> button and the remaining steps — about two minutes, done once.</Step>
          </ol>
          <div className="flex gap-2 mt-3">
            <button type="button" className="btn-accent flex-1" onClick={() => copy("link", setupLink)}>
              {copied === "link" ? <Check size={13} /> : <Copy size={13} />} {copied === "link" ? "Copied" : "Copy iPhone setup link"}
            </button>
            <Link href="/widget" className="btn" onClick={onClose}>Open setup page</Link>
          </div>
          <p className="text-[10px] text-ink-3 mt-2 leading-relaxed">
            The link contains your key, so share it only with your own devices.
          </p>

          <div className="mt-5 pt-4 border-t border-line">
            <div className="label mb-1.5">Your sync key</div>
            <div className="flex gap-2 items-center">
              <code className="flex-1 min-w-0 truncate bg-inset border border-line rounded-lg px-2.5 py-1.5 text-[11px] text-ink-2">{syncKey}</code>
              <button type="button" className="btn shrink-0" onClick={() => copy("key", syncKey)}>
                {copied === "key" ? <Check size={13} /> : <Copy size={13} />} {copied === "key" ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[11px] text-ink-3 mt-1.5">To sync another browser, open Holdings there → Sync &amp; iPhone widget → paste this key.</p>

            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" className="btn" disabled={!!busy}
                onClick={() => run("rotate", rotateSyncKey, "New key made — set it up again on your other devices")}>
                {busy === "rotate" ? <RefreshCw size={13} className="animate-spin" /> : <KeyRound size={13} />} Make a new key
              </button>
              {!confirmOff ? (
                <button type="button" className="btn-ghost" onClick={() => setConfirmOff(true)}>
                  <CloudOff size={13} /> Turn off sync
                </button>
              ) : (
                <button type="button" className="btn-danger" disabled={!!busy}
                  onClick={() => run("off", disableSync, "Sync is off — the server copy was deleted")}>
                  <CloudOff size={13} /> Confirm: delete server copy
                </button>
              )}
            </div>
            <p className="text-[10px] text-ink-3 mt-2 leading-relaxed">
              A new key stops the old one working immediately (other devices and the widget will need the new one). Turning sync
              off keeps your holdings in this browser.
            </p>
          </div>
        </>
      )}

      {error && <p className="text-[11px] text-down-2 mt-3">{error}</p>}
    </Modal>
  );
}
