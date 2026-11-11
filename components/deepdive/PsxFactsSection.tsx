import { Landmark, FileText, ExternalLink } from "lucide-react";
import { getCompanyPage, type AnnouncementKind, type CompanyPage, type FinancialTable } from "@/lib/psx-company";
import { getSnapshotMap } from "@/lib/psx-snapshot";
import { PSX_BASE } from "@/lib/psx-http";
import { Section, Group, MetricGrid, Metric, Tag, fmtNum, fmtPKRLarge, fmtSignedPercent, signTone, DASH } from "./shared";

/**
 * What the exchange itself publishes about this company: trading limits and
 * ranges, size and float, index membership (including Shariah status), its
 * own financial summary, and the company's filings with links to the PDFs.
 * Rendered verbatim from PSX's public company page — nothing here is derived
 * or estimated by this app.
 */

const KIND_LABEL: Record<AnnouncementKind, { text: string; cls: string }> = {
  "dividend": { text: "Payout", cls: "text-up-2 border-up/40" },
  "book-closure": { text: "Book closure", cls: "text-gold-2 border-gold/40" },
  "results": { text: "Results", cls: "text-sky-2 border-sky/40" },
  "board-meeting": { text: "Board meeting", cls: "text-violet-2 border-violet/40" },
  "agm": { text: "AGM / EOGM", cls: "text-violet-2 border-violet/40" },
  "other": { text: "Notice", cls: "text-ink-3 border-line-2" },
};

const INDEX_LABEL: Record<string, string> = {
  KSE100: "KSE-100", KSE30: "KSE-30", KMI30: "KMI-30", KMIALLSHR: "KMI All Share", PSXDIV20: "Dividend 20", ALLSHR: "All Share",
};

