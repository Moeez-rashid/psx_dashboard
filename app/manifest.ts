import type { MetadataRoute } from "next";

/** Lets the site be installed to a phone's home screen / desktop as an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PSX Scanner",
    short_name: "PSX Scanner",
    description: "Pakistan Stock Exchange market overview, screener, technical setups, portfolio and price alerts.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Market", url: "/market" },
      { name: "Screener", url: "/screener" },
      { name: "Watchlist", url: "/?tab=watching" },
    ],
  };
}
