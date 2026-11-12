// PSX Holdings widget — the real layout. Loaded by the small loader script
// pasted into Scriptable (generated on /widget), so changes here reach the
// phone automatically. Exports one async function: run(SITE, KEY).
//
// The layout adapts to what you own: one or two stocks get their own price
// cards with a 30-session chart; three or more get the portfolio view —
// today's move, how the money is split, and the day's best and worst.

module.exports = async function run(SITE, KEY) {
const OPEN_URL = SITE + "/?tab=holdings";
const fam = config.widgetFamily || "medium";

const C = {
  text: new Color("#f4f4f6"), muted: new Color("#a1a1ad"), faint: new Color("#6b6b78"),
  up: new Color("#4ade80"), down: new Color("#fb7185"), flat: new Color("#a1a1ad"),
  brand: new Color("#fbbf24"), card: new Color("#ffffff", 0.055), track: new Color("#ffffff", 0.08),
};
// Content width of the narrowest phones' widgets (158pt small / 338pt medium & large, minus padding).
const SW = 128, MW = 308;
const SLICES = ["#fbbf24", "#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#fb923c"];
const REST = "#4b4b57";

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
    error = code === 404 ? "Sync key not found. Set the widget up again from the website."
          : code === 400 ? "No sync key. Copy the widget code from the website again."
          : (d && d.error) || "Couldn't load prices.";
  } catch { error = "Offline · showing last prices"; }
  const d = fm.fileExists(cache) ? JSON.parse(fm.readString(cache)) : null;
  return { d, error };
}

// ---- formatting -----------------------------------------------------------
const MINUS = "−";
function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e7) return (n / 1e6).toFixed(1) + "M";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e5) return (n / 1e3).toFixed(0) + "K";
  if (a >= 1e4) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString("en-US");
}
function signed(n) { return (n > 0 ? "+" : n < 0 ? MINUS : "") + compact(Math.abs(n)); }
function pct(p) {
  if (p === null || p === undefined) return "–";
  return (p > 0 ? "+" : p < 0 ? MINUS : "") + Math.abs(p).toFixed(2) + "%";
}
function price(p) {
  return p >= 1000 ? Math.round(p).toLocaleString("en-US") : p.toFixed(2);
}
function tone(n) { return n > 0.0001 ? C.up : n < -0.0001 ? C.down : C.flat; }
function toneHex(n) { return n > 0.0001 ? "#4ade80" : n < -0.0001 ? "#fb7185" : "#a1a1ad"; }
function time(iso) {
  const f = new DateFormatter(); f.dateFormat = "h:mm a";
  return f.string(new Date(iso));
}
/** One word for how the day went — the widget's mood line. */
function mood(p) {
  if (p === null || p === undefined) return "Today";
  if (p >= 1.5) return "Strong day";
  if (p >= 0.25) return "Green day";
  if (p > -0.25) return "Quiet day";
  if (p > -1.5) return "Red day";
  return "Rough day";
}

// ---- building blocks ------------------------------------------------------
function font(size, weight, rounded) {
  const R = {
    bold: Font.boldRoundedSystemFont, heavy: Font.heavyRoundedSystemFont, semibold: Font.semiboldRoundedSystemFont,
    medium: Font.mediumRoundedSystemFont, regular: Font.regularRoundedSystemFont,
  };
  const S = {
    bold: Font.boldSystemFont, heavy: Font.heavySystemFont, semibold: Font.semiboldSystemFont,
    medium: Font.mediumSystemFont, regular: Font.systemFont,
  };
  return ((rounded ? R : S)[weight || "regular"] || Font.systemFont)(size);
}
function txt(stack, s, size, color, weight, o) {
  o = o || {};
  const t = stack.addText(s);
  t.font = font(size, weight, o.rounded);
  t.textColor = color;
  t.lineLimit = o.lines || 1;
  t.minimumScaleFactor = o.shrink || 0.6;
  if (o.right) t.rightAlignText();
  return t;
}
function hstack(parent, spacing) {
  const s = parent.addStack(); s.layoutHorizontally(); s.centerAlignContent();
  if (spacing) s.spacing = spacing;
  return s;
}
function vstack(parent, spacing) {
  const s = parent.addStack(); s.layoutVertically();
  if (spacing) s.spacing = spacing;
  return s;
}
/** Coloured capsule, e.g. "+1.24%". */
function pill(parent, s, n, size) {
  const p = parent.addStack();
  p.backgroundColor = new Color(toneHex(n), 0.16);
  p.cornerRadius = 6;
  p.setPadding(2, 6, 2, 6);
  txt(p, s, size || 11, tone(n), "bold", { rounded: true });
  return p;
}
function image(parent, img, w, h) {
  const i = parent.addImage(img);
  i.imageSize = new Size(w, h);
  return i;
}

