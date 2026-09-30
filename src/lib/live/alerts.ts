import type { WeatherAlert } from "@/lib/types";

// Severe-weather alerts from Sachet, India's common alerting platform run by
// NDMA: the IMD's weather watches and warnings, the Central Water
// Commission's flood levels and the states' own alerts, as one public JSON
// list. Only what could change a reader's day prints: a watch, warning or
// alert (or an orange/red flood level) naming one of their cities or
// centred within 60 km of it. Yellow advisories and light rain stay out.
//
// The list is national and changes through the day; it is read at most
// every ten minutes and filtered per request.

const URL = "https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails";
const RADIUS_KM = 60;

interface SachetRow {
  severity?: string;
  severity_color?: string;
  disaster_type?: string;
  area_description?: string;
  effective_start_time?: string;
  effective_end_time?: string;
  warning_message?: string;
  actual_lang?: string;
  centroid?: string;
  alert_source?: string;
  identifier?: number | string;
}

const SERIOUS = /^(watch|warning|alert|orange|red)$/i;
const TRIVIAL = /\b(light rain|light thunderstorm|very light)\b/i;
const RANK: Record<string, number> = { red: 0, warning: 1, orange: 2, alert: 3, watch: 4 };

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  return 2 * 6371 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2));
}

/** "Thu Oct 01 06:00:00 IST 2026" → ISO. */
function when(s?: string): string | null {
  if (!s) return null;
  const m = s.match(/^\w{3} (\w{3}) (\d{2}) (\d{2}:\d{2}:\d{2}) IST (\d{4})$/);
  const t = m ? Date.parse(`${m[1]} ${m[2]} ${m[4]} ${m[3]} GMT+0530`) : Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function getWeatherAlerts(places: Array<{ name: string; lat: number; lon: number }>): Promise<WeatherAlert[]> {
  if (places.length === 0) return [];
  let rows: SachetRow[];
  try {
    const res = await fetch(URL, { headers: { Accept: "application/json" }, next: { revalidate: 600 }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const body = await res.json();
    if (!Array.isArray(body)) return [];
    rows = body as SachetRow[];
  } catch {
    return [];
  }
  const now = Date.now();
  const out: WeatherAlert[] = [];
  const seen = new Set<string>();
  for (const place of places) {
    const nameRe = new RegExp(`\\b${place.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    for (const a of rows) {
      const severity = (a.severity ?? "").trim();
      if (!SERIOUS.test(severity) || TRIVIAL.test(a.disaster_type ?? "")) continue;
      const until = when(a.effective_end_time);
      if (until && Date.parse(until) < now) continue;
      const [lon, lat] = String(a.centroid ?? "").split(",").map(Number);
      const near = Number.isFinite(lat) && Number.isFinite(lon) && km(place, { lat, lon }) <= RADIUS_KM;
      if (!near && !nameRe.test(a.area_description ?? "")) continue;
      const key = `${place.name}|${a.identifier ?? `${a.disaster_type}|${a.area_description}`}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        place: place.name,
        severity: severity.toLowerCase(),
        type: a.disaster_type ?? "Alert",
        area: a.area_description ?? "",
        from: when(a.effective_start_time),
        until,
        message: a.actual_lang === "en" ? (a.warning_message ?? "").replace(/\s+/g, " ").trim().slice(0, 280) : "",
        source: a.alert_source ?? "NDMA",
      });
    }
  }
  return out.sort((x, y) => (RANK[x.severity] ?? 9) - (RANK[y.severity] ?? 9)).slice(0, 4);
}
