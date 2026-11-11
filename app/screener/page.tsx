import type { Metadata } from "next";
import TopNav from "@/components/nav/TopNav";
import ScreenerView from "@/components/screener/ScreenerView";

export const metadata: Metadata = {
  title: "Screener | PSX Scanner",
  description: "Filter every PSX-listed stock by Shariah compliance, index, sector, valuation, dividend yield, liquidity and Technical Score.",
};

export default async function ScreenerPage({ searchParams }: { searchParams: Promise<{ sector?: string }> }) {
  // Deep link from the Market page's sector tiles.
  const { sector } = await searchParams;
  const initialSector = sector && /^08\d\d$/.test(sector) ? sector : "";
  return (
    <>
      <TopNav active="screener" />
      <ScreenerView initialSector={initialSector} />
    </>
  );
}