/** Line chart of the last ~30 closes; the dashed line marks your average cost when it's in view. */
function spark(pts, w, h, n, avg) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true;
  if (!pts || pts.length < 2) return ctx.getImage();
  let lo = Math.min(...pts), hi = Math.max(...pts);
  const showAvg = avg > 0 && avg >= lo - (hi - lo) * 0.15 && avg <= hi + (hi - lo) * 0.15;
  if (showAvg) { lo = Math.min(lo, avg); hi = Math.max(hi, avg); }
  const pad = 3, span = hi - lo || 1;
  const x = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v) => pad + (1 - (v - lo) / span) * (h - pad * 2);
  const hex = toneHex(n);

  if (showAvg) {
    ctx.setFillColor(new Color("#ffffff", 0.22));
    const ay = y(avg);
    for (let gx = pad; gx < w - pad; gx += 6) ctx.fillRect(new Rect(gx, ay - 0.5, 3, 1));
  }
  const line = pts.map((v, i) => new Point(x(i), y(v)));
  const area = new Path();
  area.move(new Point(x(0), h)); area.addLines(line); area.addLine(new Point(x(pts.length - 1), h)); area.closeSubpath();
  ctx.addPath(area); ctx.setFillColor(new Color(hex, 0.14)); ctx.fillPath();

  const p = new Path(); p.addLines(line);
  ctx.addPath(p); ctx.setStrokeColor(new Color(hex)); ctx.setLineWidth(1.6); ctx.strokePath();

  const end = line[line.length - 1];
  ctx.setFillColor(new Color(hex, 0.25)); ctx.fillEllipse(new Rect(end.x - 4, end.y - 4, 8, 8));
  ctx.setFillColor(new Color(hex)); ctx.fillEllipse(new Rect(end.x - 2, end.y - 2, 4, 4));
  return ctx.getImage();
}

/** How the money is split: one capsule per big holding, the rest grouped. */
function slices(d) {
  const total = d.holdings.reduce((s, h) => s + h.value, 0) || 1;
  const out = [];
  let rest = 0;
  d.holdings.forEach((h, i) => {
    const share = h.value / total;
    if (i < SLICES.length - 1 && share >= 0.04) out.push({ label: h.ticker, share, color: SLICES[out.length] });
    else rest += share;
  });
  if (rest > 0) out.push({ label: "Other", share: rest, color: REST });
  return out;
}
function splitBar(d, w, h) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true;
  const parts = slices(d), gap = 2;
  const usable = w - gap * (parts.length - 1);
  let x = 0;
  parts.forEach((s, i) => {
    const sw = i === parts.length - 1 ? w - x : Math.max(h, s.share * usable);
    const p = new Path(); p.addRoundedRect(new Rect(x, 0, Math.max(sw, 1), h), h / 2, h / 2);
    ctx.addPath(p); ctx.setFillColor(new Color(s.color)); ctx.fillPath();
    x += sw + gap;
  });
  return ctx.getImage();
}
function splitLegend(parent, d, max) {
  const row = hstack(parent, 10);
  slices(d).slice(0, max).forEach((s) => {
    const item = hstack(row, 4);
    const dot = item.addStack(); dot.size = new Size(6, 6); dot.cornerRadius = 3; dot.backgroundColor = new Color(s.color);
    txt(item, s.label, 10, C.muted, "medium");
    txt(item, Math.round(s.share * 100) + "%", 10, C.faint, "regular");
  });
  row.addSpacer();
}

