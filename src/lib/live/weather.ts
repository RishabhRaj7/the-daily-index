import type { WeatherNow } from "@/lib/types";

interface WeatherMood {
  condition: string;
  narrative: (city: string, tempC: number) => string;
  quip: string;
}

// WMO weather codes: https://open-meteo.com/en/docs
function moodForCode(code: number): WeatherMood {
  if (code === 0) {
    return {
      condition: "Clear sky",
      narrative: (city, t) =>
        `Clear skies over ${city} today, with the mercury sitting at ${t}°C. A rare gift — try not to spend it entirely indoors.`,
      quip: "Perfect weather for having strong opinions about sunglasses.",
    };
  }
  if (code <= 3) {
    return {
      condition: "Partly cloudy",
      narrative: (city, t) =>
        `A mix of sun and cloud over ${city} today, hovering around ${t}°C. The clouds are doing their best to stay relevant.`,
      quip: "The sky can't make up its mind. Honestly, relatable.",
    };
  }
  if (code === 45 || code === 48) {
    return {
      condition: "Fog",
      narrative: (city, t) =>
        `A foggy start in ${city} this morning — visibility is low and the city has acquired an air of mystery it didn't ask for. ${t}°C on the thermometer.`,
      quip: "The city has entered stealth mode. Drive like it.",
    };
  }
  if (code >= 51 && code <= 67) {
    return {
      condition: "Rain",
      narrative: (city, t) =>
        `Wet underfoot in ${city} today — steady rain arriving with the confidence of a guest who wasn't invited. ${t}°C and grey.`,
      quip: "The rain isn't sorry about your shoes.",
    };
  }
  if (code >= 71 && code <= 77) {
    return {
      condition: "Snow",
      narrative: (city, t) =>
        `Snow is falling over ${city}, quieting the city in that particular way only snow manages. ${t}°C — dress accordingly.`,
      quip: "Everything is technically a snowflake today.",
    };
  }
  if (code >= 80 && code <= 82) {
    return {
      condition: "Rain showers",
      narrative: (city, t) =>
        `Scattered showers rolling through ${city} — the unpredictable kind that wait for you to put away your umbrella. ${t}°C and unsettled.`,
      quip: "The umbrella you left at home sends its regards.",
    };
  }
  if (code >= 85 && code <= 86) {
    return {
      condition: "Snow showers",
      narrative: (city, t) =>
        `Snow showers over ${city} today, the flurries coming and going on their own schedule. ${t}°C — layers are not optional.`,
      quip: "The sky is apparently in its experimental phase.",
    };
  }
  if (code >= 95) {
    return {
      condition: "Thunderstorm",
      narrative: (city, t) =>
        `Thunder's rolling through ${city} today — the sky is having feelings, loudly. ${t}°C and very much not the day for an outdoor meeting.`,
      quip: "The sky's throwing a tantrum. Close the windows.",
    };
  }
  return {
    condition: "Overcast",
    narrative: (city, t) =>
      `An overcast day in ${city}, the cloud cover thick enough to make it feel like the afternoon started at noon. ${t}°C and uninspiring.`,
    quip: "The cloud cover is doing its best impression of a Monday.",
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

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function getLiveWeather(city: string): Promise<WeatherNow | null> {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
    );
    if (!geoRes.ok) return null;
    const geo = await geoRes.json();
    const place = geo.results?.[0];
    if (!place) return null;
    const { latitude, longitude, name } = place;

    const [forecastRes, airRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=sunrise,sunset,uv_index_max&timezone=auto`,
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

    return {
      city: name,
      condition: mood.condition,
      weatherCode: code,
      tempC,
      narrative: mood.narrative(name, tempC),
      quip: mood.quip,
      sunrise: formatClock(forecast.daily.sunrise[0]),
      sunset: formatClock(forecast.daily.sunset[0]),
      uvIndex: Math.round(forecast.daily.uv_index_max[0]),
      aqi: usAqi ?? 0,
      aqiLabel: usAqi != null ? aqiLabel(usAqi) : "Unavailable",
    };
  } catch {
    return null;
  }
}
