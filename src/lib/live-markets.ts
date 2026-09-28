"use client";

import { useEffect, useRef } from "react";
import type { LiveMarkets } from "@/lib/live/indices";

const POLL_MS = 60_000;

/**
 * Keep the index tiles live: poll /api/markets every minute while the page
 * is visible, and once straight away when the reader comes back to the tab.
 * Failures are ignored — the last numbers simply stay up.
 */
export function useLiveMarkets(
  enabled: boolean,
  onUpdate: (markets: LiveMarkets & { at: string }) => void,
) {
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
      }, POLL_MS);
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
