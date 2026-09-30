import { getWeekAhead } from "@/lib/live/ahead";

// GET /api/ahead — the Week Ahead strip. Its sources change a few times a
// day at most, so it is cached at the edge for half an hour.
export const dynamic = "force-dynamic";

export async function GET() {
  const week = await getWeekAhead();
  return Response.json(week, {
    headers: { "Cache-Control": "public, max-age=900, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
