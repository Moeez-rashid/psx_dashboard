"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Settings, { loadSettings, defaultSettings, type UserSettings } from "./Settings";
import type { AISignal, NewsAnalysis } from "@/lib/providers/types";
import type { StockQuote } from "@/lib/psx";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";
import { isPKTOpen, pktNow } from "@/lib/format";
import { resolveSectorName } from "@/lib/sectors";
import { Modal, ModalHeader, ErrorBanner, ConfirmDelete, Skeleton } from "./ui/primitives";
import { toast, Toaster } from "./ui/Toast";
import TickerInput from "./ui/TickerInput";
import MarketStrip from "./MarketStrip";
import MetricsGuide from "./MetricsGuide";
import { StockRow, StockDetailBody, MiniBar, type SignalDetail } from "./StockRow";
import HoldingsOverview, { type Holding } from "./HoldingsOverview";
import { techCatalysts, techRisks, volLabel, type StockTech } from "./StockBits";

// ─── Local types ────────────────────────────────────────────────────────────
interface WatchItem { ticker: string; name: string; }
const DEFAULT_HOLDINGS: Holding[] = [];

// ─── PKT clock ──────────────────────────────────────────────────────────────
function PKTClock() {
  const [t, setT] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const tick = () => {
      setT(pktNow().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }));
      setOpen(isPKTOpen());
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 text-xs text-ink-2">
      <span className={`w-2 h-2 rounded-full ${open ? "bg-up animate-pulse" : "bg-ink-3"}`} />
      <span className="num">KSE-100 · {t} PKT · {open ? "Open" : "Closed"}</span>
    </div>
  );
}

/** Synthesise the AI sector/factor data into flowing prose for the expanded view. */
function buildExpandedNarrative(analysis: NewsAnalysis): string {
  const parts: string[] = [];
  const neg = analysis.affectedSectors.filter(s => s.impact === "NEGATIVE");
  const pos = analysis.affectedSectors.filter(s => s.impact === "POSITIVE");

  if (neg.length === 1) {
    parts.push(`The ${neg[0].sectorName} sector is under notable pressure — ${neg[0].reason.replace(/\.$/, "").toLowerCase()}.`);
  } else if (neg.length > 1) {
    const list = neg.map(s => `${s.sectorName} (${s.reason.replace(/\.$/, "").toLowerCase()})`).join("; ");
    parts.push(`Several sectors are facing headwinds: ${list}.`);
  }
  if (pos.length === 1) {
    parts.push(`Meanwhile, the ${pos[0].sectorName} sector is positioned to benefit — ${pos[0].reason.replace(/\.$/, "").toLowerCase()}.`);
  } else if (pos.length > 1) {
    const list = pos.map(s => `${s.sectorName} (${s.reason.replace(/\.$/, "").toLowerCase()})`).join("; ");
    parts.push(`Sectors with a positive outlook include ${list}.`);
  }
  if (analysis.globalFactors.length > 0) {
    parts.push(`On the global front, ${analysis.globalFactors.join(", ")} are key factors shaping the broader market backdrop.`);
  }
  if (parts.length === 0) {
    parts.push("No specific sector catalysts were identified from today's news. Market conditions appear broadly neutral based on available data.");
  }
  return parts.join(" ");
}

