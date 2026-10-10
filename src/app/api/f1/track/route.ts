import { getTrack } from "@/lib/live/f1-track";

// GET /api/f1/track?key=61   a circuit as a vector model (lib/live/f1-track.ts).
// Circuits barely change: the browser and the edge keep it for a day.

export const maxDuration = 60;

export async function GET(req: Request) {
  const key = Number(new URL(req.url).searchParams.get("key"));
  if (!Number.isInteger(key) || key <= 0) return Response.json({ error: "key" }, { status: 400 });
  const model = await getTrack(key).catch(() => null);
  if (!model) return Response.json({ error: "unknown circuit" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(model, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" } });
}
