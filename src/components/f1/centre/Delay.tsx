"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LiveSnapshot } from "@/lib/f1-live-types";

// The timing held back to match what the reader hears or sees. F1's audio
// and TV pictures run some seconds behind the timing feed, so a pass or a
// stop shows here before it is heard. The delay (0–60 s, kept on this
// device) holds every live snapshot that long before the page shows it —
// the table, the map, the feed and the alerts alike. Live only.

const KEY = "f1-delay";
const listeners = new Set<() => void>();
const sub = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};
const read = () => {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) ? Math.max(0, Math.min(60, Math.round(v))) : 0;
  } catch {
    return 0;
  }
};
const write = (v: number) => {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {}
  listeners.forEach((fn) => fn());
};

/** The delay in seconds, as set on this device. */
export function useDelaySeconds(): number {
  return useSyncExternalStore(sub, read, () => 0);
}

/**
 * The snapshot as it stood `seconds` ago: every live snapshot is kept as it
 * arrives, and the one shown is the newest that's at least that old (the
 * oldest kept, while the buffer fills).
 */
export function useDelayed(snap: LiveSnapshot | null, seconds: number): LiveSnapshot | null {
  const buf = useRef<{ at: number; snap: LiveSnapshot }[]>([]);
  const [shown, setShown] = useState<LiveSnapshot | null>(snap);
  const latest = useRef(snap);

  useEffect(() => {
    latest.current = snap;
    if (!snap) {
      buf.current = [];
      return;
    }
    const b = buf.current;
    if (b.length && b[b.length - 1].snap.sessionKey !== snap.sessionKey) buf.current = [];
    buf.current.push({ at: Date.now(), snap });
  }, [snap]);

  useEffect(() => {
    const pick = () => {
      if (!seconds) {
        setShown(latest.current);
        buf.current = buf.current.slice(-1);
        return;
      }
      const due = Date.now() - seconds * 1000;
      const b = buf.current;
      let i = -1;
      for (let k = 0; k < b.length; k++) if (b[k].at <= due) i = k;
      // Older than needed: let go of them.
      if (i > 0) buf.current = b.slice(i);
      setShown(buf.current[0]?.snap ?? latest.current);
    };
    pick();
    const t = setInterval(pick, 500);
    return () => clearInterval(t);
  }, [seconds]);

  return seconds ? shown : snap;
}

/** The delay's button and its slider (next to the commentary). */
export function DelayControl() {
  const seconds = useDelaySeconds();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <span ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="chip h-8 text-[12px] gap-1.5"
        style={seconds ? { color: "var(--hue-f1)", borderColor: "color-mix(in srgb, var(--hue-f1) 45%, transparent)" } : undefined}
        title="Hold the timing back to match the commentary or TV"
        aria-expanded={open}
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8.5" r="5.5" />
          <path d="M8 5.5v3l2 1.5M6.5 1.5h3" />
        </svg>
        <span className="tabular-nums">{seconds ? `−${seconds} s` : <span className="hidden sm:inline">Delay</span>}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-[min(19rem,calc(100vw-2rem))] rounded-xl border hairline bg-[var(--paper)] shadow-xl p-3 font-sans text-[12px]">
          <div className="flex items-baseline justify-between">
            <span className="font-label text-[10px] text-ink-faint">Timing delay</span>
            <span className="font-mono text-[12px] font-semibold tabular-nums">{seconds} s</span>
          </div>
          <input type="range" min={0} max={60} step={1} value={seconds} onChange={(e) => write(Number(e.target.value))} className="w-full mt-2" aria-label="Seconds to hold the timing back" />
          <div className="flex gap-1.5 mt-2">
            {[-1, 1].map((d) => (
              <button key={d} type="button" className="chip h-7 text-[11px] tabular-nums" onClick={() => write(Math.max(0, Math.min(60, seconds + d)))}>
                {d < 0 ? "−1 s" : "+1 s"}
              </button>
            ))}
            <button type="button" className="chip h-7 text-[11px] ml-auto" onClick={() => write(0)}>
              Off
            </button>
          </div>
          <p className="text-[11px] text-ink-soft mt-2 leading-snug">
            Holds the table, map, feed and alerts back so they match what you hear. Line it up on a moment you can hear, a car crossing the line or a pit stop called. Kept on this device.
          </p>
        </div>
      )}
    </span>
  );
}
