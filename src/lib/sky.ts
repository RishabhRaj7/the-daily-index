// Day, night and the moon, computed on the reader's device. The weather is
// fetched at most every 15 minutes, but the sun keeps moving — so whether it
// is day or night is worked out from the clock, not from the fetch.

import type { WeatherNow } from "@/lib/types";

/** "6:08 AM" / "18:12" → minutes since midnight. */
export function parseClock(label: string): number | null {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/** Minutes since midnight on the city's own clock (falls back to the device's). */
export function cityMinutes(utcOffsetSeconds: number | undefined, at = Date.now()): number {
  if (typeof utcOffsetSeconds !== "number") {
    const d = new Date(at);
    return d.getHours() * 60 + d.getMinutes();
  }
  const d = new Date(at + utcOffsetSeconds * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export interface SkyClock {
  /** Minutes since midnight in the city. */
  now: number;
  rise: number;
  set: number;
  isDay: boolean;
  /** 0 at sunrise → 1 at sunset by day; 0 at sunset → 1 at sunrise by night. */
  progress: number;
  /** Length of the current stretch (daylight or darkness), in minutes. */
  span: number;
}

export function skyClock(weather: Pick<WeatherNow, "sunrise" | "sunset" | "utcOffsetSeconds">, now: number): SkyClock | null {
  const rise = parseClock(weather.sunrise);
  const set = parseClock(weather.sunset);
  if (rise === null || set === null || set <= rise) return null;
  const isDay = now >= rise && now < set;
  const day = set - rise;
  const night = 1440 - day;
  const progress = isDay ? (now - rise) / day : (((now - set) % 1440) + 1440) % 1440 / night;
  return { now, rise, set, isDay, progress: Math.min(1, Math.max(0, progress)), span: isDay ? day : night };
}

/** Day or night for a weather reading: the live clock when known, else the fetch. */
export function isNight(weather: WeatherNow, clock: SkyClock | null): boolean {
  if (clock) return !clock.isDay;
  return weather.isDay === false;
}

// ---- the moon ----------------------------------------------------------------

const SYNODIC = 29.530588853;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export interface MoonPhase {
  /** 0 new → 0.5 full → 1 new again. */
  phase: number;
  /** Lit fraction of the disc, 0..1. */
  illumination: number;
  name: string;
}

export function moonPhase(at = Date.now()): MoonPhase {
  const days = (at - KNOWN_NEW_MOON) / 86_400_000;
  const phase = (((days / SYNODIC) % 1) + 1) % 1;
  const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  // Full and new go by how the disc looks, not the exact instant.
  const name =
    illumination < 0.03
      ? "new moon"
      : illumination > 0.97
        ? "full moon"
        : phase < 0.22
          ? "waxing crescent"
          : phase < 0.28
            ? "first quarter"
            : phase < 0.5
              ? "waxing gibbous"
              : phase < 0.72
                ? "waning gibbous"
                : phase < 0.78
                  ? "last quarter"
                  : "waning crescent";
  return { phase, illumination, name };
}
