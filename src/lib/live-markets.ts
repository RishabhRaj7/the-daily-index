"use client";

import { useEffect, useRef } from "react";
import type { LiveMarkets } from "@/lib/live/indices";
import { commoditiesLive, indexLive, type HolidayMap } from "@/lib/market-hours";

const POLL_MS = 60_000;
/** With every exchange and the commodity markets shut, only crypto moves. */
const QUIET_POLL_MS = 10 * 60_000;

/**
 * Keep the index tiles live: poll /api/markets every minute while any
 * market is trading (every ten while only crypto trades), and once straight
 * away when the reader comes back to the tab. Failures are ignored — the
 * last numbers simply stay up. The caller keeps closed markets' numbers
 * as they are (see mergeOpenMarkets).
 */
export function useLiveMarkets(
  enabled: boolean,
  onUpdate: (markets: LiveMarkets & { at: string }) => void,
  indexIds: string[] = [],
  holidays: HolidayMap = {},
) {
  const quietRef = useRef<() => boolean>(() => false);
  const idsKey = indexIds.join(",");
  useEffect(() => {
    const ids = idsKey.split(",").filter(Boolean);
    quietRef.current = () => {
      const now = Date.now();
      return !commoditiesLive(now) && !ids.some((id) => indexLive(id, now, holidays));
    };
  }, [idsKey, holidays]);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/markets", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.indices) && data.indices.length > 0) onUpdateRef.current(data);
      } catch {
        /* keep what is on screen */
      }
    };
    const loop = () => {
      timer = setTimeout(async () => {
        await tick();
        if (!cancelled) loop();
      }, quietRef.current() ? QUIET_POLL_MS : POLL_MS);
    };
    const onVisible = () => {
      if (!document.hidden) void tick();
    };

    loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}

/**
 * Fold a fresh reading into what is on screen, changing only what is
 * trading: an index whose exchange is shut (20 minutes' grace for the
 * closing print) keeps its numbers, and so does its region's mood;
 * commodities hold over the weekend; crypto always moves.
 */
export function mergeOpenMarkets<T extends {
  indices: LiveMarkets["indices"];
  moods?: LiveMarkets["moods"];
  commodities?: LiveMarkets["commodities"];
  crypto?: LiveMarkets["crypto"];
}>(prev: T, next: LiveMarkets, holidays: HolidayMap, now = Date.now()): LiveMarkets {
  const live = new Set(next.indices.filter((i) => indexLive(i.id, now, holidays)).map((i) => i.id));
  const prevIndex = new Map(prev.indices.map((i) => [i.id, i]));
  const indices = next.indices.map((i) => (live.has(i.id) ? i : (prevIndex.get(i.id) ?? i)));
  const regionLive = (region?: string) => next.indices.some((i) => i.market === region && live.has(i.id));
  const moods = next.moods.map((m) => (regionLive(m.region) ? m : (prev.moods?.find((p) => p.region === m.region) ?? m)));
  const commodities = commoditiesLive(now) || !prev.commodities?.length ? next.commodities : prev.commodities;
  return {
    ...next,
    indices,
    moods,
    mood: moods.find((m) => m.region === "India") ?? moods[0],
    commodities,
    crypto: next.crypto,
  };
}
