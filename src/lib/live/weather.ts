import type { WeatherBlock, WeatherNow } from "@/lib/types";

interface Mood {
  condition: string;
  narrative: (city: string, tempC: number) => string;
  quip: string;
}

interface WeatherMood {
  day: Mood;
  night: Mood;
}

// WMO weather codes: https://open-meteo.com/en/docs
function moodForCode(code: number): WeatherMood {
  if (code === 0) {
    return {
      day: {
        condition: "Clear sky",
        narrative: (city, t) =>
          `Clear skies over ${city} today, with the mercury sitting at ${t}°C. A rare gift — try not to spend it entirely indoors.`,
        quip: "Perfect weather for having strong opinions about sunglasses.",
      },
      night: {
        condition: "Clear night",
        narrative: (city, t) =>
          `A clear night over ${city}, ${t}°C and not a cloud in the way. If the streetlights allow it, look up.`,
        quip: "The stars are out. The city lights are winning, but still.",
      },
    };
  }
  if (code <= 3) {
    return {
      day: {
        condition: "Partly cloudy",
        narrative: (city, t) =>
          `A mix of sun and cloud over ${city} today, hovering around ${t}°C. The clouds are doing their best to stay relevant.`,
        quip: "The sky can't make up its mind. Honestly, relatable.",
      },
      night: {
        condition: "Partly cloudy",
        narrative: (city, t) =>
          `Clouds drifting across the night sky over ${city}, ${t}°C. The moon is playing hide and seek.`,
        quip: "The moon has a few meetings behind the clouds tonight.",
      },
    };
  }
  if (code === 45 || code === 48) {
    return {
      day: {
        condition: "Fog",
        narrative: (city, t) =>
          `A foggy start in ${city} this morning — visibility is low and the city has acquired an air of mystery it didn't ask for. ${t}°C on the thermometer.`,
        quip: "The city has entered stealth mode. Drive like it.",
      },
      night: {
        condition: "Fog",
        narrative: (city, t) =>
          `Fog is settling over ${city} tonight and the headlights are doing all the work. ${t}°C and murky.`,
        quip: "Low beams, slow speeds, no heroics.",
      },
    };
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    const showers = code >= 80;
    return {
      day: {
        condition: showers ? "Rain showers" : "Rain",
        narrative: showers
          ? (city, t) =>
              `Scattered showers rolling through ${city} — the unpredictable kind that wait for you to put away your umbrella. ${t}°C and unsettled.`
          : (city, t) =>
              `Wet underfoot in ${city} today — steady rain arriving with the confidence of a guest who wasn't invited. ${t}°C and grey.`,
        quip: showers ? "The umbrella you left at home sends its regards." : "The rain isn't sorry about your shoes.",
      },
      night: {
        condition: showers ? "Night showers" : "Rain tonight",
        narrative: (city, t) =>
          `Rain on the windows in ${city} tonight, ${t}°C. Good sleeping weather, bad weather for the drive home.`,
        quip: "Nature's white noise machine is on.",
      },
    };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return {
      day: {
        condition: code >= 85 ? "Snow showers" : "Snow",
        narrative: (city, t) =>
          `Snow is falling over ${city}, quieting the city in that particular way only snow manages. ${t}°C — dress accordingly.`,
        quip: "Everything is technically a snowflake today.",
      },
      night: {
        condition: "Snow tonight",
        narrative: (city, t) =>
          `Snow falling on ${city} in the dark, ${t}°C. Tomorrow's commute is already a problem.`,
        quip: "Quietest night of the year, probably.",
      },
    };
  }
  if (code >= 95) {
    return {
      day: {
        condition: "Thunderstorm",
        narrative: (city, t) =>
          `Thunder's rolling through ${city} today — the sky is having feelings, loudly. ${t}°C and very much not the day for an outdoor meeting.`,
        quip: "The sky's throwing a tantrum. Close the windows.",
      },
      night: {
        condition: "Night storm",
        narrative: (city, t) =>
          `A thunderstorm over ${city} tonight, ${t}°C, with lightning doing the lighting. Charge your phone in case the power blinks.`,
        quip: "Free light show. Mind the power cuts.",
      },
    };
  }
  return {
    day: {
      condition: "Overcast",
      narrative: (city, t) =>
        `An overcast day in ${city}, the cloud cover thick enough to make it feel like the afternoon started at noon. ${t}°C and uninspiring.`,
      quip: "The cloud cover is doing its best impression of a Monday.",
    },
    night: {
      condition: "Overcast night",
      narrative: (city, t) =>
        `A blanket of cloud over ${city} tonight, ${t}°C. No stars, no moon, no drama.`,
      quip: "The sky has drawn the curtains.",
    },
  };
}

