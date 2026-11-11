import type { Metadata } from "next";
import TopNav from "@/components/nav/TopNav";
import MarketView from "@/components/market/MarketView";

export const metadata: Metadata = {
  title: "Market | PSX Scanner",
  description: "PSX at a glance: indices, market breadth and turnover, sector performance, top movers and stocks at their circuit limits.",
};

export default function MarketPage() {
  return (
    <>
      <TopNav active="market" />
      <MarketView />
    </>
  );
}
