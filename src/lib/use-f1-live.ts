"use client";

import { useEffect, useRef, useState } from "react";
import type { F1Session } from "@/lib/types";
import type { LiveAnswer, LiveSnapshot } from "@/lib/f1-live-types";

// The live session, polled. The Pit wall only asks inside a session's window
// (from its timetable: a little before the start to half an hour after the
// end), so on the other six days of the week it makes no request at all;
// /f1/live asks whenever it is open. Every 5 s while the tab is visible,
// paused while hidden, caught up on return.

const POLL_MS = 5_000;
const BEFORE_MS = 15 * 60_000;
const AFTER_MS = 45 * 60_000;

/** The session whose window holds `now`, else when the next window opens. */
export function liveWindow(sessions: F1Session[] | undefined, now = Date.now()): { open: boolean; opensAt: number | null } {
  let opensAt: number | null = null;
  for (const s of sessions ?? []) {
    const start = Date.parse(s.start) - BEFORE_MS;
    const end = Date.parse(s.end || s.start) + AFTER_MS;
    if (now >= start && now <= end) return { open: true, opensAt: null };
    if (start > now && (opensAt === null || start < opensAt)) opensAt = start;
  }
  return { open: false, opensAt };
}

export function useF1Live(opts: { sessions?: F1Session[]; full?: boolean; always?: boolean }): {
  snapshot: LiveSnapshot | null;
  next: string | null;
  checked: boolean;
} {
  const { sessions, full = false, always = false } = opts;
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const key = JSON.stringify(sessions?.map((s) => [s.start, s.end]) ?? []);
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let stopped = false;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(tick, Math.min(ms, 2 ** 31 - 1));
    };

    async function tick() {
      if (stopped) return;
      if (document.visibilityState !== "visible") return; // resumed by the visibility listener
      // ?f1replay=<archive path> (development): replay a finished session.
      const replay = process.env.NODE_ENV !== "production" ? new URLSearchParams(location.search).get("f1replay") : null;
      const win = always || replay ? { open: true, opensAt: null } : liveWindow(sessionsRef.current);
      if (!win.open) {
        setSnapshot(null);
        setChecked(true);
        if (win.opensAt) schedule(win.opensAt - Date.now() + 1000);
        return;
      }
      controller?.abort();
      controller = new AbortController();
      try {
        const q = new URLSearchParams({ ...(full ? { full: "1" } : {}), ...(replay ? { replay } : {}) });
        const res = await fetch(`/api/f1/live${q.size ? `?${q}` : ""}`, { cache: "no-store", signal: controller.signal });
        const answer = (await res.json()) as LiveAnswer;
        if (stopped) return;
        if (answer.live) setSnapshot(answer.snapshot);
        else {
          setSnapshot(null);
          setNext(answer.next);
        }
      } catch {
        // Keep the last snapshot through a dropped request.
      }
      setChecked(true);
      schedule(POLL_MS);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    schedule(0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, full, always]);

  return { snapshot, next, checked };
}

/** Time left on the session clock, ticking between reads. */
export function clockLeft(s: Pick<LiveSnapshot, "remaining" | "clockAt" | "clockRunning">, now = Date.now()): string | null {
  if (!s.remaining) return null;
  const [h, m, sec] = s.remaining.split(":").map(Number);
  let left = ((h || 0) * 3600 + (m || 0) * 60 + (sec || 0)) * 1000;
  if (s.clockRunning && s.clockAt) left -= Math.max(0, now - Date.parse(s.clockAt));
  left = Math.max(0, left);
  const t = Math.floor(left / 1000);
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = t % 60;
  return hh > 0 ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
}
