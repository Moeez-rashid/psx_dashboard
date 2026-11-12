"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Smartphone } from "lucide-react";
import { getSyncKey, joinSync, useSyncKey } from "@/lib/holdings-sync-client";

/**
 * The script the user pastes into Scriptable — once. It is only a loader:
 * each run it downloads the real layout (public/scriptable/holdings-widget.js)
 * and keeps a copy for offline use, so layout fixes reach the phone without
 * pasting again. The sync key is embedded so the widget needs no setup
 * beyond choosing the script.
 */
function loaderCode(site: string, key: string): string {
  return `// PSX Holdings — iPhone home-screen widget (Scriptable).
// Paste this ONCE. It downloads the latest widget layout from the site each
// time it runs (keeping a copy for offline use), so updates arrive on their own.
// The key below gives read access to your synced holdings. Keep it private.

const SITE = "${site}";
const KEY = (args.widgetParameter || "").trim() || "${key}";

const fm = FileManager.local();
const file = fm.joinPath(fm.documentsDirectory(), "psx-holdings-widget.js");
try {
  const req = new Request(SITE + "/scriptable/holdings-widget.js?t=" + Date.now());
  req.timeoutInterval = 15;
  const code = await req.loadString();
  if (code.includes("module.exports")) fm.writeString(file, code);
} catch (e) { /* offline: use the saved copy */ }

if (fm.fileExists(file)) {
  await importModule(file)(SITE, KEY);
} else {
  const w = new ListWidget();
  w.backgroundColor = new Color("#0b0b0f");
  const t = w.addText("PSX: connect to the internet once to finish setup.");
  t.textColor = Color.white(); t.font = Font.systemFont(13);
  if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
}
Script.complete();
`;
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-up-dim text-up-2 text-xs font-semibold flex items-center justify-center">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-sm text-ink">{title}</div>
        {children && <div className="text-xs text-ink-3 mt-0.5 leading-relaxed">{children}</div>}
      </div>
    </li>
  );
}

export default function WidgetSetup() {
  const key = useSyncKey();
  const [linkError, setLinkError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  // Opened from a setup link (/widget#k=KEY): this device joins sync, then the
  // key is dropped from the address bar. The fragment never reaches the server.
  useEffect(() => {
    const k = new URLSearchParams(window.location.hash.slice(1)).get("k");
    if (!k) return;
    window.history.replaceState(null, "", "/widget");
    if (k === getSyncKey()) return;
    joinSync(k).catch((e: Error) => setLinkError(e.message));
  }, []);

  const copy = async () => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(loaderCode(window.location.origin, key));
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch {
      // Some browsers refuse clipboard access; hand over the code to copy by hand instead.
      setShowCode(true);
    }
  };

  return (
    <main className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone size={18} className="text-up-2" />
        <h1 className="text-lg font-semibold text-ink">Holdings on your iPhone</h1>
      </div>
      <p className="text-xs text-ink-2 leading-relaxed mb-5">
        A home-screen widget with your portfolio value, today&apos;s profit or loss and your biggest holdings. It follows your
        synced holdings, so buying or selling on the website updates it — nothing to paste again.
      </p>

      {linkError && <p className="text-xs text-down-2 mb-4">{linkError}</p>}

      {!key ? (
        <div className="card">
          <div className="text-sm text-ink mb-1">Turn on sync first</div>
          <p className="text-xs text-ink-3 leading-relaxed">
            On the device where your holdings are, open <Link href="/?tab=holdings" className="text-sky-2 underline underline-offset-2">Holdings</Link> →
            <b className="text-ink-2"> Sync &amp; iPhone widget</b> → <b className="text-ink-2">Turn on sync</b>, then <b className="text-ink-2">Copy iPhone setup link</b> and
            open that link on your iPhone.
          </p>
        </div>
      ) : (
        <>
          <ol className="space-y-4">
            <Step n={1} title="Install Scriptable">Free on the App Store.</Step>
            <Step n={2} title="Copy the widget code">
              <button type="button" onClick={copy} className="btn-accent mt-2 py-2 px-4">
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied — now open Scriptable" : "Copy widget code"}
              </button>
              {!showCode && (
                <button type="button" onClick={() => setShowCode(true)} className="block mt-1.5 text-[11px] text-ink-3 underline underline-offset-2 cursor-pointer">
                  Copy didn&apos;t work? Show the code
                </button>
              )}
              {showCode && (
                <>
                  <p className="text-[11px] text-gold-2 mt-2">Tap inside the box, Select All, then Copy.</p>
                  <textarea readOnly aria-label="Widget code" value={loaderCode(window.location.origin, key)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="input font-mono text-[10px] leading-snug mt-1.5 h-40 resize-none" />
                </>
              )}
            </Step>
            <Step n={3} title="Paste it into Scriptable">
              Tap <b className="text-ink-2">+</b>, paste, and name the script <b className="text-ink-2">PSX Holdings</b>. Tap ▶ once to see a preview.
            </Step>
            <Step n={4} title="Add the widget">
              Long-press the home screen → <b className="text-ink-2">Edit</b> → <b className="text-ink-2">Add Widget</b> → <b className="text-ink-2">Scriptable</b>.
              Medium shows the most; small shows the totals.
            </Step>
            <Step n={5} title="Point it at the script">
              Long-press the widget → <b className="text-ink-2">Edit Widget</b> → Script: <b className="text-ink-2">PSX Holdings</b>, When Interacting:
              <b className="text-ink-2"> Open URL</b>. Tapping it then opens your Holdings here.
            </Step>
          </ol>

          <div className="card mt-6 text-xs text-ink-3 leading-relaxed space-y-1.5">
            <div className="text-ink-2 font-medium">How it updates</div>
            <p>iOS decides when widgets refresh — usually every 15–60 minutes, a little more often while the market is open. The widget shows the time its prices are from, so you always know how fresh they are.</p>
            <p>Holdings you add, edit or remove on any synced device appear at the widget&apos;s next refresh. For live prices, tap the widget.</p>
            <p>Lock screen: add a Scriptable widget there the same way for a one-line &ldquo;today&rdquo; figure.</p>
          </div>
          <p className="text-[11px] text-ink-3 mt-3">
            This browser is synced too. Manage or replace the key under Holdings → Sync &amp; iPhone widget.
          </p>
        </>
      )}
    </main>
  );
}
