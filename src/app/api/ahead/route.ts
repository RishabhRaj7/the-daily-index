import { getWeekAhead } from "@/lib/live/ahead";

// GET /api/ahead — the Week Ahead strip. Its sources change a few times a
// day at most, so it is cached at the edge for half an hour.
export const dynamic = "force-dynamic";

// ?vt=PRX,SEN adds the reader's Valorant teams' matches.
export async function GET(req: Request) {
  const vt = (new URL(req.url).searchParams.get("vt") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z0-9]{1,6}$/.test(t))
    .slice(0, 3);
  const week = await getWeekAhead(new Date(), { valorantTeams: vt });
  return Response.json(week, {
    headers: { "Cache-Control": "public, max-age=900, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
