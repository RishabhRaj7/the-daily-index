import { getWeekend } from "@/lib/live/f1-weekend";

export const maxDuration = 60;

// GET /api/f1/weekend?meeting=Singapore%20Grand%20Prix[&year=2026]
// the weekend's finished sessions and the circuit's history (lib/live/f1-weekend.ts).

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const meeting = (params.get("meeting") ?? "").slice(0, 80);
  const year = Number(params.get("year")) || undefined;
  if (!meeting) return Response.json(null, { status: 400 });
  const data = await getWeekend(meeting, year).catch(() => null);
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=300" } });
}
