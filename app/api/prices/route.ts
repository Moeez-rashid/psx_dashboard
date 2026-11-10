import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/psx";

// A cold instance may need to load the session store before answering.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { symbols } = await req.json() as { symbols: string[] };
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "symbols array required" }, { status: 400 });
    }

    const quotes = await getQuotes(symbols);
    return NextResponse.json(quotes);
  } catch (err) {
    console.error("[/api/prices]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Price fetch failed" },
      { status: 500 }
    );
  }
}
