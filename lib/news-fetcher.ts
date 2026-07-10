/**
 * Free RSS news fetcher for Pakistan market news.
 *
 * Sources (all free, no API key required):
 *  - Dawn Business
 *  - Geo News Business
 *  - Profit Pakistan (Pakistan Today)
 *  - The News Business
 *  - ARY News (fallback)
 *
 * Returns a plain-text block of headlines + brief descriptions
 * suitable for pasting directly into an AI prompt.
 */

const RSS_FEEDS: { name: string; url: string }[] = [
  {
    name: "Dawn Business",
    url: "https://www.dawn.com/feeds/business",
  },
  {
    name: "Geo Business",
    url: "https://www.geo.tv/rss/1/business",
  },
  {
    name: "Profit Pakistan",
    url: "https://profit.pakistantoday.com.pk/feed/",
  },
  {
    name: "The News Business",
    url: "https://www.thenews.com.pk/rss/2/business",
  },
  {
    // Business category only — the general /feed/ mixes in sports & showbiz
    name: "ARY News",
    url: "https://arynews.tv/category/business/feed/",
  },
];

export interface NewsItem {
  title: string;
  description: string;
  pubDate: string;
  source: string;
  link: string; // article URL from the RSS <link> tag ("" when the feed omits it)
}

/** Fetch and parse a single RSS feed with a 6-second timeout. */
async function fetchFeed(
  url: string,
  sourceName: string,
  maxItems = 12
): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PSX-Dashboard/1.0 RSS-Reader",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return [];

    const xml = await res.text();
    return parseRSS(xml, sourceName, maxItems);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Finance-relevance filter — strips military, sports, entertainment and other
 * non-market content before it reaches the AI.
 *
 * Matching is whole-word (regex \b) on CLEANED text: plain substring matching
 * let "Bellingham powers England" through via "power", "World Cup quarters"
 * via "quarter", and "prices" via "rice".  A blocklist catches sports/showbiz
 * items; those survive only when a strong market term is also present
 * (e.g. an article about World Cup broadcast rights and PSX-listed media).
 */
const FINANCE_KEYWORDS = [
  "stock", "stocks", "market", "markets", "psx", "kse", "kse-100", "rupee", "pkr", "sbp", "secp",
  "bank", "banks", "banking", "finance", "financial", "economy", "economic",
  "inflation", "interest rate", "policy rate", "oil", "gas", "lng", "rlng", "energy", "power",
  "textile", "cement", "fertilizer", "fertiliser", "tax", "taxes", "budget", "trade", "tariff", "tariffs",
  "import", "imports", "export", "exports", "dollar", "investment", "investor", "investors", "corporate",
  "earnings", "profit", "profits", "loss", "losses", "revenue", "dividend", "turnover",
  "ipo", "shares", "equity", "equities", "bond", "bonds", "treasury", "sukuk",
  "gdp", "fiscal", "monetary", "currency", "devaluation", "exchange rate", "remittance", "remittances",
  "petroleum", "petrol", "diesel", "electricity", "coal", "mining", "refinery", "gold", "bullion",
  "agriculture", "wheat", "sugar", "cotton", "rice", "crop", "crops",
  "company", "companies", "industry", "industries", "sector", "sectors",
  "business", "enterprise", "commercial", "bourse", "imf", "world bank", "moody", "fitch",
  "quarterly", "annual results", "privatisation", "privatization", "bitcoin", "crypto",
  "ogdc", "ppl", "pso", "engro", "luck", "mebl", "hbl", "ubl", "mcb",
];

// Clearly non-market topics. An item mentioning these needs a STRONG market
// term to stay (weak ones like "power"/"gold" are too easy to hit by accident).
const NOISE_KEYWORDS = [
  "world cup", "cricket", "football", "soccer", "hockey", "tennis", "olympics",
  "psl", "t20", "odi", "wicket", "innings", "stadium", "tournament", "match",
  "showbiz", "bollywood", "hollywood", "drama", "film", "movie", "actor", "actress",
  "celebrity", "singer", "concert", "viral", "simpsons", "tiktoker", "instagram",
];

