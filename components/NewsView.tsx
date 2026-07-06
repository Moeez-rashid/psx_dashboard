"use client";
import { useMemo } from "react";
import type { AISignal, NewsAnalysis } from "@/lib/providers/types";
import MarketStrip from "./MarketStrip";

// ─── Sentiment model ────────────────────────────────────────────────────────
// The scan's NewsAnalysis has no explicit sentiment field, so we derive one
// deterministically from the net POSITIVE/NEGATIVE tilt of the flagged sectors.
// A -100..100 score is persisted daily (see Dashboard) to build the 7-day chart.

type Tone = "up" | "down" | "gold" | "sky";

export interface SentimentPoint {
  date: string;   // YYYY-MM-DD in PKT
  score: number;  // -100..100
  label: string;
}

const TONE: Record<Tone, { text: string; bg: string; border: string; bar: string }> = {
  up:   { text: "text-up-2",   bg: "bg-up-dim",   border: "border-up/40",   bar: "bg-up" },
  down: { text: "text-down-2", bg: "bg-down-dim", border: "border-down/40", bar: "bg-down" },
  gold: { text: "text-gold-2", bg: "bg-gold-dim", border: "border-gold/40", bar: "bg-gold" },
  sky:  { text: "text-sky-2",  bg: "bg-sky-dim",  border: "border-sky/40",  bar: "bg-sky" },
};

export function sentimentFromScore(score: number): { label: string; tone: Tone } {
  if (score >= 30) return { label: "Bullish", tone: "up" };
  if (score <= -50) return { label: "Bearish", tone: "down" };
  if (score < 0) return { label: "Cautious", tone: "gold" };
  return { label: "Neutral", tone: "sky" };
}

/** Net sector tilt → sentiment label + tone + -100..100 score. */
export function deriveSentiment(na: NewsAnalysis | null): { label: string; tone: Tone; score: number } {
  if (!na || !na.affectedSectors?.length) return { label: "Neutral", tone: "sky", score: 0 };
  let pos = 0, neg = 0;
  for (const s of na.affectedSectors) {
    if (s.impact === "POSITIVE") pos++;
    else if (s.impact === "NEGATIVE") neg++;
  }
  const total = pos + neg;
  const score = total === 0 ? 0 : Math.round(((pos - neg) / total) * 100);
  return { ...sentimentFromScore(score), score };
}

// ─── Headline parsing ───────────────────────────────────────────────────────
// RSS lines arrive formatted as "[Source · Mon D] Title — description".
function parseHeadline(line: string): { source: string; date: string; head: string; desc: string } {
  const m = line.match(/^\[([^\]]+)\]\s*(.*)$/);
  const meta = m ? m[1] : "";
  const rest = m ? m[2] : line;
  const parts = meta.split("·").map(s => s.trim());
  const [head, ...restDesc] = rest.split(" — ");
  return { source: parts[0] ?? "", date: parts[1] ?? "", head: head.trim(), desc: restDesc.join(" — ").trim() };
}

function dayLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date.slice(5);
  return d.toLocaleDateString("en-PK", { weekday: "short" });
}

interface FeedItem {
  kind: "ticker" | "macro";
  ticker?: string;
  source: string;
  date: string;
  head: string;
  desc: string;
}

