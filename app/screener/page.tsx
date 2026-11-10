import type { Metadata } from "next";
import TopNav from "@/components/nav/TopNav";
import ScreenerView from "@/components/screener/ScreenerView";

export const metadata: Metadata = {
  title: "Screener | PSX Scanner",
  description: "Filter every PSX-listed stock by Shariah compliance, index, sector, valuation, dividend yield, liquidity and Technical Score.",
};

export default function ScreenerPage() {
  return (
    <>
      <TopNav active="screener" />
      <ScreenerView />
    </>
  );
}