const STRONG_FINANCE = [
  "psx", "kse", "kse-100", "stock market", "stocks", "rupee", "sbp", "secp", "imf",
  "inflation", "gdp", "fiscal", "monetary", "bourse", "equities", "dividend", "ipo",
];

const wordRe = (kw: string) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
const FINANCE_RES = FINANCE_KEYWORDS.map(wordRe);
const NOISE_RES = NOISE_KEYWORDS.map(wordRe);
const STRONG_RES = STRONG_FINANCE.map(wordRe);

function isFinanceRelevant(title: string, description: string): boolean {
  const text = title + " " + description;
  if (NOISE_RES.some((re) => re.test(text))) {
    return STRONG_RES.some((re) => re.test(text));
  }
  return FINANCE_RES.some((re) => re.test(text));
}

/** Minimal RSS XML parser — handles both CDATA and plain text fields. */
function parseRSS(xml: string, source: string, max: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && items.length < max) {
    const block = m[1];
    const rawTitle = getTag(block, "title");
    if (!rawTitle || rawTitle.length < 4) continue;

    // Clean BEFORE filtering — raw descriptions are full of HTML boilerplate
    // (links, related-article text) that false-matched finance keywords.
    const title = cleanText(rawTitle);
    let description = cleanText(getTag(block, "description")).slice(0, 200);
    if (description === title || title.startsWith(description)) description = "";
    if (/^https?:\/\/\S*$/.test(description)) description = ""; // some feeds ship only a link

    if (!isFinanceRelevant(title, description)) continue;

    const pubDate = getTag(block, "pubDate");
    const rawLink = getTag(block, "link").trim();
    const link = /^https?:\/\/\S+$/.test(rawLink) ? rawLink : "";

    items.push({ title, description, pubDate, source, link });
  }

  return items;
}

function getTag(xml: string, tag: string): string {
  // Matches both <tag>text</tag> and <tag><![CDATA[text]]></tag>
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
    "i"
  );
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function cleanText(raw: string): string {
  // Decode entities FIRST, then strip tags. The old order stripped tags before
  // decoding, so feeds that ship escaped HTML (&lt;p&gt;…) decoded into literal
  // <p>/<a href…> tags that leaked into the UI. Strip in a loop so nested
  // escaping (&amp;lt;) can't smuggle a tag through either.
  let s = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
  let prev = "";
  while (prev !== s) { prev = s; s = s.replace(/<[^>]*>/g, ""); }
  return s
    .replace(/&#?\w+;/g, "")        // remaining HTML entities
    .replace(/\s+/g, " ")
    .trim();
}

export interface StructuredNews {
  text: string;      // formatted block for the AI prompt
  items: NewsItem[]; // deduped, newest-first — for the News page (with links)
}

/**
 * Fetch all RSS feeds in parallel, merge results, de-duplicate, and return
 * both the AI-ready text block and the structured items behind it.
 *
 * Never throws — returns a fallback message on total failure.
 */
export async function fetchPakistanNewsStructured(): Promise<StructuredNews> {
  const settled = await Promise.allSettled(
    RSS_FEEDS.map((f) => fetchFeed(f.url, f.name))
  );

  const all: NewsItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  if (all.length === 0) {
    return {
      text: "No news available from RSS feeds right now. Analyze based on general Pakistan market context.",
      items: [],
    };
  }

  // Sort newest-first where we have a parse-able date
  all.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });

  // De-duplicate by title (simple prefix match)
  const seen = new Set<string>();
  const unique: NewsItem[] = [];
  for (const item of all) {
    const key = item.title.slice(0, 60).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // Format for AI prompt (cap at 40 items to stay within token budget)
  const lines = unique.slice(0, 40).map((item) => {
    let date = "";
    if (item.pubDate) {
      try {
        date = ` · ${new Date(item.pubDate).toLocaleDateString("en-PK", {
          month: "short",
          day: "numeric",
        })}`;
      } catch {
        // ignore invalid date
      }
    }
    const desc = item.description ? ` — ${item.description}` : "";
    return `[${item.source}${date}] ${item.title}${desc}`;
  });

  return { text: lines.join("\n"), items: unique.slice(0, 40) };
}

/** Back-compat wrapper — just the AI text block. */
export async function fetchPakistanNews(): Promise<string> {
  return (await fetchPakistanNewsStructured()).text;
}