// ─── Sentiment badge (also reused by the Buy Opportunities macro banner) ────
export function SentimentBadge({ na }: { na: NewsAnalysis | null }) {
  const { label, tone } = deriveSentiment(na);
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${t.bg} ${t.text} ${t.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.bar}`} />
      {label}
    </span>
  );
}

// ─── 7-day sentiment mini-chart (diverging bars around a midline) ────────────
function SentimentChart({ history }: { history: SentimentPoint[] }) {
  if (history.length < 2) {
    return (
      <p className="text-[11px] text-ink-3 leading-relaxed">
        Daily sentiment history builds here as you refresh news over the coming days.
      </p>
    );
  }
  return (
    <div className="flex items-stretch gap-1.5">
      {history.map(p => {
        const { tone } = sentimentFromScore(p.score);
        const h = Math.max(4, Math.round((Math.abs(p.score) / 100) * 26));
        const positive = p.score >= 0;
        return (
          <div key={p.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${p.label} (${p.score > 0 ? "+" : ""}${p.score})`}>
            <div className="w-full flex flex-col h-[57px]">
              <div className="flex-1 flex items-end justify-center">
                {positive && <div className={`w-2.5 rounded-t ${TONE[tone].bar}`} style={{ height: h }} />}
              </div>
              <div className="h-px bg-line-2 w-full" />
              <div className="flex-1 flex items-start justify-center">
                {!positive && <div className={`w-2.5 rounded-b ${TONE[tone].bar}`} style={{ height: h }} />}
              </div>
            </div>
            <span className="text-[9px] text-ink-3 num">{dayLabel(p.date)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sector impact arrow row ─────────────────────────────────────────────────
function SectorRow({ sec, onFilter }: { sec: NewsAnalysis["affectedSectors"][0]; onFilter: (name: string) => void }) {
  const tone: Tone = sec.impact === "POSITIVE" ? "up" : sec.impact === "NEGATIVE" ? "down" : "sky";
  const t = TONE[tone];
  const icon = sec.impact === "POSITIVE" ? "▲" : sec.impact === "NEGATIVE" ? "▼" : "–";
  return (
    <button
      onClick={() => onFilter(sec.sectorName)}
      className="group w-full flex items-start gap-2.5 py-2 text-left cursor-pointer"
      title={`Filter opportunities to ${sec.sectorName}`}
    >
      <span className={`${t.text} text-[13px] leading-5 shrink-0 w-3.5 text-center`}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className={`text-xs font-semibold ${t.text}`}>{sec.sectorName}</span>
        <span className="text-[11px] text-ink-2 leading-snug"> — {sec.reason}</span>
      </span>
      <span className="text-[10px] text-ink-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">Filter ›</span>
    </button>
  );
}

// ─── Headline feed row ───────────────────────────────────────────────────────
function FeedRow({ item, onOpenTicker }: { item: FeedItem; onOpenTicker: (t: string) => void }) {
  const isTicker = item.kind === "ticker";
  const Tag = isTicker ? "button" : "div";
  return (
    <Tag
      {...(isTicker ? { onClick: () => onOpenTicker(item.ticker!), title: `Open ${item.ticker}` } : {})}
      className={`w-full flex items-start gap-2.5 py-2.5 text-left ${isTicker ? "cursor-pointer group" : ""}`}
    >
      <span
        className={`shrink-0 mt-px text-[9px] font-semibold px-1.5 py-0.5 rounded num ${
          isTicker ? "bg-sky-dim text-sky-2" : "bg-raised text-ink-3"
        }`}
      >
        {isTicker ? item.ticker : "Macro"}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-xs leading-snug ${isTicker ? "text-ink group-hover:text-sky-2 transition-colors" : "text-ink"}`}>
          {item.head}
        </span>
        {item.desc && <span className="block text-[11px] text-ink-3 leading-snug mt-0.5 line-clamp-2">{item.desc}</span>}
        {(item.source || item.date) && (
          <span className="block text-[10px] text-ink-3 mt-1">
            {item.source}{item.source && item.date ? " · " : ""}{item.date}
          </span>
        )}
      </span>
      {isTicker && <span className="text-[10px] text-ink-3 shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">›</span>}
    </Tag>
  );
}

// ─── News page ────────────────────────────────────────────────────────────────
export default function NewsView({
  na, narrative, newsHeadlines, newsSources, signals, timestamp,
  sentimentHistory, filterTicker, onClearFilter, onOpenTicker, onFilterSector,
  hasKey, scanning, onRunScan, onRefreshNews, onAddWatch, watchingTickers,
}: {
  na: NewsAnalysis | null;
  narrative: string;
  newsHeadlines: string[];
  newsSources: string[];
  signals: AISignal[];
  timestamp?: string;
  sentimentHistory: SentimentPoint[];
  filterTicker: string | null;
  onClearFilter: () => void;
  onOpenTicker: (t: string) => void;
  onFilterSector: (name: string) => void;
  hasKey: boolean;
  scanning: boolean;
  onRunScan: () => void;
  onRefreshNews: () => void;
  onAddWatch: (ticker: string) => void;
  watchingTickers: Set<string>;
}) {
  // Merge per-ticker AI catalysts (actionable, shown first) with macro RSS headlines,
  // de-duplicating by headline prefix so a stock's catalyst wins over its macro echo.
  const feed = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    const seen = new Set<string>();
    const key = (s: string) => s.slice(0, 55).toLowerCase();

    for (const sig of signals) {
      const h = sig.newsHeadline;
      if (!h || h === "No recent news") continue;
      if (seen.has(key(h))) continue;
      seen.add(key(h));
      out.push({ kind: "ticker", ticker: sig.ticker, source: "AI catalyst", date: "", head: h, desc: "" });
    }
    for (const line of newsHeadlines) {
      const { source, date, head, desc } = parseHeadline(line);
      if (!head || seen.has(key(head))) continue;
      seen.add(key(head));
      out.push({ kind: "macro", source, date, head, desc });
    }
    return out;
  }, [signals, newsHeadlines]);

  // Cap the unfiltered feed at 7 rows (per-ticker catalysts first, macro fills the rest)
  const visibleFeed = filterTicker ? feed.filter(f => f.ticker === filterTicker) : feed.slice(0, 7);

  // No analysis yet → a scanning progress card or the run-a-scan prompt.
  // Market movers below stay live either way (they need no AI key).
  const statusCard = !na ? (
    scanning ? (
      <div className="card text-center py-10 px-5">
        <div className="flex justify-center gap-1.5 mb-4">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-2 h-2 rounded-full bg-up animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
          ))}
        </div>
        <div className="text-xs text-ink mb-1">Building today&rsquo;s briefing…</div>
        <div className="text-[11px] text-ink-3">Fetching RSS news and running AI analysis — usually 30–90 seconds.</div>
      </div>
    ) : (
      <div className="card text-center py-10 px-5">
        <div className="text-3xl mb-3">📰</div>
        <div className="text-sm font-medium text-ink mb-1.5">No briefing yet</div>
        <p className="text-xs text-ink-3 leading-relaxed max-w-md mx-auto">
          {hasKey
            ? "Run a full scan to generate today's market briefing, sector watch and latest headlines."
            : "Add an AI key in Settings, then run a scan to generate today's briefing. The news feed is built from the same free RSS sources the scanner reads."}
        </p>
        <button onClick={onRunScan} className="btn-accent mt-5 px-5 py-2 font-semibold">
          {hasKey ? "↗ Run Full Scan" : "⚙ Set API Key"}
        </button>
      </div>
    )
  ) : null;

  const updatedAt = timestamp
    ? new Date(timestamp).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-4">
      {/* filter banner when arriving from a card's catalyst strip */}
      {filterTicker && (
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <span>Showing news for</span>
          <span className="font-semibold text-sky-2">{filterTicker}</span>
          <button onClick={onClearFilter} className="btn text-[10px] px-2 py-0.5">Clear ✕</button>
        </div>
      )}

      {/* ── 1. Market movers — live pulse first, works without an AI key ── */}
      <MarketStrip variant="full" onAddWatch={onAddWatch} watchingTickers={watchingTickers} />

      {statusCard}

      {/* ── 2. Today's briefing ── */}
      {na && (
      <section className="card">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="label">Today&rsquo;s briefing</span>
          <div className="flex items-center gap-2">
            {updatedAt && <span className="text-[9px] text-ink-3 bg-raised px-2 py-px rounded-full num">updated {updatedAt}</span>}
            {hasKey && (
              <button onClick={onRefreshNews} disabled={scanning} className="btn text-[10px] px-2 py-0.5" title="Re-analyse today's news without re-scoring every stock">
                {scanning ? "⟳ Refreshing…" : "↻ Refresh"}
              </button>
            )}
            <SentimentBadge na={na} />
          </div>
        </div>

        {na?.summary && <p className="text-xs text-ink-2 leading-relaxed">{na.summary}</p>}
        {narrative && narrative !== na?.summary && (
          <p className="text-xs text-ink-2 leading-loose mt-2 pt-2.5 border-t border-line">{narrative}</p>
        )}

        {na && na.globalFactors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {na.globalFactors.map((f, i) => (
              <span key={i} className="text-[10px] text-sky-2 bg-sky-dim px-2 py-0.5 rounded-full">{f}</span>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-line">
          <div className="label mb-2">7-day sentiment</div>
          <SentimentChart history={sentimentHistory} />
        </div>
      </section>
      )}

      {/* ── 2. Sector watch ── */}
      {na && na.affectedSectors.length > 0 && (
        <section className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="label">Sector watch</span>
            <span className="text-[10px] text-ink-3">tap a sector to filter opportunities</span>
          </div>
          <div className="divide-y divide-line">
            {na.affectedSectors.map((sec, i) => (
              <SectorRow key={i} sec={sec} onFilter={onFilterSector} />
            ))}
          </div>
        </section>
      )}

      {/* ── 4. Latest headlines ── */}
      {na && (
      <section className="card">
        <div className="flex items-center justify-between mb-1">
          <span className="label">Latest headlines</span>
          {newsSources.length > 0 && (
            <span className="text-[10px] text-ink-3 truncate ml-2">{newsSources.join(" · ")}</span>
          )}
        </div>
        {visibleFeed.length > 0 ? (
          <div className="divide-y divide-line">
            {visibleFeed.map((item, i) => (
              <FeedRow key={i} item={item} onOpenTicker={onOpenTicker} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-3 py-3">
            {filterTicker
              ? `No recent catalyst headline for ${filterTicker}. `
              : "No headlines available right now. "}
            {filterTicker && <button onClick={onClearFilter} className="text-sky-2 cursor-pointer underline underline-offset-2">Show all</button>}
          </p>
        )}
        <div className="text-[10px] text-ink-3 pt-3 mt-1 border-t border-line">
          Headlines from public RSS feeds · sentiment is AI-derived · Not financial advice
        </div>
      </section>
      )}
    </div>
  );
}