function movers(d) {
  const priced = d.holdings.filter((h) => typeof h.changePercent === "number");
  if (priced.length < 2) return null;
  const sorted = priced.slice().sort((a, b) => b.changePercent - a.changePercent);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}
/** Small widgets have room for one: what led a green day, or what dragged a red one. */
function leaderLine(parent, d, size) {
  const m = movers(d);
  if (!m) return;
  const red = d.totals.dayPnl < 0;
  const h = red ? m.worst : m.best;
  const row = hstack(parent, 4);
  txt(row, red ? "Dragging" : "Leading", size, C.faint, "medium");
  txt(row, h.ticker, size, C.text, "semibold");
  txt(row, pct(h.changePercent), size, tone(h.changePercent), "semibold", { rounded: true });
  row.addSpacer();
}
function moversLine(parent, d, size) {
  const m = movers(d);
  if (!m) return;
  const row = hstack(parent, 4);
  const one = (h) => {
    txt(row, h.changePercent >= 0 ? "▲" : "▼", size - 2, tone(h.changePercent), "bold");
    txt(row, h.ticker, size, C.text, "semibold");
    txt(row, pct(h.changePercent), size, tone(h.changePercent), "medium", { rounded: true });
  };
  one(m.best);
  row.addSpacer();
  if (m.worst !== m.best) one(m.worst);
}

// ---- frame ----------------------------------------------------------------
function background(w, d) {
  const p = d && d.totals ? d.totals.dayPnlPct : null;
  const top = p > 0.25 ? "#10241a" : p < -0.25 ? "#2a1218" : "#18181f";
  const g = new LinearGradient();
  g.colors = [new Color(top), new Color("#0a0a0d")]; g.locations = [0, 0.85];
  w.backgroundGradient = g;
}
function header(w, d) {
  const h = hstack(w, 5);
  txt(h, "PSX", 11, C.brand, "heavy", { rounded: true });
  const open = d && d.market && d.market.open;
  const dot = h.addStack(); dot.size = new Size(5, 5); dot.cornerRadius = 2.5;
  dot.backgroundColor = open ? C.up : C.faint;
  txt(h, open ? "Live" : "Closed", 10, open ? C.up : C.faint, "semibold");
  h.addSpacer();
  if (d) txt(h, time(d.asOf), 10, C.faint, "medium");
}
function footerError(w, error) {
  if (!error) return;
  w.addSpacer(4);
  txt(w, error, 9, C.brand, "medium", { lines: 2 });
}

// Big portfolio number: "PKR" small, the value large.
function bigValue(parent, value, size) {
  const r = parent.addStack(); r.layoutHorizontally(); r.bottomAlignContent(); r.spacing = 3;
  txt(r, "PKR", Math.round(size * 0.42), C.muted, "semibold", { rounded: true });
  txt(r, compact(value), size, C.text, "bold", { rounded: true });
  r.addSpacer();
}
function bigValueInline(r, value, size) {
  txt(r, "PKR", Math.round(size * 0.42), C.muted, "semibold", { rounded: true });
  txt(r, compact(value), size, C.text, "bold", { rounded: true });
}
function todayLine(parent, t, size) {
  const r = hstack(parent, 5);
  pill(r, signed(t.dayPnl) + "  " + pct(t.dayPnlPct), t.dayPnl, size);
  r.addSpacer();
}
function allTimeLine(parent, t, size) {
  const r = hstack(parent, 4);
  txt(r, "All-time", size, C.faint, "medium");
  txt(r, signed(t.pnl), size, tone(t.pnl), "semibold", { rounded: true });
  txt(r, pct(t.pnlPct), size, C.faint, "medium", { rounded: true });
  r.addSpacer();
}

