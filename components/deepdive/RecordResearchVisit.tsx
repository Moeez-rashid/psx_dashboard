"use client";
import { useEffect } from "react";
import { recordResearch, setActiveResearch } from "@/lib/recent-research";

/** Invisible — records this Deep Dive visit into the landing page's "Recent
 *  research" list. Split out from the (server) page component since
 *  localStorage only exists client-side. */
export default function RecordResearchVisit({ ticker, name }: { ticker: string; name: string | null }) {
  useEffect(() => {
    recordResearch({ ticker, name });
  }, [ticker, name]);
  return null;
}

/** Invisible — marks this ticker as the one being researched the moment the
 *  page opens, BEFORE its data has loaded, so leaving mid-load and coming
 *  back via the Deep Dive tab returns here rather than to the search screen. */
export function MarkActiveResearch({ ticker }: { ticker: string }) {
  useEffect(() => { setActiveResearch(ticker); }, [ticker]);
  return null;
}
