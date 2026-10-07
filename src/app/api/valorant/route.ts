import { getValorant } from "@/lib/live/valorant";

// GET /api/valorant — Clutch's data: the majors' schedule and results, the
// teams for the picker, the scene's news and the market's prices. The same
// for every reader (the page picks out the teams it follows), so the edge
// keeps it: a minute while an event is on (a final score shouldn't wait),
// a quarter of an hour otherwise.
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getValorant();
  if (!data) return Response.json({ error: "valorant unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const cache =
    data.phase === "off"
      ? "public, max-age=60, s-maxage=900, stale-while-revalidate=3600"
      : "public, max-age=30, s-maxage=60, stale-while-revalidate=60";
  return Response.json(data, { headers: { "Cache-Control": cache } });
}