function aqiLabel(usAqi: number): string {
  if (usAqi <= 50) return "Good";
  if (usAqi <= 100) return "Moderate";
  if (usAqi <= 150) return "Unhealthy (sensitive)";
  if (usAqi <= 200) return "Unhealthy";
  if (usAqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

// Open-Meteo returns the city's wall clock without an offset ("2026-09-27T06:08").
// Read the digits directly: going through Date would shift them into the
// device's time zone.
function formatClock(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

// Short-lived client-side cache (sessionStorage). The weather used to be
// fetched on every mount — three HTTP round trips (geocoding, forecast, air
// quality) for data that moves on a 15-minute scale at fastest. Keyed by
// city; "Refresh edition" clears it via clearWeatherCache().
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;
// v3: readings carry time blocks with rain chances.
const WEATHER_CACHE_PREFIX = "daily-index:weather:v3:";

function weatherStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readWeatherCache(key: string): WeatherNow | null {
  const s = weatherStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(WEATHER_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; weather?: WeatherNow };
    if (typeof parsed.at !== "number" || !parsed.weather) return null;
    if (Date.now() - parsed.at > WEATHER_CACHE_TTL_MS) return null;
    return parsed.weather;
  } catch {
    return null;
  }
}

function writeWeatherCache(key: string, weather: WeatherNow): void {
  const s = weatherStorage();
  if (!s) return;
  try {
    s.setItem(WEATHER_CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), weather }));
  } catch {
    // Storage full / private mode — weather simply re-fetches next mount.
  }
}

/** "Refresh edition" purge — next mount re-reads the sky from scratch. */
export function clearWeatherCache(): void {
  const s = weatherStorage();
  if (!s) return;
  try {
    const drop: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith("daily-index:weather:")) drop.push(k);
    }
    drop.forEach((k) => s.removeItem(k));
  } catch {
    // ignore
  }
}

/** Weather for a city name: geocoded by Open-Meteo, then read at its coordinates. */
export async function getLiveWeather(city: string): Promise<WeatherNow | null> {
  const cacheKey = city.trim().toLowerCase();
  const cached = readWeatherCache(cacheKey);
  if (cached) return cached;
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
    );
    if (!geoRes.ok) return null;
    const geo = await geoRes.json();
    const place = geo.results?.[0];
    if (!place) return null;
    const weather = await readSky(place.latitude, place.longitude, place.name);
    if (weather) writeWeatherCache(cacheKey, weather);
    return weather;
  } catch {
    return null;
  }
}

