"use client";
import CommandPalette from "./CommandPalette";
import AlertsCenter from "./AlertsCenter";
import TradeTools from "./TradeTools";
import { Toaster } from "./ui/Toast";

/** Client features that exist on every route: quick search, price alerts, the trade calculator, toasts. */
export default function GlobalClient() {
  return (
    <>
      <CommandPalette />
      <AlertsCenter />
      <TradeTools />
      <Toaster />
    </>
  );
}
