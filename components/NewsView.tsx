"use client";
import { useMemo } from "react";
import { Newspaper, ExternalLink, X, RefreshCw, Radar, Settings as SettingsIcon, Coins, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { AISignal, NewsAnalysis } from "@/lib/providers/types";
import type { NewsItem } from "@/lib/news-fetcher";
import MarketStrip from "./MarketStrip";
import { EmptyState } from "./ui/primitives";

/** Google News search fallback for rows without an article link. */
const googleNewsUrl = (q: string) =>
  `https://news.google.com/search?q=${encodeURIComponent(q)}`;

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
  link?: string; // article URL — rows fall back to a Google News search without it
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
  const Icon = sec.impact === "POSITIVE" ? TrendingUp : sec.impact === "NEGATIVE" ? TrendingDown : Minus;
  return (
    <button
      onClick={() => onFilter(sec.sectorName)}
      className="group w-full flex items-start gap-2.5 py-2 text-left cursor-pointer"
      title={`Filter opportunities to ${sec.sectorName}`}
    >
      <span className={`${t.text} shrink-0 w-3.5 pt-0.5 flex justify-center`}><Icon size={13} strokeWidth={2.25} aria-hidden /></span>
      <span className="flex-1 min-w-0">
        <span className={`text-xs font-semibold ${t.text}`}>{sec.sectorName}</span>
        <span className="text-[11px] text-ink-2 leading-snug"> — {sec.reason}</span>
      </span>
      <span className="text-[10px] text-ink-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">Filter ›</span>
    </button>
  );
}

// ─── Headline feed row ───────────────────────────────────────────────────────
// Macro rows open the article (or a Google News search) in a new tab.
// Ticker rows open the stock's card in-app, with a small ↗ for the news search.
function FeedRow({ item, onOpenTicker }: { item: FeedItem; onOpenTicker: (t: string) => void }) {
  const isTicker = item.kind === "ticker";

  const badge = (
    <span
      className={`shrink-0 mt-px text-[9px] font-semibold px-1.5 py-0.5 rounded num ${
        isTicker ? "bg-sky-dim text-sky-2" : "bg-raised text-ink-3"
      }`}
    >
      {isTicker ? item.ticker : "Macro"}
    </span>
  );

  const body = (
    <span className="flex-1 min-w-0">
      <span className="block text-xs leading-snug text-ink group-hover:text-sky-2 transition-colors">
        {item.head}
      </span>
      {item.desc && item.desc !== item.head && (
        <span className="block text-[11px] text-ink-3 leading-snug mt-0.5 line-clamp-2">{item.desc}</span>
      )}
      {(item.source || item.date) && (
        <span className="block text-[10px] text-ink-3 mt-1">
          {item.source}{item.source && item.date ? " · " : ""}{item.date}
        </span>
      )}
    </span>
  );

  if (isTicker) {
    return (
      <button
        onClick={() => onOpenTicker(item.ticker!)}
        title={`Open ${item.ticker}`}
        className="w-full flex items-start gap-2.5 py-2.5 text-left cursor-pointer group"
      >
        {badge}
        {body}
        <a
          href={item.link || googleNewsUrl(`${item.ticker} PSX ${item.head}`)}
          target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="Search this story online"
          aria-label="Search this story online"
          className="text-ink-3 hover:text-sky-2 shrink-0 self-center px-1"
        ><ExternalLink size={12} strokeWidth={2} /></a>
        <span className="text-[10px] text-ink-3 shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">›</span>
      </button>
    );
  }

  return (
    <a
      href={item.link || googleNewsUrl(item.head)}
      target="_blank" rel="noopener noreferrer"
      title={item.link ? "Open article" : "Search this story on Google News"}
      className="w-full flex items-start gap-2.5 py-2.5 text-left cursor-pointer group"
    >
      {badge}
      {body}
      <span className="text-ink-3 shrink-0 self-center opacity-60 group-hover:opacity-100 group-hover:text-sky-2 transition-opacity">
        <ExternalLink size={12} strokeWidth={2} />
      </span>
    </a>
  );
}