/** Weather where the reader is (travel mode): coordinates from the browser. */
export async function getWeatherAt(lat: number, lon: number, name: string): Promise<WeatherNow | null> {
  const cacheKey = `@${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = readWeatherCache(cacheKey);
  if (cached) return cached;
  try {
    const weather = await readSky(lat, lon, name);
    if (weather) writeWeatherCache(cacheKey, weather);
    return weather;
  } catch {
    return null;
  }
}

// The day in four blocks. Night runs 21:00 → 06:00 across midnight.
const BLOCKS: Array<{ label: string; from: number; to: number }> = [
  { label: "Morning", from: 6, to: 12 },
  { label: "Afternoon", from: 12, to: 17 },
  { label: "Evening", from: 17, to: 21 },
  { label: "Night", from: 21, to: 30 },
];

interface Hourly {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: (number | null)[];
  weather_code: number[];
}

/**
 * The next four blocks from now — the current one first — each with its
 * highest chance of rain, its temperature range and the weather code of its
 * wettest hour. Hours are the city's wall clock ("2026-09-28T14:00").
 */
function timeBlocks(hourly: Hourly | undefined, nowLocal: string): WeatherBlock[] {
  if (!hourly?.time?.length) return [];
  const start = Math.max(0, hourly.time.findIndex((t) => t.slice(0, 13) === nowLocal.slice(0, 13)));

  // Each upcoming hour joins the block it falls in; hours before 06:00
  // belong to the previous evening's night. Consecutive hours in the same
  // block form one group.
  const groups: Array<{ block: (typeof BLOCKS)[number]; idxs: number[] }> = [];
  for (let i = start; i < hourly.time.length && groups.length <= 4; i++) {
    const hour = Number(hourly.time[i].slice(11, 13));
    const h = hour < 6 ? hour + 24 : hour;
    const block = BLOCKS.find((x) => h >= x.from && h < x.to) ?? BLOCKS[3];
    const last = groups.at(-1);
    if (last && last.block === block) last.idxs.push(i);
    else groups.push({ block, idxs: [i] });
  }

  return groups.slice(0, 4).map(({ block, idxs }, n) => {
    const rain = idxs.map((i) => hourly.precipitation_probability[i] ?? 0);
    const temps = idxs.map((i) => hourly.temperature_2m[i]);
    const wettest = idxs[rain.indexOf(Math.max(...rain))];
    return {
      label: n === 0 ? (block.label === "Night" ? "Tonight" : `This ${block.label.toLowerCase()}`) : block.label,
      from: `${String(block.from % 24).padStart(2, "0")}:00`,
      to: `${String(block.to % 24).padStart(2, "0")}:00`,
      rainPct: Math.round(Math.max(...rain)),
      tempMin: Math.round(Math.min(...temps)),
      tempMax: Math.round(Math.max(...temps)),
      weatherCode: hourly.weather_code[wettest] ?? 0,
      night: block.label === "Night" || block.label === "Evening",
    };
  });
}

async function readSky(latitude: number, longitude: number, name: string): Promise<WeatherNow | null> {
  const [forecastRes, airRes] = await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day&hourly=temperature_2m,precipitation_probability,weather_code&daily=sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=2&timezone=auto`,
    ),
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi`,
    ),
  ]);
  if (!forecastRes.ok) return null;
  const forecast = await forecastRes.json();
  const air = airRes.ok ? await airRes.json() : null;

  const tempC = Math.round(forecast.current.temperature_2m);
  const code: number = forecast.current.weather_code;
  const mood = moodForCode(code);
  const usAqi = air?.current?.us_aqi ?? null;

  const round = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);
  return {
    city: name,
    condition: mood.day.condition,
    weatherCode: code,
    tempC,
    narrative: mood.day.narrative(name, tempC),
    quip: mood.day.quip,
    sunrise: formatClock(forecast.daily.sunrise[0]),
    sunset: formatClock(forecast.daily.sunset[0]),
    uvIndex: Math.round(forecast.daily.uv_index_max[0] ?? 0),
    aqi: usAqi ?? 0,
    aqiLabel: usAqi != null ? aqiLabel(usAqi) : "Unavailable",
    tempMin: round(forecast.daily.temperature_2m_min?.[0]),
    tempMax: round(forecast.daily.temperature_2m_max?.[0]),
    rainChance: round(forecast.daily.precipitation_probability_max?.[0]),
    feelsLikeC: round(forecast.current.apparent_temperature),
    humidity: round(forecast.current.relative_humidity_2m),
    isDay: forecast.current.is_day === 1,
    utcOffsetSeconds: typeof forecast.utc_offset_seconds === "number" ? forecast.utc_offset_seconds : undefined,
    blocks: timeBlocks(forecast.hourly, forecast.current.time ?? ""),
    latitude,
    longitude,
    night: {
      condition: mood.night.condition,
      narrative: mood.night.narrative(name, tempC),
      quip: mood.night.quip,
    },
  };
}
