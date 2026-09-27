import { getLiveMarkets } from "@/lib/live/indices";

// GET /api/markets — the index tiles, refreshed by the open page every
// minute. Yahoo is read at most once a minute however many tabs ask.
export const dynamic = "force-dynamic";

export async function GET() {
  const markets = await getLiveMarkets(60);
  if (!markets) return Response.json({ error: "markets unavailable" }, { status: 503 });
  return Response.json(
    { ...markets, at: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } },
  );
}
