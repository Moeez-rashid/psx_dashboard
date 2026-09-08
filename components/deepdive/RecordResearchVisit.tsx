"use client";
import { useEffect } from "react";
import { recordResearch } from "@/lib/recent-research";

/** Invisible — records this Deep Dive visit into the landing page's "Recent
 *  research" list. Split out from the (server) page component since
 *  localStorage only exists client-side. */
export default function RecordResearchVisit({ ticker, name }: { ticker: string; name: string | null }) {
  useEffect(() => {
    recordResearch({ ticker, name });
  }, [ticker, name]);
  return null;
}
