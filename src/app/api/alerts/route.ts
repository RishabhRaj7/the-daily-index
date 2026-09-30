import { getWeatherAlerts } from "@/lib/live/alerts";

// GET /api/alerts?p=Bengaluru,12.97,77.59|Ranchi,23.34,85.31 — severe-weather
// alerts near the reader's places (lib/live/alerts.ts). Cached at the edge
// for ten minutes per set of places.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const places = (new URL(req.url).searchParams.get("p") ?? "")
    .split("|")
    .map((s) => {
      const [name, lat, lon] = s.split(",");
      return { name: (name ?? "").trim().slice(0, 40), lat: Number(lat), lon: Number(lon) };
    })
    .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .slice(0, 4);
  const alerts = await getWeatherAlerts(places);
  return Response.json({ alerts }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } });
}