// ---- many holdings: the portfolio ----------------------------------------
function holdingRow(parent, h, sparkW, size) {
  const r = hstack(parent, 8);
  r.url = SITE + "/stock/" + encodeURIComponent(h.ticker);
  const name = r.addStack(); name.size = new Size(48, 0);
  txt(name, h.ticker, size, C.text, "semibold");
  name.addSpacer();
  if (sparkW) image(r, spark(h.spark, sparkW, 16, h.changePercent), sparkW, 16);
  r.addSpacer();
  txt(r, pct(h.changePercent), size - 1, tone(h.changePercent), "semibold", { rounded: true, right: true });
}

function smallMany(w, d) {
  const t = d.totals;
  w.addSpacer(8);
  txt(w, mood(t.dayPnlPct), 11, C.muted, "semibold");
  bigValue(w, t.value, 24);
  w.addSpacer(3);
  todayLine(w, t, 11);
  w.addSpacer();
  image(w, splitBar(d, SW, 6), SW, 6);
  w.addSpacer(6);
  leaderLine(w, d, 10);
}
function mediumMany(w, d) {
  const t = d.totals;
  w.addSpacer(8);
  const body = hstack(w, 16); body.topAlignContent();
  const left = vstack(body); left.size = new Size(138, 0);
  txt(left, mood(t.dayPnlPct), 11, C.muted, "semibold");
  bigValue(left, t.value, 26);
  left.addSpacer(4);
  todayLine(left, t, 11);
  left.addSpacer(6);
  allTimeLine(left, t, 10);
  left.addSpacer(8);
  image(left, splitBar(d, 138, 6), 138, 6);

  const right = vstack(body, 7);
  const n = d.holdings.length > 4 ? 3 : 4;
  d.holdings.slice(0, n).forEach((h) => holdingRow(right, h, 40, 12));
  if (d.holdings.length > n) txt(right, "+" + (d.holdings.length - n) + " more", 10, C.faint, "medium");
  w.addSpacer();
}
function largeMany(w, d) {
  const t = d.totals;
  w.addSpacer(10);
  txt(w, mood(t.dayPnlPct), 12, C.muted, "semibold");
  bigValue(w, t.value, 34);
  w.addSpacer(4);
  const r = hstack(w, 10);
  pill(r, signed(t.dayPnl) + "  " + pct(t.dayPnlPct) + " today", t.dayPnl, 12);
  r.addSpacer();
  allTimeLine(r, t, 11);
  w.addSpacer(12);
  image(w, splitBar(d, MW, 8), MW, 8);
  w.addSpacer(6);
  splitLegend(w, d, 4);
  w.addSpacer(12);
  const n = d.holdings.length > 6 ? 5 : 6;
  const list = vstack(w, d.holdings.length <= 4 ? 14 : 8); // fewer rows breathe more
  d.holdings.slice(0, n).forEach((h) => {
    const row = hstack(list, 8);
    row.url = SITE + "/stock/" + encodeURIComponent(h.ticker);
    const name = row.addStack(); name.size = new Size(54, 0);
    txt(name, h.ticker, 13, C.text, "semibold"); name.addSpacer();
    image(row, spark(h.spark, 90, 18, h.changePercent), 90, 18);
    row.addSpacer();
    txt(row, compact(h.value), 12, C.muted, "medium", { rounded: true });
    const p = row.addStack(); p.size = new Size(62, 0); p.addSpacer();
    pill(p, pct(h.changePercent), h.changePercent, 11);
  });
  if (d.holdings.length > n) txt(list, "+" + (d.holdings.length - n) + " more on the website", 10, C.faint, "medium");
  w.addSpacer();
  moversLine(w, d, 11);
}