function RangeBar({ label, low, high, current, hint }: { label: string; low: number | null; high: number | null; current: number | null; hint?: string }) {
  if (low === null || high === null || high <= low) return null;
  const pos = current === null ? null : Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="label">{label}</span>
        {pos !== null && <span className="text-[10px] text-ink-3 num">{pos.toFixed(0)}% of range</span>}
      </div>
      <div className="relative h-1 rounded-full bg-line-2/70">
        {pos !== null && <span className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-ink ring-2 ring-surface" style={{ left: `calc(${pos}% - 4px)` }} />}
      </div>
      <div className="flex justify-between text-[11px] num mt-1.5">
        <span className="text-ink-2">{low.toFixed(2)}</span>
        <span className="text-ink-2">{high.toFixed(2)}</span>
      </div>
      {hint && <p className="text-[10px] text-ink-3 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function FinTable({ table, title }: { table: FinancialTable; title: string }) {
  const fmt = (label: string, v: number | null) =>
    v === null ? DASH : /eps|%|peg|margin|growth/i.test(label) ? v.toFixed(2) : fmtPKRLarge(v * 1000);
  return (
    <Group title={title}>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[11px] num min-w-[340px]">
          <thead>
            <tr className="text-ink-3">
              <th className="text-left font-medium pb-1.5 pr-3" />
              {table.periods.map((p) => <th key={p} className="text-right font-medium pb-1.5 pl-3 whitespace-nowrap">{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <td className="py-1.5 pr-3 text-ink-2 font-sans">{r.label}</td>
                {table.periods.map((p, i) => (
                  <td key={p} className={`py-1.5 pl-3 text-right ${r.values[i] !== null && r.values[i]! < 0 ? "text-down-2" : "text-ink"}`}>
                    {fmt(r.label, r.values[i] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Group>
  );
}

export default async function PsxFactsSection({ ticker }: { ticker: string }) {
  let c: CompanyPage;
  let stale = false;
  try {
    const r = await getCompanyPage(ticker);
    c = r.value; stale = r.stale;
  } catch {
    return (
      <Section icon={Landmark} title="PSX company record" kicker="Limits, size, filings and financials as published by the exchange.">
        <p className="text-[11px] text-ink-3">PSX&apos;s company page for {ticker} could not be loaded right now. Everything else on this page is unaffected.</p>
      </Section>
    );
  }
  const snap = await getSnapshotMap().then((m) => m.get(ticker) ?? null).catch(() => null);
  const indices = (snap?.indices ?? []).filter((i) => INDEX_LABEL[i]);

  return (
    <Section
      icon={Landmark}
      id="psx-record"
      title="PSX company record"
      kicker="Trading limits, size, index membership, filings and financials exactly as the exchange publishes them."
      aside={<>
        {stale && <Tag tone="eod" title="PSX did not answer the latest refresh — showing the previous copy">Earlier copy</Tag>}
        {c.asOf && <Tag title="Timestamp PSX shows on this company's quote">As of {c.asOf}</Tag>}
      </>}
    >
      {(snap || c.flags.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {snap && (snap.shariah
            ? <span className="text-[10px] font-semibold text-up-2 border border-up/40 rounded-md px-2 py-0.5" title="Constituent of the KMI All Share index — PSX's Shariah-compliant universe">Shariah-compliant · KMI All Share</span>
            : <span className="text-[10px] text-ink-3 border border-line-2 rounded-md px-2 py-0.5" title="Not a constituent of the KMI All Share index">Not in KMI All Share</span>)}
          {indices.filter((i) => i !== "KMIALLSHR" && i !== "ALLSHR").map((i) => (
            <span key={i} className="text-[10px] text-ink-2 border border-line-2 rounded-md px-2 py-0.5">{INDEX_LABEL[i]}</span>
          ))}
          {c.flags.map((f) => (
            <span key={f} className="text-[10px] font-semibold text-gold-2 border border-gold/40 rounded-md px-2 py-0.5"
              title={f === "XD" ? "Trading ex-dividend" : f === "XB" ? "Trading ex-bonus" : "Trading ex-right"}>{f}</span>
          ))}
        </div>
      )}

      <Group title="Ranges and limits">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
          <RangeBar label="52-week range" low={c.week52Low} high={c.week52High} current={c.price} />
          <RangeBar label="Day range" low={c.low} high={c.high} current={c.price} />
          <RangeBar label="Circuit breaker" low={c.circuitLow} high={c.circuitHigh} current={c.price}
            hint="Trading halts at these prices for the session." />
        </div>
      </Group>

      <Group title="Size and performance">
        <MetricGrid cols={4}>
          <Metric label="Market cap" value={c.marketCap !== null ? `PKR ${fmtPKRLarge(c.marketCap)}` : DASH} />
          <Metric label="Free float" value={c.freeFloatPct !== null ? `${c.freeFloatPct.toFixed(0)}%` : DASH}
            hint={c.freeFloatShares !== null ? `${fmtPKRLarge(c.freeFloatShares)} shares` : undefined} />
          <Metric label="P/E (trailing)" value={c.peTtm !== null && c.peTtm > 0 ? `${fmtNum(c.peTtm)}×` : DASH} hint="As computed by PSX" />
          <Metric label="Dividend yield" value={snap && snap.dividendYield > 0 ? `${snap.dividendYield.toFixed(2)}%` : DASH} />
          <Metric label="1-year change" value={fmtSignedPercent(c.change1y)} tone={signTone(c.change1y)} />
          <Metric label="Year to date" value={fmtSignedPercent(c.changeYtd)} tone={signTone(c.changeYtd)} />
          <Metric label="Volume" value={c.volume !== null ? c.volume.toLocaleString("en-PK") : DASH}
            hint={snap ? `30-day avg ${Math.round(snap.avgVolume30d).toLocaleString("en-PK")}` : undefined} />
          <Metric label="Fiscal year end" value={c.fiscalYearEnd ?? DASH} />
        </MetricGrid>
      </Group>

      {(c.quarterly || c.annual) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
          {c.quarterly && <FinTable table={c.quarterly} title="Quarterly results" />}
          {c.annual && <FinTable table={c.annual} title="Annual results" />}
        </div>
      )}

      <Group
        title="Company announcements"
        aside={
          <a href={`${PSX_BASE}/company/${ticker}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-ink-3 hover:text-sky-2">
            All on PSX<ExternalLink size={10} strokeWidth={2.25} aria-hidden />
          </a>
        }
      >
        {c.announcements.length === 0 ? (
          <p className="text-[11px] text-ink-3">No recent announcements listed.</p>
        ) : (
          <ul className="divide-y divide-line">
            {c.announcements.slice(0, 10).map((a, i) => {
              const k = KIND_LABEL[a.kind];
              const body = (
                <>
                  <span className="text-[10px] text-ink-3 num w-[68px] shrink-0 pt-px">{a.date}</span>
                  <span className={`text-[9px] font-semibold border rounded px-1.5 py-px shrink-0 mt-px ${k.cls}`}>{k.text}</span>
                  <span className="text-[11px] text-ink-2 leading-snug flex-1 min-w-0">{a.title}</span>
                  {a.pdfUrl && <FileText size={12} strokeWidth={2} className="text-ink-3 shrink-0 mt-0.5" aria-hidden />}
                </>
              );
              return (
                <li key={i}>
                  {a.pdfUrl
                    ? <a href={a.pdfUrl} target="_blank" rel="noreferrer" className="flex items-start gap-2.5 py-2 hover:bg-inset -mx-2 px-2 rounded-md" title="Open the filed document (PDF)">{body}</a>
                    : <div className="flex items-start gap-2.5 py-2">{body}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Group>
    </Section>
  );
}
