"use client";
import CommandPalette from "./CommandPalette";
import AlertsCenter from "./AlertsCenter";
import TradeTools from "./TradeTools";
import { Toaster } from "./ui/Toast";
import BottomNav from "./nav/BottomNav";

/** Client features that exist on every route: quick search, price alerts, the trade calculator, toasts, the phone tab bar. */
export default function GlobalClient() {
  return (
    <>
      <CommandPalette />
      <AlertsCenter />
      <TradeTools />
      <Toaster />
      <BottomNav />
    </>
  );
}
