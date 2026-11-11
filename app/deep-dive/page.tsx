import type { Metadata } from "next";
import TopNav from "@/components/nav/TopNav";
import DeepDiveLanding from "@/components/deepdive/DeepDiveLanding";

/**
 * The dedicated Deep Dive entry point — a search workspace, not a stock page.
 * Selecting a stock here navigates to /stock/[ticker], which remains the
 * actual research destination and owns all Deep Dive data fetching. This
 * page fetches nothing itself beyond the symbol list the search box needs.
 */
export const metadata: Metadata = {
  title: "Deep Dive | PSX Scanner",
  description: "Search any PSX-listed stock to open a full technical, valuation, fundamental and AI-interpreted research workspace.",
};

export default function DeepDivePage() {
  return (
    <>
      <TopNav active="deep-dive" />
      <DeepDiveLanding />
    </>
  );
}
