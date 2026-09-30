import { getValorant } from "@/lib/live/valorant";

// GET /api/valorant — Clutch's data: the majors' schedule and results, the
// teams for the picker, the scene's news and the market's prices. The same
// for every reader (the page picks out the teams it follows), so the edge
// keeps it: two minutes while an event is on, a quarter of an hour otherwise.
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getValorant();
  if (!data) return Response.json({ error: "valorant unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const ttl = data.phase === "off" ? 900 : 120;
  return Response.json(data, { headers: { "Cache-Control": `public, max-age=60, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}` } });
}
