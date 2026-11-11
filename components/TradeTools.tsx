"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Lightbulb, RotateCcw } from "lucide-react";
import { Modal, ModalHeader } from "@/components/ui/primitives";
import { OPEN_TOOLS_EVENT } from "@/lib/nav";
import { saveCostPrefs, type CostPrefs } from "@/lib/local-store";
import { useCostPrefs } from "@/lib/use-local";

const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;
const price = (n: number) => n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clean = (s: string) => s.replace(/[^0-9.]/g, "");

const RISK_PRESETS = ["1", "2", "5"];

/** A numbered question with a one-line explanation under it. */
function Question({ n, title, hint, children }: { n: number; title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-up-dim text-up-2 text-[11px] font-semibold flex items-center justify-center">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink">{title}</div>
        <div className="text-[11px] text-ink-3 leading-snug mt-0.5 mb-1.5">{hint}</div>
        {children}
      </div>
    </div>
  );
}

function NumInput({ value, onChange, placeholder, prefix, suffix, label }: {
  value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string; suffix?: string; label: string;
}) {
  return (
    <span className="relative block">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-3 pointer-events-none">{prefix}</span>}
      <input aria-label={label} className={`input num ${prefix ? "pl-12" : ""} ${suffix ? "pr-8" : ""}`} inputMode="decimal"
        placeholder={placeholder} value={value} onChange={(e) => onChange(clean(e.target.value))} />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-3 pointer-events-none">{suffix}</span>}
    </span>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-gold-2 mt-1.5 leading-snug">{children}</p>;
}

/** One line of the plan: a label on the left, the answer on the right, a plain-words note below. */
function PlanLine({ label, value, tone = "text-ink", note }: { label: string; value: string; tone?: string; note?: ReactNode }) {
  return (
    <div className="py-2 border-b border-line last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-ink-2">{label}</span>
        <span className={`text-sm font-semibold num text-right ${tone}`}>{value}</span>
      </div>
      {note && <div className="text-[11px] text-ink-3 mt-0.5 leading-snug">{note}</div>}
    </div>
  );
}

/**
 * Trade calculator, written for someone who has never sized a position:
 * four plain questions, then the plan in sentences. Same arithmetic as
 * before — commission on both sides, capital-gains tax only on a gain —
 * with the user's own editable fee/tax assumptions tucked under a disclosure.
 */
export default function TradeTools() {
  const [open, setOpen] = useState(false);
  const prefs = useCostPrefs();
  const [capital, setCapital] = useState("");
  const [riskPct, setRiskPct] = useState("1");
  const [customRisk, setCustomRisk] = useState("");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [sharesIn, setSharesIn] = useState("");
  const [showFees, setShowFees] = useState(false);
  const [showOwnShares, setShowOwnShares] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ entry?: number } | undefined>).detail;
      if (d?.entry) setEntry(d.entry.toFixed(2));
      setOpen(true);
    };
    window.addEventListener(OPEN_TOOLS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TOOLS_EVENT, onOpen);
  }, []);

  if (!open) return null;

  const setPref = (k: keyof CostPrefs, v: string) => {
    saveCostPrefs({ ...prefs, [k]: Math.min(100, num(v)) });
  };
  const fillExample = () => {
    setCapital("500000"); setRiskPct("1"); setCustomRisk(""); setEntry("100"); setStop("95"); setTarget("112"); setSharesIn("");
  };
  const reset = () => {
    setCapital(""); setRiskPct("1"); setCustomRisk(""); setEntry(""); setStop(""); setTarget(""); setSharesIn(""); setShowOwnShares(false);
  };

  const cap = num(capital), e = num(entry), s = num(stop), t = num(target);
  const stopBad = e > 0 && s > 0 && s >= e;
  const targetBad = e > 0 && t > 0 && t <= e;
  const riskPerShare = e > 0 && s > 0 && s < e ? e - s : 0;
  const riskBudget = cap * (num(riskPct) / 100);
  const sizedShares = riskPerShare > 0 && riskBudget > 0 ? Math.floor(riskBudget / riskPerShare) : 0;
  const ownShares = showOwnShares && num(sharesIn) > 0 ? Math.floor(num(sharesIn)) : 0;
  const shares = ownShares || sizedShares;

  const c = prefs.commissionPct / 100;
  const buyCost = shares * e * (1 + c);
  const sellNet = shares * t * (1 - c);
  const gain = sellNet - buyCost;                       // after commission, before tax
  const tax = gain > 0 ? gain * (prefs.cgtPct / 100) : 0;
  const net = gain - tax;
  const breakEven = e > 0 ? (e * (1 + c)) / (1 - c) : 0;
  const lossAtStop = shares > 0 && s > 0 ? shares * s * (1 - c) - buyCost : 0;
  const rr = riskPerShare > 0 && t > e ? (t - e) / riskPerShare : 0;
  const overCapital = cap > 0 && shares * e > cap;

  const rrVerdict = rr >= 2 ? { word: "Good", tone: "text-up-2", note: "you stand to make at least twice what you risk." }
    : rr >= 1 ? { word: "Okay", tone: "text-gold-2", note: "the possible gain is only a little bigger than the possible loss." }
    : { word: "Poor", tone: "text-down-2", note: "you risk more than you stand to make — most traders skip setups like this." };

  const anyInput = !!(capital || entry || stop || target);
  const missing: string[] = [];
  if (!(cap > 0) && !ownShares) missing.push("how much you can invest");
  if (!(e > 0)) missing.push("your buy price");
  if (!(s > 0) && !ownShares) missing.push("your stop-loss price");

  return (
    <Modal onClose={() => setOpen(false)} maxWidth="max-w-xl">
      <ModalHeader title="Trade calculator" sub="Answer a few questions — it tells you how many shares to buy and what you could make or lose." onClose={() => setOpen(false)} />

      <div className="flex flex-wrap items-center gap-2 mb-4 -mt-1">
        <button type="button" className="btn-sky" onClick={fillExample}>
          <Lightbulb size={13} /> Fill in an example
        </button>
        {anyInput && (
          <button type="button" className="btn-ghost" onClick={reset}>
            <RotateCcw size={12} /> Clear
          </button>
        )}
      </div>

      <div className="space-y-4">
        <Question n={1} title="How much money do you have for trading?"
          hint="Your total trading capital — not just what you'll put into this one stock.">
          <NumInput label="Trading capital" value={capital} onChange={setCapital} placeholder="e.g. 500,000" prefix="PKR" />
        </Question>

        <Question n={2} title="How much of it are you willing to lose on this trade?"
          hint={<>A small slice keeps one bad trade from hurting you. Most traders use 1–2%.{riskBudget > 0 && <> That&apos;s <span className="text-ink-2 num">{pkr(riskBudget)}</span> at most.</>}</>}>
          <div className="flex flex-wrap items-center gap-1.5">
            {RISK_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => { setRiskPct(p); setCustomRisk(""); }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${!customRisk && riskPct === p ? "border-up/60 bg-up-dim text-up-2" : "border-line-2 text-ink-2 hover:bg-raised"}`}>
                {p}%
              </button>
            ))}
            <span className="w-24"><NumInput label="Custom risk percent" value={customRisk} onChange={(v) => { setCustomRisk(v); setRiskPct(v || "1"); }} placeholder="other" suffix="%" /></span>
          </div>
        </Question>

        <Question n={3} title="At what price will you buy?"
          hint="The share price you expect to pay. Opening this from a stock fills it in for you.">
          <NumInput label="Buy price" value={entry} onChange={setEntry} placeholder="e.g. 100.00" prefix="PKR" />
        </Question>

        <Question n={4} title="At what price will you sell if it goes wrong?"
          hint="Your stop-loss: if the price falls to here, you sell to cap the loss. It must be below your buy price.">
          <NumInput label="Stop-loss price" value={stop} onChange={setStop} placeholder="e.g. 95.00" prefix="PKR" />
          {stopBad && <Warn>The stop-loss has to be lower than the buy price ({price(e)}).</Warn>}
        </Question>

        <Question n={5} title="At what price would you take profit? (optional)"
          hint="Your target. Leave blank if you don't have one — you'll still get the share count and the risk.">
          <NumInput label="Target price" value={target} onChange={setTarget} placeholder="e.g. 112.00" prefix="PKR" />
          {targetBad && <Warn>A profit target should be above the buy price ({price(e)}).</Warn>}
        </Question>
      </div>

      {/* ── The plan ─────────────────────────────────────────────────── */}
      <div className="mt-5 rounded-xl border border-line-2 bg-inset p-3.5">
        <div className="label mb-1">Your plan</div>
        {shares > 0 && e > 0 ? (
          <>
            <PlanLine label="Shares to buy" value={shares.toLocaleString("en-PK")}
              note={<>Costs about {pkr(buyCost)} with commission{cap > 0 && <> — {((shares * e) / cap * 100).toFixed(1)}% of your capital</>}.
                {ownShares > 0 ? " (You set this number yourself.)" : ` Sized so that hitting your stop loses about ${num(riskPct)}% of your capital.`}</>} />
            {overCapital && <Warn>That&apos;s more than your capital. Move the stop-loss further from the buy price, or lower the risk %.</Warn>}
            {s > 0 && s < e && (
              <PlanLine label={`If it falls to ${price(s)}`} value={`−${pkr(Math.abs(lossAtStop))}`} tone="text-down-2"
                note="What you lose if you sell at your stop-loss, after commission." />
            )}
            {t > e && (
              <PlanLine label={`If it rises to ${price(t)}`} value={`${net >= 0 ? "+" : "−"}${pkr(Math.abs(net))}`} tone={net >= 0 ? "text-up-2" : "text-down-2"}
                note={<>What you keep after commission ({pkr(shares * (e + t) * c)}){tax > 0 && <> and capital-gains tax ({pkr(tax)})</>}.</>} />
            )}
            <PlanLine label="Break-even price" value={price(breakEven)}
              note="The price needs to get above this just to cover buying and selling commission." />
            {rr > 0 && (
              <PlanLine label="Reward vs risk" value={`${rr.toFixed(1)}× · ${rrVerdict.word}`} tone={rrVerdict.tone}
                note={<>For every PKR 1 you risk, you could make PKR {rr.toFixed(1)} — {rrVerdict.note}</>} />
            )}
          </>
        ) : (
          <p className="text-xs text-ink-3 py-2 leading-relaxed">
            {missing.length > 0
              ? <>Still needed: {missing.join(", ")}. Your plan appears here as soon as those are filled.</>
              : stopBad ? "Fix the stop-loss above and your plan appears here."
              : "Your capital at that risk % isn't enough for even one share — try a larger risk % or a closer stop-loss."}
          </p>
        )}
      </div>

      {/* ── Optional extras ─────────────────────────────────────────── */}
      <div className="mt-3 space-y-1.5">
        <Disclosure open={showOwnShares} onToggle={() => setShowOwnShares((v) => !v)}
          title="I already know how many shares I want"
          summary="Skip the sizing and see the result for your own number">
          <NumInput label="Number of shares" value={sharesIn} onChange={setSharesIn} placeholder={sizedShares ? String(sizedShares) : "e.g. 500"} suffix="shares" />
        </Disclosure>

        <Disclosure open={showFees} onToggle={() => setShowFees((v) => !v)}
          title="Fees & tax used"
          summary={`${prefs.commissionPct}% commission each way · ${prefs.cgtPct}% capital-gains tax`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <FeeField label="Broker commission (each buy/sell)" value={String(prefs.commissionPct)} onChange={(v) => setPref("commissionPct", v)} />
            <FeeField label="Capital-gains tax on profit" value={String(prefs.cgtPct)} onChange={(v) => setPref("cgtPct", v)} />
            <FeeField label="Tax on dividends" value={String(prefs.dividendTaxPct)} onChange={(v) => setPref("dividendTaxPct", v)} />
          </div>
          <p className="text-[10px] text-ink-3 mt-2 leading-relaxed">
            These are your own assumptions, saved in this browser. Defaults are 15% capital-gains and 15% dividend tax (commonly cited for
            tax filers) and 0.15% commission. Rates differ for non-filers, by purchase date and by broker. Excludes CDC and regulatory
            levies. An estimate, not tax advice.
          </p>
        </Disclosure>
      </div>
    </Modal>
  );
}

function FeeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] text-ink-2">{label}</span>
      <NumInput label={label} value={value} onChange={onChange} suffix="%" />
    </label>
  );
}

function Disclosure({ open, onToggle, title, summary, children }: {
  open: boolean; onToggle: () => void; title: string; summary: string; children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-raised rounded-lg transition-colors">
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-ink-2">{title}</span>
          <span className="block text-[10px] text-ink-3 truncate">{summary}</span>
        </span>
        <ChevronDown size={14} className={`text-ink-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}
