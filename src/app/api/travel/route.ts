import { fetchRssFeed, dedupeWires } from "@/lib/live/rss";
import { googleNewsFeed } from "@/lib/live/feeds";
import type { WireBrief } from "@/lib/types";

// POST /api/travel { lat, lon }
//
// Travel mode: where the reader is, and what is in the news there. The
// browser sends coordinates only after the reader taps "Use my location",
// already rounded to ~1 km. Reverse geocoding is OpenStreetMap's Nominatim
// (one call per tap, identified by our User-Agent as its policy asks); the
// news is two Google News searches, one for the city and one for the wider
// area — the country abroad, the state at home in India.

export const dynamic = "force-dynamic";

interface Place {
  city: string;
  region: string | null;
  country: string;
  countryCode: string;
}

async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  const res = await fetch(
    // Zoom 8 names the metro, not the ward: Tokyo (not Chiyoda), Greater
    // London (not Westminster), Bengaluru Urban, Dubai Emirate.
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=8&accept-language=en`,
    {
      headers: { "User-Agent": "TheDailyIndex/1.0 (personal news digest)" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    name?: string;
    address?: Record<string, string | undefined>;
  };
  const a = data.address ?? {};
  const city = a.city ?? a.town ?? a.state_district ?? a.county ?? a.state ?? data.name;
  const country = a.country;
  if (!city || !country) return null;
  return {
    // "Greater London" → London, "Bengaluru Urban" → Bengaluru,
    // "Mumbai Suburban District" → Mumbai, "Dubai Emirate" → Dubai.
    city: city
      .replace(/^Greater\s+/i, "")
      .replace(/\s+(Urban|Rural|Suburban District|District|Emirate|Prefecture|Metropolitan Region|City)$/i, "")
      .trim(),
    region: a.state ?? a.region ?? null,
    country,
    countryCode: (a.country_code ?? "").toUpperCase(),
  };
}

async function headlines(query: string, limit: number): Promise<WireBrief[]> {
  const items = await fetchRssFeed({ ...googleNewsFeed(`${query} when:1d`), politicsFilter: true }, 1800);
  return dedupeWires(items).slice(0, limit);
}

export async function POST(req: Request) {
  let lat: number;
  let lon: number;
  try {
    const body = (await req.json()) as { lat?: unknown; lon?: unknown };
    lat = Number(body.lat);
    lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error();
  } catch {
    return Response.json({ error: "lat and lon required" }, { status: 400 });
  }
  // Never keep more precision than a neighbourhood.
  lat = Math.round(lat * 100) / 100;
  lon = Math.round(lon * 100) / 100;

  const place = await reverseGeocode(lat, lon).catch(() => null);
  if (!place) return Response.json({ error: "place not found" }, { status: 404 });

  // Abroad the wider picture is the country; in India it is the state.
  const wide = place.countryCode === "IN" && place.region ? place.region : place.country;
  const [city, area] = await Promise.all([headlines(place.city, 6), headlines(wide, 8)]);
  const seen = new Set(city.map((b) => b.url));

  return Response.json(
    {
      place: { ...place, lat, lon, wide },
      city,
      area: dedupeWires([...city, ...area.filter((b) => !seen.has(b.url))]).filter((b) => !seen.has(b.url)).slice(0, 6),
      at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
