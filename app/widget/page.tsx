import type { Metadata } from "next";
import TopNav from "@/components/nav/TopNav";
import WidgetSetup from "@/components/WidgetSetup";

export const metadata: Metadata = {
  title: "iPhone widget | PSX Scanner",
  description: "Put your PSX holdings on your iPhone home screen with a Scriptable widget.",
};

export default function WidgetPage() {
  return (
    <>
      <TopNav active="holdings" />
      <WidgetSetup />
    </>
  );
}
