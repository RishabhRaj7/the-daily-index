import { getOddsUniverse } from "@/lib/live/odds";

// GET /api/odds?f=Max Verstappen|Real Madrid — every candidate market for
// Straw Poll, classified and cleaned (lib/live/odds.ts). `f` adds a search
// for each name the reader follows. The page chooses what to print
// (lib/odds-pick.ts). Upstream calls are cached for a quarter of an hour
// and refreshed in the background; the edge keeps each answer 5 minutes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const follows = (new URL(req.url).searchParams.get("f") ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 40)
    .slice(0, 8);
  const universe = await getOddsUniverse(follows);
  if (universe.markets.length === 0) {
    return Response.json({ error: "odds unavailable", ...universe }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(universe, {
    headers: { "Cache-Control": "public, max-age=120, s-maxage=300, stale-while-revalidate=900" },
  });
}
