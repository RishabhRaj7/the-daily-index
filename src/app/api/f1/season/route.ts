import { getSeason } from "@/lib/live/f1-season";

export const maxDuration = 30;

// GET /api/f1/season   the season so far: points and places round by round,
// and the season's records (lib/live/f1-season.ts).

export async function GET() {
  const season = await getSeason().catch(() => null);
  if (!season) return Response.json(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(season, { headers: { "Cache-Control": "public, max-age=600, s-maxage=1800" } });
}
