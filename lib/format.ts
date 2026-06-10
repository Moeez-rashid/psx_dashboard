/** Shared display formatters used across the dashboard. */

/** 1234567 → "1.2M", 70435 → "70K" */
export function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${Math.round(n)}`;
}

/** Compact PKR amount: 22760 → "22.8K", 1.2M → "1.20M" */
export function fmtPKR(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${(a / 1_000).toFixed(1)}K`;
  return Math.round(a).toString();
}

/** Signed percentage: 1.234 → "+1.23%" */
export function fmtPct(v: number, digits = 2): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

/** Current time in PKT, e.g. "06:38 pm" */
export function pktNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
}

/** True while the PSX regular session is open (Mon–Thu 09:30–15:30, Fri split session). */
export function isPKTOpen(): boolean {
  const pkt = pktNow();
  const h = pkt.getHours(), m = pkt.getMinutes(), day = pkt.getDay();
  if (day === 0 || day === 6) return false;
  const mins = h * 60 + m;
  if (day === 5) return (mins >= 570 && mins <= 720) || (mins >= 870 && mins <= 930);
  return mins >= 570 && mins <= 930;
}
