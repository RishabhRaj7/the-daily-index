"use client";

import { useSyncExternalStore } from "react";
import type { WeatherNow } from "@/lib/types";
import { cityMinutes, skyClock, type SkyClock } from "./sky";

// Ticks once a minute (and on returning to the tab) so the sun — or the
// moon — keeps moving while the page is open.
function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 60_000);
  const onVisible = () => document.visibilityState === "visible" && cb();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
const minuteNow = () => Math.floor(Date.now() / 60_000);

/** The city's clock, live on the client; null while server rendering. */
export function useSkyClock(weather: WeatherNow | null | undefined): SkyClock | null {
  const minute = useSyncExternalStore(subscribe, minuteNow, () => null);
  if (!weather || minute === null) return null;
  return skyClock(weather, cityMinutes(weather.utcOffsetSeconds, minute * 60_000));
}