// ─── News page ────────────────────────────────────────────────────────────────
export default function NewsView({
  na, narrative, newsHeadlines, newsSources, signals, timestamp,
  sentimentHistory, filterTicker, onClearFilter, onOpenTicker, onFilterSector,
  hasKey, scanning, onRunScan, onRefreshNews, onAddWatch, watchingTickers,
  newsItems, dividendPayers,
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
  newsItems: NewsItem[];
  dividendPayers: { ticker: string; yieldPct: number }[];
}) {
  // Merge per-ticker AI catalysts (actionable, shown first) with macro headlines,
  // de-duplicating by headline prefix so a stock's catalyst wins over its macro echo.
  // Structured items (with article links) are preferred; the formatted-string
  // parse remains as a fallback for older cached scan responses.
  const feed = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    const seen = new Set<string>();
    const key = (s: string) => s.slice(0, 55).toLowerCase();

    // A catalyst headline copied verbatim from the news can be matched back to
    // its structured item to inherit the real article link.
    const linkFor = (head: string) =>
      newsItems.find(n => key(n.title) === key(head))?.link || "";

    for (const sig of signals) {
      const h = sig.newsHeadline;
      if (!h || h === "No recent news") continue;
      if (seen.has(key(h))) continue;
      seen.add(key(h));
      out.push({ kind: "ticker", ticker: sig.ticker, source: "AI catalyst", date: "", head: h, desc: "", link: linkFor(h) });
    }

    if (newsItems.length > 0) {
      for (const n of newsItems) {
        if (!n.title || seen.has(key(n.title))) continue;
        seen.add(key(n.title));
        let date = "";
        try { if (n.pubDate) date = new Date(n.pubDate).toLocaleDateString("en-PK", { month: "short", day: "numeric" }); } catch {}
        out.push({ kind: "macro", source: n.source, date, head: n.title, desc: n.description, link: n.link });
      }
    } else {
      for (const line of newsHeadlines) {
        const { source, date, head, desc } = parseHeadline(line);
        if (!head || seen.has(key(head))) continue;
        seen.add(key(head));
        out.push({ kind: "macro", source, date, head, desc });
      }
    }
    return out;
  }, [signals, newsHeadlines, newsItems]);

  // Cap the unfiltered feed at 7 rows (per-ticker catalysts first, macro fills the rest)
  const visibleFeed = filterTicker ? feed.filter(f => f.ticker === filterTicker) : feed.slice(0, 7);

  // No analysis yet → a scanning progress card or the run-a-scan prompt.
  // Market movers below stay live either way (they need no AI key).
  const statusCard = !na ? (
    scanning ? (
      <div className="card py-8 px-5 text-center">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-up-dim mb-4">
          <RefreshCw size={16} strokeWidth={2.25} className="text-up-2 animate-spin" aria-hidden />
        </div>
        <div className="text-xs text-ink mb-1">Building today&rsquo;s briefing…</div>
        <div className="text-[11px] text-ink-3">Fetching RSS news and running AI analysis — usually 30–90 seconds.</div>
      </div>
    ) : (
      <EmptyState
        icon={Newspaper}
        title="No briefing yet"
        description={hasKey
          ? "Run a full scan to generate today's market briefing, sector watch and latest headlines."
          : "Add an AI key in Settings, then run a scan to generate today's briefing. The news feed is built from the same free RSS sources the scanner reads."}
        action={hasKey
          ? { label: "Run Full Scan", icon: Radar, onClick: onRunScan }
          : { label: "Set API Key", icon: SettingsIcon, onClick: onRunScan }}
      />
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
          <button onClick={onClearFilter} className="btn text-[10px] px-2 py-0.5"><X size={11} strokeWidth={2.5} aria-hidden />Clear</button>
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
                <RefreshCw size={10} strokeWidth={2.25} className={scanning ? "animate-spin" : ""} aria-hidden />
                {scanning ? "Refreshing…" : "Refresh"}
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
        {/* Dividends — yields we already track + the official announcements page */}
        <div className="flex items-center gap-2 flex-wrap pt-3 mt-1 border-t border-line">
          <Coins size={12} strokeWidth={2} className="text-ink-3 shrink-0" aria-hidden />
          <span className="label shrink-0">Dividends</span>
          {dividendPayers.length > 0 ? (
            dividendPayers.map(d => (
              <button
                key={d.ticker}
                onClick={() => onOpenTicker(d.ticker)}
                title={`Open ${d.ticker}`}
                className="text-[10px] num bg-raised text-ink-2 hover:text-up-2 px-2 py-0.5 rounded-full cursor-pointer transition-colors"
              >
                {d.ticker} <span className="text-up-2">{d.yieldPct.toFixed(1)}%</span>
              </button>
            ))
          ) : (
            <span className="text-[10px] text-ink-3">yields appear as stocks are scanned</span>
          )}
          <a
            href="https://dps.psx.com.pk/announcements/companies"
            target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-sky-2 hover:underline underline-offset-2 ml-auto shrink-0"
          >
            All dividend & board announcements ↗
          </a>
        </div>

        <div className="text-[10px] text-ink-3 pt-3 mt-1 border-t border-line">
          Headlines from public RSS feeds · sentiment is AI-derived · dividend yields from latest reported fiscal year · Not financial advice
        </div>
      </section>
      )}
    </div>
  );
}
