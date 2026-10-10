import { benchmarks } from "@/lib/live/f1-season";

export const maxDuration = 20;

// GET /api/f1/benchmarks?meeting=Singapore%20Grand%20Prix&type=Qualifying
// last year's pole (or fastest race lap) and the fastest race lap there
// since 2022.

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const meeting = (params.get("meeting") ?? "").slice(0, 80);
  const type = params.get("type") === "Race" ? "Race" : "Qualifying";
  const year = Number(params.get("year")) || undefined;
  if (!meeting) return Response.json([], { status: 400 });
  const list = await benchmarks(meeting, type, year).catch(() => []);
  return Response.json(list, { headers: { "Cache-Control": "public, max-age=3600" } });
}
