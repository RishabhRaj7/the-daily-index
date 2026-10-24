import { seasonSessions } from "@/lib/live/f1-live";

// GET /api/f1/sessions?year=2026   every finished session of the season, newest first.

export async function GET(req: Request) {
  const y = Number(new URL(req.url).searchParams.get("year")) || new Date().getUTCFullYear();
  const meetings = await seasonSessions(y);
  // An empty season (nothing answered, nothing kept yet) isn't held, so the next ask can find it.
  return Response.json(meetings, { headers: { "Cache-Control": meetings.length ? "public, max-age=300, s-maxage=900" : "no-store" } });
}
