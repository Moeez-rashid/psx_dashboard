"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { StockTech } from "./StockBits";
import { nearEntry } from "./StockBits";
import { Sparkline } from "./ui/primitives";
import { Move, MUTED_DOWN, MUTED_UP, NearEntryFlag } from "./ui/MobileRow";
import { hueOf } from "./ui/signal-hue";

const PARTS = [
  { key: "trend", label: "Trend", max: 35 },
  { key: "momentum", label: "Momentum", max: 25 },
  { key: "volume", label: "Volume", max: 20 },
  { key: "entry", label: "Entry", max: 20 },
] as const;

/**
 * Phones, top of Signals: the #1 pick with WHY it ranks first — its Technical
 * Score split into the four parts the score is built from (same numbers the
 * scorer produced, nothing re-derived), a 30-day line and the lead reason.
 */
export default function TopPickCard({ tech, price, change, spark, sector, shariah }: {
  tech: StockTech;
  price?: number;
  change?: number;
  spark?: number[];
  sector?: string;
  shariah?: boolean;
}) {
  const c = tech.components;
  const hue = hueOf(tech.technicalSignal);
  const up = spark && spark.length >= 2 ? spark[spark.length - 1] >= spark[0] : true;

  return (
    <Link href={`/stock/${tech.symbol}`} className="block card p-3 mb-3 active:bg-raised">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-3">
        Top pick
        <span className={`normal-case tracking-normal font-semibold ${hue.text}`}>
          · {tech.technicalSignal.replace("_", " ")} {tech.technicalScore}
        </span>
        <span className="flex-1" />
        <span className="normal-case tracking-normal text-sky-2 inline-flex items-center">Deep Dive<ChevronRight size={12} strokeWidth={2.25} aria-hidden /></span>
      </div>

      <div className="flex items-center gap-3 mt-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[18px] font-bold tracking-tight">{tech.symbol}</span>
            {shariah && <span className="text-[8px] font-bold tracking-wide text-up-2 border border-up/40 rounded px-1 leading-[13px]">SHARIAH</span>}
            {nearEntry(tech) && <NearEntryFlag />}
          </div>
          {sector && <div className="text-[11px] text-ink-3 truncate">{sector}</div>}
        </div>
        {spark && spark.length >= 5 && <Sparkline data={spark} width={84} height={30} opacity={1} color={up ? MUTED_UP : MUTED_DOWN} />}
        <div className="text-right shrink-0 leading-tight">
          <div className="text-[16px] font-semibold num">{price !== undefined ? price.toFixed(2) : "—"}</div>
          <div className="text-[11px] num"><Move pct={change} /></div>
        </div>
      </div>

      {c && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5">
          {PARTS.map((p) => {
            const v = c[p.key];
            const full = v / p.max;
            return (
              <div key={p.key} className="min-w-0">
                <div className="flex justify-between text-[10px]">
                  <span className="text-ink-3">{p.label}</span>
                  <span className="num text-ink-2">{v}<span className="text-ink-3">/{p.max}</span></span>
                </div>
                <div className="h-1 rounded-full bg-line-2/70 mt-0.5 overflow-hidden">
                  <div className={`h-full rounded-full ${full >= 0.75 ? "bg-up" : full >= 0.45 ? "bg-gold" : "bg-down"}`} style={{ width: `${full * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tech.reasons[0] && <p className="text-[11px] text-ink-2 leading-snug mt-2 line-clamp-2">{tech.reasons[0]}</p>}
    </Link>
  );
}