// ─── Sector impact line ─────────────────────────────────────────────────────
function SectorImpact({ sec }: { sec: NewsAnalysis["affectedSectors"][0] }) {
  const tone = sec.impact === "POSITIVE" ? "text-up-2" : sec.impact === "NEGATIVE" ? "text-down-2" : "text-ink-2";
  const icon = sec.impact === "POSITIVE" ? "▲" : sec.impact === "NEGATIVE" ? "▼" : "–";
  return <div className={`text-[11px] leading-relaxed ${tone}`}>{icon} {sec.sectorName}: {sec.reason}</div>;
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard() {
  // Persistence — state starts empty and loads from localStorage after mount,
  // so the server-rendered HTML always matches the first client render (no hydration mismatch).
  const [holdings, setHoldings] = useState<Holding[]>(DEFAULT_HOLDINGS);
  const [watching, setWatching] = useState<WatchItem[]>([]);
  const storageLoadedRef = useRef(false);
  useEffect(() => { if (storageLoadedRef.current) localStorage.setItem("psx_holdings", JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { if (storageLoadedRef.current) localStorage.setItem("psx_watch", JSON.stringify(watching)); }, [watching]);

  // Prices
  const [prices, setPrices] = useState<Record<string, StockQuote>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const scanTickersRef = useRef<string[]>([]);

  // Scanner
  const [scanResult, setScanResult] = useState<{
    signals: AISignal[];
    newsAnalysis: NewsAnalysis | null;
    expandedSectors: string[];
    totalScanned: number;
    passedTechnicals: number;
    timestamp: string;
    technicalData: StockTech[];
    newsHeadlines: string[];
    newsSources: string[];
    newsFromCache: boolean;
  } | null>(null);
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanPhase, setScanPhase] = useState("");

  // Watchlist AI + technicals
  const [watchSignals, setWatchSignals] = useState<Record<string, AISignal>>({});
  const [runningWatchAI, setRunningWatchAI] = useState(false);
  const [watchAIError, setWatchAIError] = useState("");
  const [watchTech, setWatchTech] = useState<Record<string, StockTech>>({});
  const [holdingTech, setHoldingTech] = useState<Record<string, StockTech>>({});
  const [loadingWatchTech, setLoadingWatchTech] = useState(false);

  // AskAnalyst fundamentals — null = attempted but no data; undefined = never tried
  const [askAnalystData, setAskAnalystData] = useState<Record<string, AskAnalystFundamentals | null>>({});

  // Sparklines (30d EOD closes per ticker)
  const [sparks, setSparks] = useState<Record<string, number[]>>({});

  // Sort
  const [sortOpps, setSortOpps] = useState<"confidence" | "name">("confidence");
  const [sortWatch, setSortWatch] = useState<"confidence" | "name">("confidence");

  // Settings + modals — also loaded post-mount (see persistence note above)
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showMetricsGuide, setShowMetricsGuide] = useState(false);
  // Inline row expansion — keys are prefixed per tab ("opp:MEBL", "hold:MEBL", "watch:MEBL")
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = (key: string, ticker: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
    if (askAnalystData[ticker] === undefined) fetchAskAnalystBatch([ticker]);
  };

  // Resolve a display sector for a ticker (for the collapsed row subtitle).
  const sectorOf = (ticker: string): string | undefined => {
    const raw = prices[ticker]?.sector ?? askAnalystData[ticker]?.sector ?? "";
    return raw ? resolveSectorName(raw) : undefined;
  };

  // UI state
  const [tab, setTab] = useState<"opportunities" | "holdings" | "watching">("opportunities");
  const [newHolding, setNewHolding] = useState({ ticker: "", shares: "", avg: "" });
  const [newWatch, setNewWatch] = useState("");
  const [holdingError, setHoldingError] = useState("");
  const [watchError, setWatchError] = useState("");
  const [addingHolding, setAddingHolding] = useState(false);
  const [addingWatch, setAddingWatch] = useState(false);
  const [editingHolding, setEditingHolding] = useState<{ ticker: string; shares: string; avg: string } | null>(null);
  const [pendingDeleteHolding, setPendingDeleteHolding] = useState<string | null>(null);
  const [pendingDeleteWatch, setPendingDeleteWatch] = useState<string | null>(null);

  // ── Price fetching ────────────────────────────────────────────────────────
  const allTickers = [...new Set([
    ...holdings.map(h => h.ticker),
    ...watching.map(w => w.ticker),
    ...scanTickersRef.current,
  ])];

  const fetchPrices = useCallback(async () => {
    if (!allTickers.length) return;
    setLoadingPrices(true);
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: allTickers }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrices(prev => ({ ...prev, ...data }));
        setServerOnline(true);
        setLastUpdated(pktNow().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) + " PKT");
      } else {
        setServerOnline(false);
      }
    } catch { setServerOnline(false); }
    setLoadingPrices(false);
  }, [allTickers.join(",")]); // eslint-disable-line

  useEffect(() => { fetchPrices(); }, [fetchPrices]); // eslint-disable-line
  useEffect(() => { const id = setInterval(fetchPrices, 60000); return () => clearInterval(id); }, []); // eslint-disable-line

  // ── Sparkline fetching (lazy, batched, only missing tickers) ──────────────
  useEffect(() => {
    const want = allTickers.filter(t => !(t in sparks));
    if (!want.length) return;
    fetch(`/api/sparklines?symbols=${want.join(",")}`)
      .then(r => (r.ok ? r.json() : {}))
      .then((d: Record<string, number[]>) => {
        if (Object.keys(d).length) setSparks(prev => ({ ...prev, ...d }));
      })
      .catch(() => {});
  }, [allTickers.join(","), scanResult?.timestamp]); // eslint-disable-line

  // ── Full scanner ──────────────────────────────────────────────────────────
  const runFullScan = async () => {
    if (!settings.apiKey) { setShowSettings(true); return; }
    setScanning(true); setScanError(""); setScanPhase("Searching for latest Pakistan & global news…");
    try {
      setScanPhase("Pass 1 · Analysing macro conditions & identifying sectors…");
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: settings.provider, apiKey: settings.apiKey, model: settings.model, mode: "full" }),
      });
      const data = await res.json();
      if (!res.ok) {
        const raw = data.error ?? "Scan failed";
        if (raw.includes("quota") || raw.includes("429") || raw.includes("Too Many Requests"))
          throw new Error("API quota exceeded. Add billing to your AI provider account, or switch providers in Settings.");
        if (raw.includes("401") || raw.includes("403") || raw.includes("invalid") || raw.includes("API key"))
          throw new Error("Invalid API key. Double-check it in Settings — make sure you copied the full key.");
        throw new Error(raw.length > 200 ? raw.slice(0, 200) + "…" : raw);
      }
      setScanPhase("Pass 2 · Scoring technicals & selecting best picks…");
      const newSignals: AISignal[] = data.signals ?? [];
      scanTickersRef.current = newSignals.map((s: AISignal) => s.ticker);
      if (data.fundamentals && Object.keys(data.fundamentals).length > 0) {
        setAskAnalystData(prev => ({ ...prev, ...data.fundamentals }));
      }
      setScanResult({
        signals: newSignals,
        newsAnalysis: data.newsAnalysis ?? null,
        expandedSectors: data.expandedSectors ?? [],
        totalScanned: data.totalScanned ?? 0,
        passedTechnicals: data.passedTechnicals ?? 0,
        timestamp: data.timestamp,
        technicalData: data.technicalData ?? [],
        newsHeadlines: data.newsHeadlines ?? [],
        newsSources: data.newsSources ?? [],
        newsFromCache: data.newsFromCache ?? false,
      });
      toast(`Scan complete — ${newSignals.length} signal${newSignals.length === 1 ? "" : "s"} found`);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Unknown error");
    }
    setScanning(false); setScanPhase("");
  };

  const runNewsRefresh = async () => {
    if (!settings.apiKey) { setShowSettings(true); return; }
    setScanning(true); setScanError(""); setScanPhase("Refreshing news only…");
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: settings.provider, apiKey: settings.apiKey, model: settings.model }),
      });
      const news = await res.json();
      if (!res.ok) throw new Error(news.error ?? "News refresh failed");
      setScanResult(prev => prev ? {
        ...prev,
        newsAnalysis: news.newsAnalysis ?? news,
        newsHeadlines: news.newsHeadlines ?? prev.newsHeadlines,
        newsSources: news.newsSources ?? prev.newsSources,
        newsFromCache: news.newsFromCache ?? false,
      } : null);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Unknown error");
    }
    setScanning(false); setScanPhase("");
  };

  // KMI-30 list for Shariah auto-detection (client-side)
  const KMI30 = new Set([
    "MEBL","HBL","UBL","MCB","BAHL",
    "OGDC","PPL","PSO","MARI","POL",
    "LUCK","MLCF","CHCC","DGKC","PIOC",
    "ENGRO","EFERT","FFC","FATIMA","NRL",
    "HUBC","KAPCO","KEL","NCPL","PKGP",
    "SYS","TRG","AVN","COLG","EPCL",
  ]);

  /** Validate ticker exists on PSX by calling the prices API. */
  async function validateTicker(symbol: string): Promise<{ valid: boolean; quote?: StockQuote }> {
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [symbol] }),
      });
      if (!res.ok) return { valid: false };
      const data: Record<string, StockQuote> = await res.json();
      const quote = data[symbol];
      return quote ? { valid: true, quote } : { valid: false };
    } catch {
      return { valid: false };
    }
  }

  // ── Holdings helpers ──────────────────────────────────────────────────────
  const addHolding = async () => {
    const t = newHolding.ticker.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
    const shares = parseFloat(newHolding.shares);
    const avg = parseFloat(newHolding.avg);
    if (!t) { setHoldingError("Enter a ticker symbol (e.g. OGDC)."); return; }
    if (!shares || shares <= 0) { setHoldingError("Enter a valid number of shares."); return; }
    if (!avg || avg <= 0) { setHoldingError("Enter a valid average purchase price."); return; }
    setHoldingError("");
    setAddingHolding(true);
    const { valid, quote } = await validateTicker(t);
    setAddingHolding(false);
    if (!valid) {
      setHoldingError(`"${t}" not found on PSX. Check the ticker symbol and try again.`);
      return;
    }
    const isShariah = KMI30.has(t);
    if (quote) setPrices(prev => ({ ...prev, [t]: quote }));
    setHoldings(prev => [...prev.filter(h => h.ticker !== t), {
      ticker: t,
      name: quote?.sector ? `${t} · ${resolveSectorName(quote.sector)}` : t,
      shares,
      avgPrice: avg,
      shariah: isShariah,
    }]);
    setNewHolding({ ticker: "", shares: "", avg: "" });
    toast(`${t} added to holdings`);
    fetchAskAnalystBatch([t]);
    fetch(`/api/technicals?symbol=${t}`)
      .then(r => r.ok ? r.json() : null)
      .then(tech => { if (tech) setHoldingTech(prev => ({ ...prev, [t]: tech })); })
      .catch(() => {});
  };

  const addWatch = async () => {
    const t = newWatch.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
    if (!t) return;
    if (watching.find(w => w.ticker === t)) { setNewWatch(""); return; }
    setWatchError("");
    setAddingWatch(true);
    const { valid, quote } = await validateTicker(t);
    setAddingWatch(false);
    if (!valid) {
      setWatchError(`"${t}" not found on PSX. Check the ticker symbol.`);
      return;
    }
    if (quote) setPrices(prev => ({ ...prev, [t]: quote }));
    setWatching(prev => [...prev, {
      ticker: t,
      name: quote?.sector ? `${t} · ${resolveSectorName(quote.sector)}` : t,
    }]);
    setNewWatch("");
    toast(`${t} added to watchlist`);
    fetchSingleWatchTech(t);
    fetchAskAnalystBatch([t]);
  };

  // ── Quick-add from scan results / market strip ────────────────────────────
  const quickAddWatch = (ticker: string) => {
    if (!watching.find(w => w.ticker === ticker)) {
      setWatching(prev => [...prev, { ticker, name: ticker }]);
      toast(`${ticker} added to watchlist`);
      if (!watchTech[ticker]) fetchSingleWatchTech(ticker);
      fetchAskAnalystBatch([ticker]);
    }
  };

  // ── Fetch technicals for a single ticker (fire-and-forget) ────────────────
  const fetchSingleWatchTech = async (ticker: string) => {
    try {
      const res = await fetch(`/api/technicals?symbol=${ticker}`);
      if (res.ok) {
        const tech = await res.json();
        setWatchTech(prev => ({ ...prev, [ticker]: tech }));
      }
    } catch { /* ignore */ }
  };

  // ── Fetch AskAnalyst fundamentals for one or many tickers ─────────────────
  const fetchAskAnalystBatch = async (tickers: string[]) => {
    if (!tickers.length) return;
    const fresh = tickers.filter(t => askAnalystData[t] === undefined);
    if (!fresh.length) return;
    const markFailed = () => setAskAnalystData(prev => {
      const u: Record<string, null> = {};
      fresh.forEach(t => { u[t] = null; });
      return { ...prev, ...u };
    });
    try {
      const res = await fetch(`/api/askanalyst?symbol=${fresh.join(",")}`);
      if (!res.ok) { markFailed(); return; }
      const data = await res.json();
      if (fresh.length === 1) {
        setAskAnalystData(prev => ({ ...prev, [fresh[0]]: data ?? null }));
      } else {
        setAskAnalystData(prev => {
          const u: Record<string, AskAnalystFundamentals | null> = {};
          fresh.forEach(t => { u[t] = (data && data[t]) ? data[t] : null; });
          return { ...prev, ...u };
        });
      }
    } catch { markFailed(); }
  };

  // ── Fetch technicals for all watchlist tickers ────────────────────────────
  const fetchWatchTech = async () => {
    if (!watching.length) return;
    setLoadingWatchTech(true);
    const results: Record<string, StockTech> = {};
    await Promise.allSettled(
      watching.map(async (w) => {
        try {
          const res = await fetch(`/api/technicals?symbol=${w.ticker}`);
          if (res.ok) results[w.ticker] = await res.json();
        } catch { /* ignore */ }
      })
    );
    setWatchTech(prev => ({ ...prev, ...results }));
    setLoadingWatchTech(false);
    fetchAskAnalystBatch(watching.map(w => w.ticker));
  };

  // ── Fetch technicals for all holdings ─────────────────────────────────────
  const fetchHoldingTech = useCallback(async () => {
    if (!holdings.length) return;
    const results: Record<string, StockTech> = {};
    await Promise.allSettled(
      holdings.map(async (h) => {
        try {
          const res = await fetch(`/api/technicals?symbol=${h.ticker}`);
          if (res.ok) results[h.ticker] = await res.json();
        } catch { /* ignore */ }
      })
    );
    setHoldingTech(prev => ({ ...prev, ...results }));
  }, [holdings]); // eslint-disable-line

  // Fundamentals for scan tickers when a new scan lands
  useEffect(() => {
    if (!scanResult?.signals.length) return;
    fetchAskAnalystBatch(scanResult.signals.map(s => s.ticker));
  }, [scanResult?.timestamp]); // eslint-disable-line

  // First mount: restore saved holdings/watchlist/settings, then prime fundamentals
  useEffect(() => {
    let h: Holding[] = [], w: WatchItem[] = [];
    try { h = JSON.parse(localStorage.getItem("psx_holdings") ?? "null") ?? DEFAULT_HOLDINGS; } catch {}
    try { w = JSON.parse(localStorage.getItem("psx_watch") ?? "null") ?? []; } catch {}
    if (h.length) setHoldings(h);
    if (w.length) setWatching(w);
    setSettings(loadSettings());
    storageLoadedRef.current = true;
    const all = [...new Set([...w.map(x => x.ticker), ...h.map(x => x.ticker)])];
    if (all.length > 0) fetchAskAnalystBatch(all);
  }, []); // eslint-disable-line — intentional one-time load

  // Auto-fetch tech + fundamentals when tab changes
  const prevTabRef = useRef<string>("");
  useEffect(() => {
    if (tab === "holdings" && prevTabRef.current !== "holdings") {
      fetchHoldingTech();
      fetchAskAnalystBatch(holdings.map(h => h.ticker));
    }
    if (tab === "watching" && prevTabRef.current !== "watching") {
      fetchAskAnalystBatch(watching.map(w => w.ticker));
    }
    prevTabRef.current = tab;
  }, [tab]); // eslint-disable-line

  // Auto-load watchlist technicals once when tickers exist but no tech yet
  useEffect(() => {
    const missing = watching.filter(w => !watchTech[w.ticker]);
    if (missing.length > 0 && !loadingWatchTech) {
      missing.forEach(w => fetchSingleWatchTech(w.ticker));
    }
  }, [watching.map(w => w.ticker).join(",")]); // eslint-disable-line

  // ── Watchlist AI analysis ─────────────────────────────────────────────────
  const runWatchlistAI = async () => {
    if (!watching.length) { return; }
    if (!settings.apiKey) { setShowSettings(true); return; }
    setRunningWatchAI(true); setWatchAIError("");
    try {
      const res = await fetch("/api/watchscan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: watching.map(w => w.ticker),
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const raw = data.error ?? "Watchlist AI scan failed";
        if (raw.includes("quota") || raw.includes("429")) throw new Error("API quota exceeded — check your provider.");
        if (raw.includes("401") || raw.includes("403") || raw.includes("API key")) throw new Error("Invalid API key — check Settings.");
        throw new Error(raw.length > 200 ? raw.slice(0, 200) + "…" : raw);
      }
      const newSigs: Record<string, AISignal> = {};
      for (const sig of (data.signals ?? [])) newSigs[sig.ticker] = sig;
      setWatchSignals(prev => ({ ...prev, ...newSigs }));
      const newTech: Record<string, StockTech> = {};
      for (const t of (data.technicalData ?? [])) newTech[t.symbol] = t;
      setWatchTech(prev => ({ ...prev, ...newTech }));
      toast("Watchlist AI analysis complete");
    } catch (e) {
      setWatchAIError(e instanceof Error ? e.message : "AI analysis failed");
    } finally {
      setRunningWatchAI(false);
    }
  };

  // ── Export snapshot for Claude ────────────────────────────────────────────
  const exportForClaude = () => {
    const lines: string[] = [];
    const now = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" });
    lines.push(`=== PSX SCANNER SNAPSHOT — ${now} PKT ===`);
    lines.push(`Market: KSE-100 · ${isPKTOpen() ? "OPEN" : "CLOSED"}\n`);

    if (scanResult?.newsAnalysis) {
      const na = scanResult.newsAnalysis;
      lines.push("── MACRO CONTEXT ──────────────────────────────");
      lines.push(na.summary);
      if (na.affectedSectors.length > 0) {
        lines.push("\nSector Impact:");
        na.affectedSectors.forEach(s => {
          const icon = s.impact === "POSITIVE" ? "▲" : s.impact === "NEGATIVE" ? "▼" : "–";
          lines.push(`  ${icon} ${s.sectorName}: ${s.reason}`);
        });
      }
      if (na.globalFactors.length > 0)
        lines.push(`\nGlobal Factors: ${na.globalFactors.join(" · ")}`);
      lines.push(`\nScan time: ${new Date(scanResult.timestamp).toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" })} PKT · ${scanResult.totalScanned} stocks scanned · ${scanResult.passedTechnicals} passed technicals`);
    }

    type TickerEntry = {
      name: string;
      shariah: boolean;
      inHoldings: boolean;
      inSignals: boolean;
      inWatching: boolean;
      holding?: Holding;
      signal?: AISignal;
    };
    const tickerMap = new Map<string, TickerEntry>();

    holdings.forEach(h => {
      tickerMap.set(h.ticker, { name: h.name, shariah: !!h.shariah, inHoldings: true, inSignals: false, inWatching: false, holding: h });
    });
    scanResult?.signals.forEach(sig => {
      const ex = tickerMap.get(sig.ticker);
      if (ex) { ex.inSignals = true; ex.signal = sig; }
      else tickerMap.set(sig.ticker, { name: sig.ticker, shariah: false, inHoldings: false, inSignals: true, inWatching: false, signal: sig });
    });
    watching.forEach(w => {
      const ex = tickerMap.get(w.ticker);
      if (ex) { ex.inWatching = true; if (!ex.name || ex.name === w.ticker) ex.name = w.name; }
      else tickerMap.set(w.ticker, { name: w.name, shariah: false, inHoldings: false, inSignals: false, inWatching: true });
    });

    const sorted = [...tickerMap.entries()].sort(([, a], [, b]) => {
      const s = (e: TickerEntry) => (e.inHoldings ? 4 : 0) + (e.inSignals ? 2 : 0) + (e.inWatching ? 1 : 0);
      return s(b) - s(a);
    });

    if (sorted.length > 0) {
      lines.push("\n── STOCKS ──────────────────────────────────────");
      sorted.forEach(([ticker, e], i) => {
        const tags: string[] = [];
        if (e.inHoldings) tags.push("HOLDING");
        if (e.inSignals) tags.push("BUY SIGNAL");
        if (e.inWatching) tags.push("WATCHING");
        lines.push(`\n${i + 1}. ${ticker}${e.shariah ? " [KMI-30]" : ""} [${tags.join(" · ")}] — ${e.name}`);

        const live = prices[ticker];
        if (live) lines.push(`   Price: PKR ${live.currentPrice.toFixed(2)}  (${live.changePercent >= 0 ? "+" : ""}${live.changePercent.toFixed(2)}% today)`);

        if (e.holding) {
          const h = e.holding;
          const lp = live?.currentPrice ?? h.avgPrice;
          const cost = h.avgPrice * h.shares;
          const mv = lp * h.shares;
          const pnl = mv - cost;
          const pct = cost > 0 ? (pnl / cost) * 100 : 0;
          lines.push(`   Holding: ${h.shares.toLocaleString()} shares @ PKR ${h.avgPrice.toFixed(2)} avg cost`);
          lines.push(`   P&L: ${pnl >= 0 ? "+" : ""}PKR ${Math.round(pnl).toLocaleString()}  (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
        }

        const sig = e.signal ?? watchSignals[ticker] ?? scanResult?.signals.find(s => s.ticker === ticker);
        if (sig) {
          lines.push(`   Signal: ${sig.signal} (${sig.confidence}% confidence) — ${sig.reason}`);
          if (sig.suggestedEntry) lines.push(`   Entry: ${sig.suggestedEntry}`);
          if (sig.newsHeadline && sig.newsHeadline !== "No recent news") lines.push(`   News: ${sig.newsHeadline}`);
          if (sig.catalysts?.length) lines.push(`   Catalysts: ${sig.catalysts.join("; ")}`);
          if (sig.risks?.length) lines.push(`   Risks: ${sig.risks.join("; ")}`);
        }

        const tech = holdingTech[ticker] ?? watchTech[ticker] ?? scanResult?.technicalData?.find(t => t.symbol === ticker);
        if (tech) {
          const parts = [`RSI ${tech.rsi.toFixed(0)}`, `EMA20 ${tech.ema20.toFixed(2)}`, `Vol ${volLabel(tech, prices[ticker]?.volume)}`, `Score ${tech.compositeScore}/100 [${tech.technicalSignal}]`];
          lines.push(`   Technicals: ${parts.join(" | ")}`);
        }

        const fund = askAnalystData[ticker];
        if (fund) {
          const fp: string[] = [];
          const lp = live?.currentPrice;
          const pe = fund.pe ?? (fund.eps && fund.eps > 0 && lp ? lp / fund.eps : null);
          if (pe !== null && pe > 0) fp.push(`PE ${pe.toFixed(1)}x`);
          if (fund.pbv !== null) fp.push(`PBV ${fund.pbv.toFixed(1)}x`);
          if (fund.roe !== null) fp.push(`ROE ${fund.roe.toFixed(0)}%`);
          if (fund.debtToEquity !== null) fp.push(`D/E ${fund.debtToEquity.toFixed(2)}`);
          if (fund.dividendYield !== null && fund.dividendYield > 0) fp.push(`Div ${fund.dividendYield.toFixed(1)}%`);
          if (fp.length) lines.push(`   Fundamentals${fund.fiscalYear ? ` (FY${fund.fiscalYear})` : ""}: ${fp.join(" | ")}`);
        }
      });
    }

    if (holdings.length > 0) {
      let totalCost = 0, totalVal = 0;
      holdings.forEach(h => {
        totalCost += h.avgPrice * h.shares;
        totalVal += (prices[h.ticker]?.currentPrice ?? h.avgPrice) * h.shares;
      });
      const tPnl = totalVal - totalCost;
      const tPct = totalCost > 0 ? (tPnl / totalCost) * 100 : 0;
      lines.push(`\n── PORTFOLIO SUMMARY ───────────────────────────`);
      lines.push(`Value: PKR ${Math.round(totalVal).toLocaleString()} | Invested: PKR ${Math.round(totalCost).toLocaleString()} | P&L: ${tPnl >= 0 ? "+" : ""}PKR ${Math.round(tPnl).toLocaleString()} (${tPct >= 0 ? "+" : ""}${tPct.toFixed(2)}%)`);
    }

    lines.push("\n────────────────────────────────────────────────");
    lines.push(`Data sources: PSX live prices · AskAnalyst.com.pk fundamentals · AI by ${settings.provider}`);
    lines.push("Not financial advice — for reference and analysis only.");

    const text = lines.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      toast("Snapshot copied — paste it into any Claude chat");
    }).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast("Snapshot copied — paste it into any Claude chat");
    });
  };

  // ── Sort helpers ──────────────────────────────────────────────────────────
  const sortedOpps = (sigs: AISignal[]) => {
    const arr = [...sigs];
    if (sortOpps === "name") return arr.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return arr; // scanner already sorted by confidence desc
  };

  const sortedWatch = (items: WatchItem[]) => {
    const arr = [...items];
    if (sortWatch === "name") return arr.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return arr.sort((a, b) => {
      const sigA = scanResult?.signals.find(s => s.ticker === a.ticker) ?? watchSignals[a.ticker];
      const sigB = scanResult?.signals.find(s => s.ticker === b.ticker) ?? watchSignals[b.ticker];
      const confA = sigA ? sigA.confidence : (watchTech[a.ticker]?.compositeScore ?? -1);
      const confB = sigB ? sigB.confidence : (watchTech[b.ticker]?.compositeScore ?? -1);
      return confB - confA;
    });
  };

  // ── Holding suggestion from scan data or P&L ──────────────────────────────
  const getHoldingSuggestion = (ticker: string, pnlPct: number | null) => {
    const aiSig = scanResult?.signals.find(s => s.ticker === ticker);
    if (aiSig) return { signal: aiSig.signal, text: aiSig.reason, source: "AI scan" };
    const tech = holdingTech[ticker] ?? watchTech[ticker];
    if (tech) return { signal: tech.technicalSignal, text: tech.reasons[0] ?? "Based on technicals", source: "Technicals" };
    if (pnlPct !== null) {
      if (pnlPct >= 20) return { signal: "HOLD", text: "Up 20%+ — consider booking partial profits", source: "P&L" };
      if (pnlPct >= 5)  return { signal: "HOLD", text: "In profit — hold and monitor for continuation", source: "P&L" };
      if (pnlPct >= -8) return { signal: "HOLD", text: "Near cost — hold and watch for a move", source: "P&L" };
      return { signal: "WATCH", text: "Down significantly — run a scan for full AI analysis", source: "P&L" };
    }
    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const hasKey = !!settings.apiKey;
  const watchingSet = new Set(watching.map(w => w.ticker));
  const na = scanResult?.newsAnalysis;

  const TABS = [
    { id: "opportunities" as const, label: "Buy Opportunities", short: "Signals", count: scanResult?.signals.length },
    { id: "holdings" as const, label: "My Holdings", short: "Holdings", count: holdings.length || undefined },
    { id: "watching" as const, label: "Watchlist", short: "Watchlist", count: watching.length || undefined },
  ];

  return (
    <div className="min-h-screen flex flex-col text-[13px]">

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 bg-surface/85 backdrop-blur-md border-b border-line">
        <div className="max-w-5xl mx-auto px-4 h-13 flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="rounded-md">
                <rect width="24" height="24" rx="6" fill="var(--color-up-dim)" />
                <polyline points="4,16 9,11 13,14 20,7" fill="none" stroke="var(--color-up-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="15,7 20,7 20,12" fill="none" stroke="var(--color-up-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-sm font-bold tracking-tight">PSX Scanner</span>
            </div>
            {serverOnline === false && (
              <span className="text-[10px] text-down-2 bg-down-dim border border-down/40 px-2 py-0.5 rounded-full">offline</span>
            )}
            {loadingPrices && <span className="hidden sm:inline text-[10px] text-ink-3 animate-pulse">refreshing…</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:block mr-2"><PKTClock /></div>
            <button onClick={fetchPrices} className="btn px-2.5" title="Refresh prices">↻</button>
            <button onClick={exportForClaude} className="btn-sky px-2.5" title="Copy full snapshot for Claude">
              ⎘<span className="hidden sm:inline">Export</span>
            </button>
            <button onClick={() => setShowMetricsGuide(true)} className="btn px-2.5 hidden sm:inline-flex" title="Metrics guide">
              ?<span className="hidden sm:inline">Guide</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className={`btn px-2.5 ${hasKey ? "border-up/50 text-up-2" : "border-gold/50 text-gold-2"}`}
              title="Settings"
            >
              ⚙<span className="hidden sm:inline">{hasKey ? settings.provider : "Set API Key"}</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <nav className="max-w-5xl mx-auto px-4 flex">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3.5 py-2.5 text-xs font-medium transition-colors cursor-pointer
                ${tab === t.id ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
            >
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
              {t.count !== undefined && (
                <span className={`ml-1.5 text-[9px] px-1.5 py-px rounded-full num ${tab === t.id ? "bg-up-dim text-up-2" : "bg-raised text-ink-3"}`}>
                  {t.count}
                </span>
              )}
              {tab === t.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-up rounded-full" />}
            </button>
          ))}
        </nav>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5">

        {/* ════ BUY OPPORTUNITIES ════ */}
        {tab === "opportunities" && (
          <div>
            {/* Live market overview — zero-setup value */}
            <MarketStrip onAddWatch={quickAddWatch} watchingTickers={watchingSet} />

            {/* Scanner controls */}
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              <button onClick={runFullScan} disabled={scanning} className="btn-accent font-semibold px-4 py-2">
                {scanning ? "⟳ Scanning…" : scanResult ? "↻ Re-run Full Scan" : "↗ Full Scan · KMI-30 + News"}
              </button>
              {scanResult?.newsAnalysis && (
                <button onClick={runNewsRefresh} disabled={scanning} className="btn py-2" title="Re-analyse today's news without re-scoring every stock">
                  Refresh news only
                </button>
              )}
              {scanResult && (
                <span className="text-[10px] text-ink-3">
                  Last scan {new Date(scanResult.timestamp).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })} PKT
                  · {scanResult.totalScanned} scanned · {scanResult.passedTechnicals} passed technicals
                  {scanResult.expandedSectors.length > 0 && ` · expanded: ${scanResult.expandedSectors.join(", ")}`}
                </span>
              )}
            </div>

            <ErrorBanner msg={scanError} onDismiss={() => setScanError("")} />

            {/* Macro context panel */}
            {na && !scanning && (
              <div className="card mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="label">Macro Context · Today</span>
                  {scanResult!.newsFromCache && (
                    <span className="text-[9px] text-ink-3 bg-raised px-2 py-px rounded-full">✓ cached</span>
                  )}
                </div>
                <p className="text-xs text-ink-2 leading-relaxed mb-2">{na.summary}</p>
                {na.affectedSectors.length > 0 && (
                  <div className="mb-2 space-y-0.5 hidden sm:block">
                    {na.affectedSectors.map((sec, i) => <SectorImpact key={i} sec={sec} />)}
                  </div>
                )}
                {na.affectedSectors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2 sm:hidden">
                    {na.affectedSectors.map((sec, i) => (
                      <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full bg-raised ${sec.impact === "POSITIVE" ? "text-up-2" : sec.impact === "NEGATIVE" ? "text-down-2" : "text-ink-2"}`}>
                        {sec.impact === "POSITIVE" ? "▲" : sec.impact === "NEGATIVE" ? "▼" : "–"} {sec.sectorName}
                      </span>
                    ))}
                  </div>
                )}
                {na.globalFactors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {na.globalFactors.map((f, i) => (
                      <span key={i} className="text-[10px] text-sky-2 bg-sky-dim px-2 py-0.5 rounded-full">{f}</span>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <button onClick={() => setShowNewsModal(true)} className="btn text-[10px] px-2.5 py-1">Read full analysis</button>
                </div>
              </div>
            )}

            {/* News detail modal */}
            {showNewsModal && na && (
              <Modal onClose={() => setShowNewsModal(false)} maxWidth="max-w-xl">
                <ModalHeader title="Macro Context · Today" onClose={() => setShowNewsModal(false)} />
                <p className="text-xs text-ink-2 leading-relaxed mb-3">{na.summary}</p>
                {na.affectedSectors.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {na.affectedSectors.map((sec, i) => <SectorImpact key={i} sec={sec} />)}
                  </div>
                )}
                {na.globalFactors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {na.globalFactors.map((f, i) => (
                      <span key={i} className="text-[10px] text-sky-2 bg-sky-dim px-2 py-0.5 rounded-full">{f}</span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-ink-2 leading-loose pt-3 border-t border-line">
                  {na.detailedNarrative ?? buildExpandedNarrative(na)}
                </p>
                {scanResult!.newsSources.length > 0 && (
                  <div className="text-[10px] text-ink-3 mt-3">Sources: {scanResult!.newsSources.join(" · ")}</div>
                )}
              </Modal>
            )}

            {/* Empty state */}
            {!scanResult && !scanning && (
              <div className="card text-center py-10 px-5">
                <div className="text-3xl mb-3">📡</div>
                <div className="text-sm font-medium text-ink mb-1.5">
                  {hasKey ? "Ready to scan KMI-30 + Shariah stocks" : "AI scanner — bring your own key"}
                </div>
                <p className="text-xs text-ink-3 leading-relaxed max-w-md mx-auto">
                  {hasKey
                    ? "The scanner fetches live prices, computes RSI/EMA/volume for all KMI-30 stocks, expands into news-relevant sectors, and returns the best 1–8 setups."
                    : "Add a free Groq key (or Claude / Gemini / OpenAI) in Settings to unlock AI buy signals with news catalysts, entries and risks. The live market data above works without any key."}
                </p>
                <button onClick={hasKey ? runFullScan : () => setShowSettings(true)} className="btn-accent mt-5 px-5 py-2 font-semibold">
                  {hasKey ? "↗ Run First Scan" : "⚙ Set API Key"}
                </button>
              </div>
            )}

            {/* Scanning state */}
            {scanning && (
              <div className="card py-8 px-5 text-center">
                <div className="flex justify-center gap-1.5 mb-4">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-2 h-2 rounded-full bg-up animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                  ))}
                </div>
                <div className="text-xs text-ink mb-1">{scanPhase || "Scanning…"}</div>
                <div className="text-[11px] text-ink-3">
                  Takes 30–90 seconds — fetching RSS news, computing technicals for 30+ stocks, then running AI analysis.
                </div>
                <div className="max-w-sm mx-auto mt-5 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5 mx-auto" />
                  <Skeleton className="h-3 w-3/5 mx-auto" />
                </div>
              </div>
            )}

            {/* Sort */}
            {scanResult && scanResult.signals.length > 1 && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-ink-3">Sort</span>
                {(["confidence", "name"] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setSortOpps(opt)}
                    className={`btn text-[10px] px-2.5 py-1 ${sortOpps === opt ? "bg-raised text-ink border-line-2" : ""}`}
                  >
                    {opt === "confidence" ? "AI Confidence" : "Name A–Z"}
                  </button>
                ))}
              </div>
            )}

            {/* Signal rows — collapsed by default, expand inline */}
            <div className="space-y-2">
              {scanResult && sortedOpps(scanResult.signals).map((sig) => {
                const sigTech = scanResult.technicalData?.find(t => t.symbol === sig.ticker);
                const liveQuote = prices[sig.ticker];
                const displayPrice = liveQuote?.currentPrice ?? sigTech?.currentPrice;
                const displayChange = liveQuote?.changePercent;
                const key = `opp:${sig.ticker}`;
                const detail: SignalDetail = {
                  ticker: sig.ticker, signal: sig.signal, confidence: sig.confidence, reason: sig.reason,
                  newsHeadline: sig.newsHeadline, catalysts: sig.catalysts, risks: sig.risks,
                  suggestedEntry: sig.suggestedEntry, tech: sigTech, fundamentals: askAnalystData[sig.ticker],
                  currentPrice: displayPrice, changePercent: displayChange, spark: sparks[sig.ticker],
                };
                return (
                  <StockRow
                    key={sig.ticker}
                    signal={sig.signal}
                    ticker={sig.ticker}
                    subtitle={sectorOf(sig.ticker)}
                    meta={<MiniBar pct={sig.confidence} signal={sig.signal} label="AI confidence" />}
                    spark={sparks[sig.ticker]}
                    price={displayPrice}
                    change={displayChange}
                    open={expanded.has(key)}
                    onToggle={() => toggleRow(key, sig.ticker)}
                    actions={
                      watchingSet.has(sig.ticker)
                        ? <span className="text-gold-2 text-[15px] leading-none" title="On watchlist">★</span>
                        : <button onClick={() => quickAddWatch(sig.ticker)} className="text-ink-3 hover:text-gold-2 text-[15px] leading-none cursor-pointer" title="Add to watchlist" aria-label="Add to watchlist">☆</button>
                    }
                  >
                    <StockDetailBody detail={detail} />
                  </StockRow>
                );
              })}
            </div>

            <p className="text-[10px] text-ink-3 text-center py-5 leading-relaxed">
              ⚠ Not financial advice. Signals are AI-generated for informational purposes only.<br />
              Always do your own research. Past signals do not guarantee future returns.
            </p>
          </div>
        )}

        {/* ════ HOLDINGS ════ */}
        {tab === "holdings" && (
          <div>
            <HoldingsOverview holdings={holdings} prices={prices} />

            {holdings.length === 0 && (
              <div className="card text-center py-10 px-5 mb-4">
                <div className="text-3xl mb-3">💼</div>
                <div className="text-sm font-medium text-ink mb-1.5">Track your PSX portfolio</div>
                <p className="text-xs text-ink-3 leading-relaxed max-w-md mx-auto">
                  Add your holdings below to see live P&L, allocation, sector exposure, technicals and AI advice.
                  Everything is stored in your browser only — nothing leaves your device.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {holdings.map(h => {
                const p = prices[h.ticker];
                const livePrice = p?.currentPrice;
                const cost = h.avgPrice * h.shares;
                const marketVal = livePrice ? livePrice * h.shares : null;
                const pnl = marketVal ? marketVal - cost : null;
                const pnlPct = pnl ? (pnl / cost) * 100 : null;
                const tech = holdingTech[h.ticker];
                const isEditing = editingHolding?.ticker === h.ticker;
                const key = `hold:${h.ticker}`;
                const s = getHoldingSuggestion(h.ticker, pnlPct);
                const aiSig = scanResult?.signals.find(sig => sig.ticker === h.ticker);
                const detail: SignalDetail = {
                  ticker: h.ticker,
                  signal: s?.signal ?? tech?.technicalSignal,
                  confidence: aiSig?.confidence ?? tech?.compositeScore,
                  reason: s ? `${s.text}${s.source ? `  ·  via ${s.source}` : ""}` : undefined,
                  newsHeadline: aiSig?.newsHeadline,
                  catalysts: aiSig?.catalysts?.length ? aiSig.catalysts : (tech ? techCatalysts(tech) : []),
                  risks: aiSig?.risks?.length ? aiSig.risks : (tech ? techRisks(tech) : []),
                  suggestedEntry: aiSig?.suggestedEntry, tech,
                  fundamentals: askAnalystData[h.ticker],
                  currentPrice: livePrice ?? undefined, changePercent: p?.changePercent, spark: sparks[h.ticker],
                };
                return (
                  <StockRow
                    key={h.ticker}
                    signal={tech?.technicalSignal}
                    ticker={
                      <span className="inline-flex items-center gap-1.5">
                        {h.ticker}
                        {h.shariah && <span className="text-[8px] font-medium text-up-2 bg-up-dim border border-up/40 px-1 py-px rounded">Shariah</span>}
                      </span>
                    }
                    subtitle={sectorOf(h.ticker) ?? (h.name.includes(" · ") ? h.name.split(" · ").slice(1).join(" · ") : undefined)}
                    meta={pnlPct !== null
                      ? <span className={`text-[12px] font-medium num ${pnlPct >= 0 ? "text-up-2" : "text-down-2"}`}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}% <span className="text-ink-3 font-normal">P&L</span></span>
                      : <span className="text-[10px] text-ink-3">—</span>}
                    spark={sparks[h.ticker]}
                    price={livePrice}
                    change={p?.changePercent}
                    open={expanded.has(key)}
                    onToggle={() => toggleRow(key, h.ticker)}
                    actions={
                      <>
                        <button
                          onClick={() => { setEditingHolding({ ticker: h.ticker, shares: String(h.shares), avg: String(h.avgPrice) }); setExpanded(prev => new Set(prev).add(key)); }}
                          className="text-ink-3 hover:text-ink text-xs cursor-pointer" title="Edit shares / avg price" aria-label="Edit holding"
                        >✎</button>
                        <ConfirmDelete
                          pending={pendingDeleteHolding === h.ticker}
                          onArm={() => setPendingDeleteHolding(h.ticker)}
                          onConfirm={() => { setHoldings(prev => prev.filter(x => x.ticker !== h.ticker)); setPendingDeleteHolding(null); toast(`${h.ticker} removed`); }}
                          onCancel={() => setPendingDeleteHolding(null)}
                        />
                      </>
                    }
                  >
                    {isEditing ? (
                      <div className="bg-inset rounded-lg p-3 mt-3">
                        <div className="text-[10px] text-ink-3 mb-2">Edit {h.ticker}</div>
                        <div className="flex gap-2.5 items-end flex-wrap">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wide text-ink-3">Shares</span>
                            <input
                              className="input w-24" type="text" inputMode="decimal"
                              value={editingHolding!.shares}
                              onChange={e => setEditingHolding(prev => prev ? { ...prev, shares: e.target.value.replace(/[^0-9.]/g, "") } : null)}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wide text-ink-3">Avg Price (PKR)</span>
                            <input
                              className="input w-28" type="text" inputMode="decimal"
                              value={editingHolding!.avg}
                              onChange={e => setEditingHolding(prev => prev ? { ...prev, avg: e.target.value.replace(/[^0-9.]/g, "") } : null)}
                            />
                          </div>
                          <button
                            onClick={() => {
                              const newShares = parseFloat(editingHolding!.shares);
                              const newAvg = parseFloat(editingHolding!.avg);
                              if (!newShares || newShares <= 0 || !newAvg || newAvg <= 0) return;
                              setHoldings(prev => prev.map(x =>
                                x.ticker === h.ticker ? { ...x, shares: newShares, avgPrice: newAvg } : x
                              ));
                              setEditingHolding(null);
                              toast(`${h.ticker} updated`);
                            }}
                            className="btn-accent px-4"
                          >Save</button>
                          <button onClick={() => setEditingHolding(null)} className="btn">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-3">
                        {([
                          ["Shares", h.shares.toLocaleString(), "text-ink"],
                          ["Avg cost", `PKR ${h.avgPrice.toFixed(2)}`, "text-ink"],
                          ["Cost basis", `PKR ${Math.round(cost).toLocaleString()}`, "text-ink"],
                          ["Market value", marketVal ? `PKR ${Math.round(marketVal).toLocaleString()}` : "—", "text-ink"],
                          ["P&L", pnl !== null ? `${pnl >= 0 ? "+" : ""}PKR ${Math.round(pnl).toLocaleString()}` : "—", pnl !== null ? (pnl >= 0 ? "text-up-2" : "text-down-2") : "text-ink"],
                          ["P&L %", pnlPct !== null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%` : "—", pnlPct !== null ? (pnlPct >= 0 ? "text-up-2" : "text-down-2") : "text-ink"],
                        ] as [string, string, string][]).map(([label, val, tone], i) => (
                          <div key={i} className="bg-inset rounded-lg px-2.5 py-1.5">
                            <div className="text-[9px] uppercase tracking-wide text-ink-3 mb-0.5">{label}</div>
                            <div className={`text-[11px] sm:text-xs font-medium num ${tone}`}>{val}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <StockDetailBody detail={detail} />
                  </StockRow>
                );
              })}
            </div>

            <ErrorBanner msg={holdingError} onDismiss={() => setHoldingError("")} />

            {/* Add holding */}
            <div className="card mt-3 py-3">
              <div className="label mb-2">Add holding</div>
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <TickerInput
                  className="w-full sm:w-44"
                  value={newHolding.ticker}
                  onChange={v => setNewHolding(p => ({ ...p, ticker: v }))}
                  placeholder="Ticker"
                />
                <input
                  className="input flex-1 sm:w-28 sm:flex-none" placeholder="Shares" type="text" inputMode="decimal"
                  value={newHolding.shares}
                  onChange={e => setNewHolding(p => ({ ...p, shares: e.target.value.replace(/[^0-9.]/g, "") }))}
                />
                <input
                  className="input flex-1 sm:w-28 sm:flex-none" placeholder="Avg PKR" type="text" inputMode="decimal"
                  value={newHolding.avg}
                  onChange={e => setNewHolding(p => ({ ...p, avg: e.target.value.replace(/[^0-9.]/g, "") }))}
                  onKeyDown={e => e.key === "Enter" && addHolding()}
                />
                <button onClick={addHolding} disabled={addingHolding} className="btn-accent px-5">
                  {addingHolding ? "…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ WATCHLIST ════ */}
        {tab === "watching" && (
          <div>
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <span className="label">Watchlist · KMI-30 / Shariah tickers</span>
              {watching.length > 0 && (
                <div className="flex gap-2 items-center">
                  <button
                    onClick={async () => { await fetchWatchTech(); fetchPrices(); }}
                    disabled={loadingWatchTech || runningWatchAI}
                    className="btn text-[10px] px-2.5 py-1"
                    title="Refresh technicals and prices for all watchlist tickers"
                  >
                    {loadingWatchTech ? "↻ Refreshing…" : "↻ Refresh"}
                  </button>
                  <button
                    onClick={runWatchlistAI}
                    disabled={runningWatchAI || loadingWatchTech || !settings.apiKey}
                    className="btn-accent text-[10px] px-2.5 py-1"
                    title={!settings.apiKey ? "Set your API key in Settings first" : "Run AI analysis on your watchlist"}
                  >
                    {runningWatchAI ? "⟳ Analysing…" : "✦ AI Analysis"}
                  </button>
                </div>
              )}
            </div>

            {watching.length > 1 && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-ink-3">Sort</span>
                {(["confidence", "name"] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setSortWatch(opt)}
                    className={`btn text-[10px] px-2.5 py-1 ${sortWatch === opt ? "bg-raised text-ink border-line-2" : ""}`}
                  >
                    {opt === "confidence" ? "AI Confidence ↓" : "Name A–Z"}
                  </button>
                ))}
              </div>
            )}

            <ErrorBanner msg={watchAIError} onDismiss={() => setWatchAIError("")} />

            {watching.length === 0 && (
              <div className="card text-center py-10 px-5 mb-3">
                <div className="text-3xl mb-3">👁</div>
                <div className="text-sm font-medium text-ink mb-1.5">Nothing on your radar yet</div>
                <p className="text-xs text-ink-3 leading-relaxed max-w-md mx-auto">
                  Add tickers below, or tap ＋ next to any mover in the Buy Opportunities market overview.
                  Watchlisted stocks get live prices, 30-day charts, technicals and optional AI analysis.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {sortedWatch(watching).map(w => {
                const p = prices[w.ticker];
                const sig = watchSignals[w.ticker];
                const tech = watchTech[w.ticker];
                const scanSig = scanResult?.signals.find(s => s.ticker === w.ticker);
                const activeSig = scanSig ?? sig;

                const displayReason = activeSig ? activeSig.reason : tech ? (tech.reasons[0] ?? "Technical analysis") : null;
                const displayCats = activeSig?.catalysts?.length ? activeSig.catalysts : tech ? techCatalysts(tech) : [];
                const displayRisks = activeSig?.risks?.length ? activeSig.risks : tech ? techRisks(tech) : [];
                const displayConfPct = activeSig ? activeSig.confidence : tech ? tech.compositeScore : null;
                const displaySignal = activeSig ? activeSig.signal : tech ? tech.technicalSignal : null;
                const confLabel = activeSig ? "AI confidence" : "Technical score";
                const key = `watch:${w.ticker}`;
                const detail: SignalDetail = {
                  ticker: w.ticker, signal: displaySignal ?? undefined, confidence: displayConfPct ?? undefined,
                  reason: displayReason ?? undefined, newsHeadline: activeSig?.newsHeadline,
                  catalysts: displayCats, risks: displayRisks, suggestedEntry: activeSig?.suggestedEntry,
                  tech, fundamentals: askAnalystData[w.ticker],
                  currentPrice: p?.currentPrice, changePercent: p?.changePercent, spark: sparks[w.ticker],
                };

                return (
                  <StockRow
                    key={w.ticker}
                    signal={displaySignal ?? undefined}
                    ticker={w.ticker}
                    subtitle={sectorOf(w.ticker)}
                    meta={displayConfPct !== null
                      ? <MiniBar pct={displayConfPct} signal={displaySignal ?? undefined} label={confLabel} />
                      : <span className="text-[10px] text-ink-3 italic">no signal yet</span>}
                    spark={sparks[w.ticker]}
                    price={p?.currentPrice}
                    change={p?.changePercent}
                    open={expanded.has(key)}
                    onToggle={() => toggleRow(key, w.ticker)}
                    actions={
                      <ConfirmDelete
                        pending={pendingDeleteWatch === w.ticker}
                        onArm={() => setPendingDeleteWatch(w.ticker)}
                        onConfirm={() => { setWatching(prev => prev.filter(x => x.ticker !== w.ticker)); setPendingDeleteWatch(null); toast(`${w.ticker} removed`); }}
                        onCancel={() => setPendingDeleteWatch(null)}
                      />
                    }
                  >
                    <StockDetailBody detail={detail} />
                    {!tech && !activeSig && (
                      <div className="flex items-center gap-2 text-[10px] text-ink-3 mt-1">
                        <Skeleton className="w-3 h-3 rounded-full" />
                        Loading technicals… use “↻ Refresh” to retry or “✦ AI Analysis” for full signals.
                      </div>
                    )}
                  </StockRow>
                );
              })}
            </div>

            <ErrorBanner msg={watchError} onDismiss={() => setWatchError("")} />

            {/* Add to watchlist */}
            <div className="card mt-3 py-3">
              <div className="label mb-2">Add ticker</div>
              <div className="flex gap-2">
                <TickerInput
                  className="flex-1 sm:max-w-60"
                  value={newWatch}
                  onChange={setNewWatch}
                  onSubmit={addWatch}
                  placeholder="e.g. PPL"
                />
                <button onClick={addWatch} disabled={addingWatch} className="btn-accent px-5">
                  {addingWatch ? "…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex justify-between items-center text-[10px] text-ink-3">
          <span>{lastUpdated ? `Prices updated ${lastUpdated}` : "Connecting to PSX…"}</span>
          <span className="md:hidden"><PKTClock /></span>
          <span className="hidden md:inline">PSX Scanner · Data from dps.psx.com.pk · Not financial advice</span>
        </div>
      </footer>

      <Settings open={showSettings} onClose={() => setShowSettings(false)} onSave={s => { setSettings(s); setShowSettings(false); }} />
      <MetricsGuide open={showMetricsGuide} onClose={() => setShowMetricsGuide(false)} />
      <Toaster />
    </div>
  );
}
