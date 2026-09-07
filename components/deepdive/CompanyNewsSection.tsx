import { Newspaper, ExternalLink } from "lucide-react";
import type { CompanyNewsResult } from "@/lib/company-news";
import { Section, Tag } from "./shared";

/** RSS pubDate -> "7 Sep 2026". Returns null on anything unparseable. */
function fmtDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Press mentions only.
 *
 * The empty state is the common case for most PSX names and is written to say
 * so plainly: the alternative — padding the section with macro headlines that
 * never name the company — would be the dishonest option.
 */
export default function CompanyNewsSection({ news, ticker }: { news: CompanyNewsResult; ticker: string }) {
  return (
    <Section
      icon={Newspaper}
      title="Company news"
      kicker="Articles from the monitored business feeds that name this company by ticker or by name."
      aside={<Tag title="Matched from general business RSS feeds — not PSX filings">Press mentions</Tag>}
    >
      {news.items.length === 0 ? (
        <div className="bg-inset border border-line rounded-lg px-4 py-5 text-center">
          <p className="text-[12px] text-ink-2">
            No company-specific mentions found in the monitored sources.
          </p>
          <p className="text-[10px] text-ink-3 mt-1.5 leading-relaxed max-w-md mx-auto">
            {news.scannedCount} recent business articles were searched for &ldquo;{ticker}&rdquo; and the company name. Most PSX companies are rarely named in the national business press — an empty result here is normal and does not mean nothing is happening.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {news.items.map((item, i) => {
            const date = fmtDate(item.pubDate);
            const body = (
              <>
                <div className="flex items-start gap-2">
                  <span className="text-[12px] text-ink leading-snug flex-1 min-w-0">{item.title}</span>
                  {item.link && <ExternalLink size={12} strokeWidth={2} className="text-ink-3 shrink-0 mt-0.5" aria-hidden />}
                </div>
                {item.description && (
                  <p className="text-[11px] text-ink-3 mt-1 leading-snug line-clamp-2">{item.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 text-[10px] text-ink-3">
                  <span>{item.source}</span>
                  {date && <><span aria-hidden>·</span><span className="num">{date}</span></>}
                  <span aria-hidden>·</span>
                  <span>Matched on {item.matchedOn === "ticker" ? "ticker" : "company name"}</span>
                </div>
              </>
            );
            return (
              <li key={i}>
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-card border border-line rounded-lg px-3.5 py-3 hover:border-line-2 transition-colors"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="bg-card border border-line rounded-lg px-3.5 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[10px] text-ink-3 mt-4 leading-relaxed border-t border-line pt-3">
        Sourced from Dawn, Geo, Profit, The News and ARY business feeds. Official PSX announcements — results dates, dividend declarations, board notices — are <strong className="text-ink-2 font-medium">not</strong> included: that portal renders its filings with JavaScript and exposes no public feed to read.
        {news.degraded && ` Feed status: ${news.degraded}.`}
      </p>
    </Section>
  );
}
