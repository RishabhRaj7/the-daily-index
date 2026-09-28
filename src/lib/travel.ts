// Travel mode, client side. Tapping "Use my location" asks the browser for
// the reader's position once; the rounded coordinates are kept on this
// device (localStorage) with the last news for that place, so a reload does
// not ask again. "I'm home" forgets all of it.

import type { WireBrief } from "@/lib/types";

const STORAGE_KEY = "daily-index:travel";
export const TRAVEL_CHANGED_EVENT = "daily-index:travel-changed";
/** News for the place is re-read when older than this. */
const NEWS_TTL_MS = 60 * 60 * 1000;

export interface TravelPlace {
  city: string;
  region: string | null;
  country: string;
  countryCode: string;
  /** The wider area its second list covers: the country, or the state in India. */
  wide: string;
  lat: number;
  lon: number;
}

export interface TravelState {
  place: TravelPlace;
  city: WireBrief[];
  area: WireBrief[];
  /** When the news was read. */
  at: string;
}

export function loadTravel(): TravelState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TravelState;
    return parsed?.place && Array.isArray(parsed.city) ? parsed : null;
  } catch {
    return null;
  }
}

function save(state: TravelState | null) {
  try {
    if (state) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: travel mode lasts until the tab closes.
  }
  window.dispatchEvent(new Event(TRAVEL_CHANGED_EVENT));
}

export function clearTravel() {
  save(null);
}

export function travelIsStale(state: TravelState): boolean {
  return Date.now() - Date.parse(state.at) > NEWS_TTL_MS;
}

async function fetchPlace(lat: number, lon: number): Promise<TravelState> {
  const res = await fetch("/api/travel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lon }),
  });
  if (!res.ok) throw new Error(res.status === 404 ? "We couldn’t tell which place that is." : "The news desk didn’t answer.");
  return (await res.json()) as TravelState;
}

/** Ask the browser where the reader is, then read that place's news. */
export function locateAndLoad(): Promise<TravelState> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser can’t share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          // ~1 km is plenty for a city's news and weather.
          const lat = Math.round(pos.coords.latitude * 100) / 100;
          const lon = Math.round(pos.coords.longitude * 100) / 100;
          const state = await fetchPlace(lat, lon);
          save(state);
          resolve(state);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Something went wrong."));
        }
      },
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission was declined. Allow it in the browser to use travel mode."
              : "Your location couldn’t be found right now.",
          ),
        ),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/** Re-read the news for the saved place, without asking for the location again. */
export async function refreshTravel(state: TravelState): Promise<TravelState> {
  const next = await fetchPlace(state.place.lat, state.place.lon);
  save(next);
  return next;
}
