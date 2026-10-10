import { driversH2H, teammateH2H } from "@/lib/live/f1-h2h";

// GET /api/f1/h2h?team=Mercedes   a team's two drivers, head to head, this season.
// GET /api/f1/h2h?a=RUS&b=VER     any two drivers.

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const team = params.get("team")?.trim();
  const a = params.get("a")?.trim();
  const b = params.get("b")?.trim();
  const h2h =
    a && b && /^[A-Za-z]{3}$/.test(a) && /^[A-Za-z]{3}$/.test(b)
      ? await driversH2H(a, b).catch(() => null)
      : team
        ? await teammateH2H(team).catch(() => null)
        : null;
  return Response.json(h2h, { headers: { "Cache-Control": h2h ? "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400" : "no-store" } });
}
