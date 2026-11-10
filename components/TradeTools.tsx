"use client";
import { useEffect, useState } from "react";
import { Modal, ModalHeader } from "@/components/ui/primitives";
import { OPEN_TOOLS_EVENT } from "@/lib/nav";
import { DEFAULT_COST_PREFS, readCostPrefs, saveCostPrefs, type CostPrefs } from "@/lib/local-store";

const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;
const clean = (s: string) => s.replace(/[^0-9.]/g, "");

function Field({ label, value, onChange, placeholder, suffix }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="label">{label}</span>
      <span className="relative">
        <input className="input text-xs" inputMode="decimal" placeholder={placeholder} value={value}
          onChange={(e) => onChange(clean(e.target.value))} />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-3">{suffix}</span>}
      </span>
    </label>
  );
}

function Out({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-inset rounded-lg px-2.5 py-1.5 min-w-0">
      <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-0.5">{label}</div>
      <div className={`text-xs font-medium num truncate ${tone}`}>{value}</div>
    </div>
  );
}

/**
 * Trade calculator: how many shares to buy for a chosen risk, and what a
 * trade nets after commission and capital-gains tax. Pure arithmetic on the
 * numbers typed in — the cost rates are the user's own editable assumptions.
 */
export default function TradeTools() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<CostPrefs>(DEFAULT_COST_PREFS);
  const [capital, setCapital] = useState("");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [sharesIn, setSharesIn] = useState("");

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ entry?: number } | undefined>).detail;
      setPrefs(readCostPrefs());
      if (d?.entry) setEntry(d.entry.toFixed(2));
      setOpen(true);
    };
    window.addEventListener(OPEN_TOOLS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TOOLS_EVENT, onOpen);
  }, []);

  if (!open) return null;

  const setPref = (k: keyof CostPrefs, v: string) => {
    const next = { ...prefs, [k]: Math.min(100, num(v)) };
    setPrefs(next); saveCostPrefs(next);
  };

  const e = num(entry), s = num(stop), t = num(target);
  const riskPerShare = e > 0 && s > 0 && s < e ? e - s : 0;
  const riskBudget = num(capital) * (num(riskPct) / 100);
  const sizedShares = riskPerShare > 0 && riskBudget > 0 ? Math.floor(riskBudget / riskPerShare) : 0;
  const shares = num(sharesIn) > 0 ? Math.floor(num(sharesIn)) : sizedShares;

  const c = prefs.commissionPct / 100;
  const buyCost = shares * e * (1 + c);
  const sellNet = shares * t * (1 - c);
  const gain = sellNet - buyCost;                       // after commission, before tax
  const tax = gain > 0 ? gain * (prefs.cgtPct / 100) : 0;
  const net = gain - tax;
  const breakEven = e > 0 ? (e * (1 + c)) / (1 - c) : 0;
  const lossAtStop = shares > 0 && s > 0 ? shares * s * (1 - c) - buyCost : 0;
  const rr = riskPerShare > 0 && t > e ? (t - e) / riskPerShare : 0;
  const ready = shares > 0 && e > 0;

  return (
    <Modal onClose={() => setOpen(false)} maxWidth="max-w-lg">
      <ModalHeader title="Trade calculator" sub="Position size, break-even and what a trade nets after costs" onClose={() => setOpen(false)} />

      <div className="label mb-1.5">1 · Size the position from your risk</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Field label="Capital" value={capital} onChange={setCapital} placeholder="500000" suffix="PKR" />
        <Field label="Risk per trade" value={riskPct} onChange={setRiskPct} placeholder="1" suffix="%" />
        <Field label="Entry price" value={entry} onChange={setEntry} placeholder="0.00" />
        <Field label="Stop-loss" value={stop} onChange={setStop} placeholder="0.00" />
      </div>
      {e > 0 && s >= e && <p className="text-[11px] text-gold-2 mt-1.5">A stop-loss sits below the entry price for a buy.</p>}
      <div className="grid grid-cols-3 gap-1.5 mt-2">
        <Out label="Shares to buy" value={sizedShares > 0 ? sizedShares.toLocaleString() : "—"} />
        <Out label="Position value" value={sizedShares > 0 ? pkr(sizedShares * e) : "—"} />
        <Out label="Share of capital" value={sizedShares > 0 && num(capital) > 0 ? `${((sizedShares * e) / num(capital) * 100).toFixed(1)}%` : "—"}
          tone={sizedShares * e > num(capital) && num(capital) > 0 ? "text-gold-2" : "text-ink"} />
      </div>
      {sizedShares * e > num(capital) && num(capital) > 0 && (
        <p className="text-[11px] text-gold-2 mt-1.5">This size needs more than your capital — the stop is too tight for that risk budget.</p>
      )}

      <div className="label mt-5 mb-1.5">2 · What the trade nets</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Target / sell price" value={target} onChange={setTarget} placeholder="0.00" />
        <Field label="Shares (blank = sized above)" value={sharesIn} onChange={setSharesIn} placeholder={sizedShares ? String(sizedShares) : "0"} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
        <Out label="Break-even price" value={breakEven > 0 ? breakEven.toFixed(2) : "—"} />
        <Out label="Net if target hit" value={ready && t > 0 ? `${net >= 0 ? "+" : "−"}${pkr(Math.abs(net))}` : "—"} tone={ready && t > 0 ? (net >= 0 ? "text-up-2" : "text-down-2") : "text-ink"} />
        <Out label="Loss if stopped" value={ready && s > 0 ? `−${pkr(Math.abs(lossAtStop))}` : "—"} tone={ready && s > 0 ? "text-down-2" : "text-ink"} />
        <Out label="Reward : risk" value={rr > 0 ? `${rr.toFixed(2)} : 1` : "—"} tone={rr >= 2 ? "text-up-2" : rr > 0 && rr < 1 ? "text-down-2" : "text-ink"} />
      </div>
      {ready && t > 0 && (
        <p className="text-[10px] text-ink-3 mt-1.5 num">
          Buy {pkr(buyCost)} · sell {pkr(sellNet)} · commission {pkr(shares * (e + t) * c)}{tax > 0 ? ` · tax ${pkr(tax)}` : ""}
        </p>
      )}

      <div className="label mt-5 mb-1.5">Your cost assumptions</div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Commission / side" value={String(prefs.commissionPct)} onChange={(v) => setPref("commissionPct", v)} suffix="%" />
        <Field label="Capital gains tax" value={String(prefs.cgtPct)} onChange={(v) => setPref("cgtPct", v)} suffix="%" />
        <Field label="Dividend tax" value={String(prefs.dividendTaxPct)} onChange={(v) => setPref("dividendTaxPct", v)} suffix="%" />
      </div>
      <p className="text-[10px] text-ink-3 mt-2 leading-relaxed">
        Defaults are 15% capital gains and 15% dividend tax (commonly cited for tax filers) and 0.15% commission. Rates differ for
        non-filers, by purchase date and by broker — set your own. Excludes CDC and regulatory levies. An estimate, not tax advice.
      </p>
    </Modal>
  );
}
