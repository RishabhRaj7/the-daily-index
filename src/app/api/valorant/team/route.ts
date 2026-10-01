import { after } from "next/server";
import { teamHistory } from "@/lib/live/valorant-archive";

// GET /api/valorant/team?code=PRX — one team's finished matches in the
// majors since 2024, newest first: Clutch's team sheet and, filtered to an
// opponent, its head-to-head. Results don't change, so the edge keeps the
// answer for half an hour.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") ?? "").toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(code)) return Response.json({ error: "bad code" }, { status: 400 });
  const matches = await teamHistory(code, (task) => after(task)).catch(() => []);
  return Response.json(
    { code, matches },
    { headers: { "Cache-Control": matches.length ? "public, max-age=300, s-maxage=1800, stale-while-revalidate=7200" : "no-store" } },
  );
}
