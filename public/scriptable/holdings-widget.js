// PSX Holdings widget — the real layout. Loaded by the small loader script
// pasted into Scriptable (generated on /widget), so changes here reach the
// phone automatically. Exports one async function: run(SITE, KEY).

module.exports = async function run(SITE, KEY) {
const OPEN_URL = SITE + "/?tab=holdings";
const fam = config.widgetFamily || "medium";

const C = {
  bg1: new Color("#141419"), bg2: new Color("#0b0b0f"),
  text: new Color("#ececf1"), muted: new Color("#8a8a99"), faint: new Color("#5f5f6c"),
  up: new Color("#4ade80"), down: new Color("#f87171"), gold: new Color("#fbbf24"), line: new Color("#26262f"),
};

// ---- data (network, falling back to the last good copy) -------------------
async function load() {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.documentsDirectory(), "psx-holdings-cache.json");
  let error = null;
  try {
    const req = new Request(SITE + "/api/widget/holdings?t=" + Date.now());
    req.headers = { "x-sync-key": KEY };
    req.timeoutInterval = 25;
    const d = await req.loadJSON();
    const code = req.response && req.response.statusCode;
    if (code === 200 && d && d.totals) { fm.writeString(cache, JSON.stringify(d)); return { d, error: null }; }
    error = code === 404 ? "Sync key not found — set the widget up again from the website."
          : code === 400 ? "No sync key — copy the widget code from the website again."
          : (d && d.error) || "Couldn't load prices.";
  } catch { error = "Offline"; }
  const d = fm.fileExists(cache) ? JSON.parse(fm.readString(cache)) : null;
  return { d, error };
}

// ---- helpers --------------------------------------------------------------
function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e7) return (n / 1e6).toFixed(1) + "M";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString("en-US");
}
function signed(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + compact(Math.abs(n)); }
function pct(p) { return p === null || p === undefined ? "" : (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p).toFixed(2) + "%"; }
function tone(n) { return n > 0 ? C.up : n < 0 ? C.down : C.muted; }
function time(iso) {
  const f = new DateFormatter(); f.dateFormat = "h:mm a";
  return f.string(new Date(iso));
}
function txt(stack, s, size, color, weight, lines) {
  const t = stack.addText(s);
  t.font = weight === "bold" ? Font.boldSystemFont(size)
         : weight === "semibold" ? Font.semiboldSystemFont(size)
         : weight === "medium" ? Font.mediumSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  if (lines) t.lineLimit = lines;
  t.minimumScaleFactor = 0.7;
  return t;
}
function background(w) {
  const g = new LinearGradient();
  g.colors = [C.bg1, C.bg2]; g.locations = [0, 1];
  w.backgroundGradient = g;
}
function header(w, d) {
  const h = w.addStack(); h.centerAlignContent(); h.spacing = 4;
  const dot = h.addStack(); dot.size = new Size(6, 6); dot.cornerRadius = 3;
  dot.backgroundColor = d && d.market && d.market.open ? C.up : C.faint;
  txt(h, "PSX PORTFOLIO", 10, C.muted, "bold");
  h.addSpacer();
  if (d) txt(h, (d.market && d.market.open ? "" : "Closed · ") + time(d.asOf), 9, C.faint);
}
function footer(w, d, error) {
  w.addSpacer();
  const f = w.addStack();
  if (error) { txt(f, error, 9, C.gold, "regular", 2); return; }
  if (d && d.missing && d.missing.length) txt(f, "No price: " + d.missing.join(", "), 9, C.faint, "regular", 1);
}
function totals(stack, d, big) {
  const t = d.totals;
  txt(stack, "PKR " + compact(t.value), big ? 24 : 20, C.text, "bold", 1);
  stack.addSpacer(2);
  const day = stack.addStack(); day.spacing = 4; day.centerAlignContent();
  txt(day, signed(t.dayPnl), 13, tone(t.dayPnl), "semibold");
  txt(day, pct(t.dayPnlPct) + " today", 11, tone(t.dayPnl));
  stack.addSpacer(2);
  const all = stack.addStack(); all.spacing = 4; all.centerAlignContent();
  txt(all, signed(t.pnl), 11, tone(t.pnl), "medium");
  txt(all, pct(t.pnlPct) + " total", 10, C.muted);
}
function row(stack, h) {
  const r = stack.addStack(); r.centerAlignContent(); r.spacing = 6;
  r.url = SITE + "/stock/" + encodeURIComponent(h.ticker);
  const name = r.addStack(); name.size = new Size(62, 0);
  txt(name, h.ticker, 12, C.text, "semibold", 1);
  r.addSpacer();
  txt(r, pct(h.changePercent), 11, tone(h.changePercent), "medium");
  const v = r.addStack(); v.size = new Size(52, 0);
  v.addSpacer();
  txt(v, signed(h.pnl), 11, tone(h.pnl));
}

// ---- lock screen ----------------------------------------------------------
function accessory(d, error) {
  const w = new ListWidget();
  w.url = OPEN_URL;
  if (!d) { txt(w, error || "PSX", 11, Color.white()); return w; }
  const t = d.totals;
  if (fam === "accessoryInline") {
    txt(w, "PSX " + signed(t.dayPnl) + " (" + pct(t.dayPnlPct) + ")", 12, Color.white());
  } else if (fam === "accessoryCircular") {
    w.addSpacer();
    const s = w.addStack(); s.addSpacer(); txt(s, "PSX", 9, Color.white(), "semibold"); s.addSpacer();
    const p = w.addStack(); p.addSpacer(); txt(p, pct(t.dayPnlPct).replace("%", ""), 12, Color.white(), "bold"); p.addSpacer();
    w.addSpacer();
  } else {
    txt(w, "PSX · " + compact(t.value), 12, Color.white(), "semibold");
    txt(w, signed(t.dayPnl) + "  " + pct(t.dayPnlPct) + " today", 12, Color.white());
    txt(w, (d.market.open ? "" : "Closed · ") + time(d.asOf), 10, Color.white());
  }
  return w;
}

// ---- home screen ----------------------------------------------------------
function build(d, error) {
  if (fam.startsWith("accessory")) return accessory(d, error);
  const w = new ListWidget();
  background(w);
  w.url = OPEN_URL;
  w.setPadding(14, 14, 12, 14);
  header(w, d);
  w.addSpacer(8);
  if (!d) { txt(w, error || "No data yet", 12, C.muted, "regular", 3); return w; }
  if (!d.holdings.length) {
    txt(w, "No holdings yet — add them on the website.", 12, C.muted, "regular", 3);
    footer(w, d, error); return w;
  }
  if (fam === "small") {
    totals(w, d, false);
  } else {
    const body = w.addStack(); body.spacing = 14; body.topAlignContent();
    const left = body.addStack(); left.layoutVertically();
    totals(left, d, fam !== "medium");
    const right = body.addStack(); right.layoutVertically(); right.spacing = 5;
    const n = fam === "medium" ? 4 : 10;
    d.holdings.slice(0, n).forEach((h) => row(right, h));
    if (d.holdings.length > n) txt(right, "+" + (d.holdings.length - n) + " more", 9, C.faint);
  }
  footer(w, d, error);
  return w;
}

const { d, error } = await load();
const w = build(d, error);
// Ask iOS to come back sooner while the market is open; it may stretch this.
const mins = d && d.market && d.market.open ? 15 : 60;
w.refreshAfterDate = new Date(Date.now() + mins * 60 * 1000);

if (config.runsInWidget) Script.setWidget(w);
else if (fam === "small") await w.presentSmall();
else if (fam === "large") await w.presentLarge();
else await w.presentMedium();
};