// ---- one or two holdings: the stocks themselves -------------------------
function stockHead(parent, h, tickerSize, pillSize) {
  const r = hstack(parent, 6);
  txt(r, h.ticker, tickerSize, C.text, "heavy", { rounded: true });
  r.addSpacer();
  pill(r, pct(h.changePercent), h.changePercent, pillSize);
}
function positionLine(parent, h, size) {
  const r = hstack(parent, 4);
  txt(r, "P&L", size, C.faint, "medium");
  txt(r, signed(h.pnl), size, tone(h.pnl), "semibold", { rounded: true });
  txt(r, pct(h.pnlPct), size, C.faint, "medium", { rounded: true });
  r.addSpacer();
}

function smallOne(w, d) {
  const h = d.holdings[0];
  w.addSpacer(8);
  stockHead(w, h, 20, 11);
  txt(w, h.name, 10, C.faint, "medium");
  w.addSpacer();
  image(w, spark(h.spark, SW, 34, h.changePercent, h.avgPrice), SW, 34);
  w.addSpacer();
  const p = hstack(w, 3); p.bottomAlignContent();
  txt(p, price(h.price), 17, C.text, "bold", { rounded: true });
  txt(p, "PKR", 9, C.faint, "semibold");
  p.addSpacer();
  w.addSpacer(2);
  positionLine(w, h, 10);
}
function smallTwo(w, d) {
  w.addSpacer(10);
  d.holdings.slice(0, 2).forEach((h, i) => {
    if (i) { w.addSpacer(8); const l = w.addStack(); l.size = new Size(SW, 1); l.backgroundColor = C.track; w.addSpacer(8); }
    const block = vstack(w, 3);
    block.url = SITE + "/stock/" + encodeURIComponent(h.ticker);
    stockHead(block, h, 15, 10);
    const r = hstack(block, 6);
    txt(r, price(h.price), 11, C.muted, "semibold", { rounded: true });
    r.addSpacer();
    image(r, spark(h.spark, 56, 14, h.changePercent), 56, 14);
  });
  w.addSpacer();
  const t = d.totals;
  const r = hstack(w, 4);
  txt(r, "PKR " + compact(t.value), 10, C.muted, "semibold", { rounded: true });
  r.addSpacer();
  txt(r, signed(t.dayPnl) + " today", 10, tone(t.dayPnl), "semibold", { rounded: true });
}
function stockCard(parent, h, w, chartH, big) {
  // Inset with fixed spacers rather than padding, so the card's width is exactly w.
  const outer = hstack(parent);
  outer.size = new Size(w, 0);
  outer.backgroundColor = C.card; outer.cornerRadius = 14;
  outer.url = SITE + "/stock/" + encodeURIComponent(h.ticker);
  outer.addSpacer(10);
  const c = vstack(outer, 3);
  outer.addSpacer(10);
  c.addSpacer(7);
  stockHead(c, h, big ? 20 : 16, 10);
  const p = hstack(c, 3); p.bottomAlignContent();
  txt(p, price(h.price), big ? 15 : 13, C.text, "bold", { rounded: true });
  txt(p, "PKR", 8, C.faint, "semibold");
  p.addSpacer();
  image(c, spark(h.spark, w - 20, chartH, h.changePercent, h.avgPrice), w - 20, chartH);
  positionLine(c, h, 10);
  c.addSpacer(7);
  return outer;
}
function mediumOne(w, d) {
  const h = d.holdings[0];
  w.addSpacer(8);
  const body = hstack(w, 14); body.topAlignContent();
  const left = vstack(body, 2); left.size = new Size(120, 0);
  txt(left, h.ticker, 26, C.text, "heavy", { rounded: true });
  txt(left, h.name, 10, C.faint, "medium");
  left.addSpacer(8);
  const p = hstack(left, 3); p.bottomAlignContent();
  txt(p, price(h.price), 19, C.text, "bold", { rounded: true });
  txt(p, "PKR", 9, C.faint, "semibold");
  p.addSpacer();
  left.addSpacer(4);
  const pr = hstack(left); pill(pr, pct(h.changePercent) + " today", h.changePercent, 11); pr.addSpacer();
  const right = vstack(body, 6);
  image(right, spark(h.spark, MW - 134, 66, h.changePercent, h.avgPrice), MW - 134, 66);
  const s = hstack(right, 4);
  txt(s, h.shares.toLocaleString("en-US") + " sh", 10, C.muted, "medium");
  txt(s, "· avg " + price(h.avgPrice), 10, C.faint, "medium");
  s.addSpacer();
  positionLine(right, h, 10);
  w.addSpacer();
}
function mediumTwo(w, d) {
  w.addSpacer(8);
  const row = hstack(w, 10); row.topAlignContent();
  d.holdings.slice(0, 2).forEach((h) => stockCard(row, h, (MW - 10) / 2, 22, false));
  w.addSpacer();
}
function largeFew(w, d) {
  const t = d.totals;
  w.addSpacer(10);
  const r = hstack(w, 8); r.bottomAlignContent();
  bigValueInline(r, t.value, 24);
  r.addSpacer();
  pill(r, signed(t.dayPnl) + "  " + pct(t.dayPnlPct), t.dayPnl, 11);
  w.addSpacer(12);
  const list = vstack(w, 10);
  const one = d.holdings.length === 1;
  d.holdings.slice(0, 2).forEach((h) => stockCard(list, h, MW, one ? 150 : 28, true));
  w.addSpacer();
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
    const s = hstack(w); s.addSpacer(); txt(s, "PSX", 9, Color.white(), "semibold"); s.addSpacer();
    const p = hstack(w); p.addSpacer(); txt(p, pct(t.dayPnlPct).replace("%", ""), 12, Color.white(), "bold", { rounded: true }); p.addSpacer();
    w.addSpacer();
  } else if (d.holdings.length && d.holdings.length <= 2) {
    d.holdings.slice(0, 2).forEach((h) => {
      const r = hstack(w, 4);
      txt(r, h.ticker, 13, Color.white(), "bold", { rounded: true });
      r.addSpacer();
      txt(r, price(h.price) + "  " + pct(h.changePercent), 12, Color.white(), "medium", { rounded: true });
    });
    txt(w, (d.market.open ? "Live · " : "Closed · ") + time(d.asOf), 10, Color.white());
  } else {
    txt(w, "PSX · PKR " + compact(t.value), 12, Color.white(), "semibold", { rounded: true });
    txt(w, signed(t.dayPnl) + "  " + pct(t.dayPnlPct) + " today", 12, Color.white(), "medium", { rounded: true });
    txt(w, (d.market.open ? "Live · " : "Closed · ") + time(d.asOf), 10, Color.white());
  }
  return w;
}

// ---- home screen ----------------------------------------------------------
function build(d, error) {
  if (fam.startsWith("accessory")) return accessory(d, error);
  const w = new ListWidget();
  background(w, d);
  w.url = OPEN_URL;
  w.setPadding(14, 15, 14, 15);
  header(w, d);
  if (!d) { w.addSpacer(); txt(w, error || "No data yet", 12, C.muted, "medium", { lines: 3 }); w.addSpacer(); return w; }
  if (!d.holdings.length) {
    w.addSpacer();
    txt(w, d.missing && d.missing.length ? "No prices yet for " + d.missing.join(", ") : "No holdings yet.", 13, C.text, "semibold", { lines: 2 });
    txt(w, "Add them on the website and they'll appear here.", 11, C.muted, "regular", { lines: 3 });
    w.addSpacer();
    footerError(w, error);
    return w;
  }
  const n = d.holdings.length;
  const layouts = {
    small: n === 1 ? smallOne : n === 2 ? smallTwo : smallMany,
    medium: n === 1 ? mediumOne : n === 2 ? mediumTwo : mediumMany,
    large: n <= 2 ? largeFew : largeMany,
  };
  (layouts[fam] || layouts.medium)(w, d);
  footerError(w, error);
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
