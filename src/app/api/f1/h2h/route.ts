import { teammateH2H } from "@/lib/live/f1-h2h";

// GET /api/f1/h2h?team=Mercedes   the team's two drivers, head to head, this season.

export async function GET(req: Request) {
  const team = new URL(req.url).searchParams.get("team")?.trim();
  if (!team) return Response.json({ error: "team" }, { status: 400 });
  const h2h = await teammateH2H(team).catch(() => null);
  return Response.json(h2h, { headers: { "Cache-Control": h2h ? "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400" : "no-store" } });
}
