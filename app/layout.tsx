import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import GlobalClient from "@/components/GlobalClient";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "PSX Scanner",
  appleWebApp: { capable: true, title: "PSX Scanner", statusBarStyle: "black-translucent" },
  title: "PSX Scanner — Pakistan Stock Market Dashboard",
  description:
    "PSX market overview, full-market stock screener with Shariah filter, technical setups for KMI-30 stocks, portfolio tracking, company announcements and price alerts.",
  keywords: ["PSX", "Pakistan Stock Exchange", "KSE-100", "KMI-30", "stock scanner", "Shariah stocks"],
  openGraph: {
    title: "PSX Scanner",
    description: "Live Pakistan Stock Exchange dashboard with AI buy signals, portfolio tracking, and technical analysis.",
    url: "https://psxscraper.site",
    siteName: "PSX Scanner",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <GlobalClient />
      </body>
    </html>
  );
}
