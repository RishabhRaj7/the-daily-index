import { getTrack, loopsFor, pitLaneFor, placeOn, refineLane, sectorsFor } from "@/lib/live/f1-track";
import { geoFor } from "@/lib/live/f1-geo";

// GET /api/f1/track?key=61   a circuit as a vector model (lib/live/f1-track.ts).
// Circuits barely change: the browser and the edge keep it for a day.

export const maxDuration = 60;

export async function GET(req: Request) {
  const key = Number(new URL(req.url).searchParams.get("key"));
  if (!Number.isInteger(key) || key <= 0) return Response.json({ error: "key" }, { status: 400 });
  const [model, sectors, loops, lane] = await Promise.all([getTrack(key).catch(() => null), sectorsFor(key), loopsFor(key).catch(() => null), pitLaneFor(key).catch(() => null)]);
  if (!model) return Response.json({ error: "unknown circuit" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const geo = await geoFor(model).catch(() => null);
  const pit = lane ? refineLane(model, lane.map((l) => placeOn(model, l))) : null;
  // A circuit without its pit lane yet (F1's archive refused, or no race run there) is asked again within the hour, not kept a day.
  const cache = pit ? "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=600, s-maxage=600";
  return Response.json({ ...model, sectors: sectors ?? model.sectors ?? null, loops, pit, geo }, { headers: { "Cache-Control": cache } });
}
