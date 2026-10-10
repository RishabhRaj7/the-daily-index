"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSnapshot } from "@/lib/f1-live-types";
import type { FlagTone, ReplayTimeline } from "@/lib/live/f1-replay";

// A finished session, played back. The page asks the server for the session
// as it stood at the replay clock (F1's archive, rebuilt change by change —
// lib/live/f1-replay.ts) every second and a half, and everything on the page
// — timing, the cars on the map, race control, radio, the race story — moves
// as it did on the day. The bar along the foot of the screen: play/pause,
// the clock, a track coloured by the flags (with qualifying's parts and every
// tenth lap marked) to drag along, and speeds from 1× to 30×.

const FETCH_MS = 1500;
const SPEEDS = [1, 2, 5, 10, 30];

export interface Replay {
  snap: LiveSnapshot | null;
  timeline: ReplayTimeline | null;
  t: number;
  playing: boolean;
  speed: number;
  toggle: () => void;
  seek: (t: number) => void;
  setSpeed: (s: number) => void;
}

export function useReplay(path: string | null): Replay {
  // Both tagged with their session, so a new one starts blank without a reset.
  const [line, setLine] = useState<{ path: string; timeline: ReplayTimeline } | null>(null);
  const [read_, setRead] = useState<{ path: string; snap: LiveSnapshot } | null>(null);
  const timeline = line && line.path === path ? line.timeline : null;
  const snap = read_ && read_.path === path ? read_.snap : null;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeedState] = useState(1);
  // The replay clock: session time `t` at browser time `at`, running at `rate`.
  const clock = useRef({ t: 0, at: 0, rate: 1 });
  const end = useRef(Infinity);
  const busy = useRef(false);
  const pathRef = useRef(path);

  const now = () => {
    const c = clock.current;
    return Math.min(end.current, c.t + ((Date.now() - c.at) / 1000) * c.rate);
  };

  const read = useCallback(async (withTimeline = false) => {
    const p = pathRef.current;
    if (!p || busy.current) return;
    busy.current = true;
    try {
      const at = Math.round(now() * 10) / 10;
      const q = new URLSearchParams({ session: p, t: String(at), full: "1", ...(withTimeline ? { timeline: "1" } : {}) });
      const res = await fetch(`/api/f1/live?${q}`, { cache: "no-store" });
      const d = (await res.json()) as { live: boolean; snapshot?: LiveSnapshot; timeline?: ReplayTimeline | null };
      if (p !== pathRef.current) return;
      if (d.timeline) {
        setLine({ path: p, timeline: d.timeline });
        end.current = d.timeline.end;
      }
      if (d.live && d.snapshot) {
        const s = d.snapshot;
        // The state is for the clock when the request left; carried on from there.
        const age = s.servedAt ? Math.max(0, Date.parse(s.servedAt) - Date.parse(s.at)) : 0;
        setRead({ path: p, snap: { ...s, localAt: Date.now() - age, replaySpeed: clock.current.rate, clockRunning: false } });
      }
    } catch {
      // A dropped read: the next one catches up.
    } finally {
      busy.current = false;
    }
  }, []);

  // A new session: read its shape, start a minute before the lights.
  useEffect(() => {
    pathRef.current = path;
    if (!path) return;
    let stop = false;
    (async () => {
      const q = new URLSearchParams({ session: path, t: "0", timeline: "1", full: "1" });
      const d = (await fetch(`/api/f1/live?${q}`)
        .then((r) => r.json())
        .catch(() => null)) as { timeline?: ReplayTimeline | null } | null;
      if (stop || !d?.timeline) return;
      setLine({ path, timeline: d.timeline });
      end.current = d.timeline.end;
      clock.current = { t: d.timeline.start, at: Date.now(), rate: 1 };
      setPlaying(true);
      setSpeedState(1);
      setT(d.timeline.start);
      void read();
    })();
    return () => {
      stop = true;
    };
  }, [path, read]);

  // The clock on screen, and a read every second and a half while playing.
  useEffect(() => {
    if (!path || !timeline) return;
    const tick = setInterval(() => {
      const cur = now();
      setT(cur);
      if (cur >= end.current && clock.current.rate > 0) {
        clock.current = { t: end.current, at: Date.now(), rate: 0 };
        setPlaying(false);
      }
    }, 250);
    const poll = setInterval(() => {
      if (clock.current.rate > 0 && document.visibilityState === "visible") void read();
    }, FETCH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [path, timeline, read]);

  const rebase = (rate: number, t0 = now()) => {
    clock.current = { t: t0, at: Date.now(), rate };
  };
  // The clock itself says whether it runs, and how fast (state can lag a click).
  const speedNow = () => clock.current.rate || speed;
  const toggle = () => {
    const on = clock.current.rate === 0;
    const s = speedNow();
    // Played to the end: Play starts again.
    rebase(on ? s : 0, on && now() >= end.current - 1 && timeline ? timeline.start : now());
    setPlaying(on);
    setRead((r) => (r ? { ...r, snap: { ...r.snap, replaySpeed: on ? s : 0 } } : r));
    void read();
  };
  const seek = (to: number) => {
    rebase(clock.current.rate, Math.max(timeline?.start ?? 0, Math.min(end.current, to)));
    setT(clock.current.t);
    busy.current = false;
    void read();
  };
  const setSpeed = (s: number) => {
    setSpeedState(s);
    if (clock.current.rate > 0) {
      rebase(s);
      setRead((r) => (r ? { ...r, snap: { ...r.snap, replaySpeed: s } } : r));
    }
  };
  return { snap, timeline, t, playing, speed, toggle, seek, setSpeed };
}

const FLAG: Record<FlagTone, string> = {
  green: "var(--f1-personal)",
  yellow: "var(--f1-slower)",
  sc: "#ff9f1a",
  vsc: "#ffc94d",
  red: "var(--down)",
};

const hms = (s: number) => {
  const v = Math.max(0, Math.floor(s));
  return `${String(Math.floor(v / 3600)).padStart(2, "0")}:${String(Math.floor((v % 3600) / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

export default function ReplayBar({ replay, onClose }: { replay: Replay; onClose: () => void }) {
  const { timeline, t, playing, speed } = replay;
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDragState] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const setDrag = (v: number | null) => {
    dragRef.current = v;
    setDragState(v);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === " ") {
        e.preventDefault();
        replay.toggle();
      } else if (e.key === "ArrowRight") replay.seek(t + 10 * Math.max(1, speed));
      else if (e.key === "ArrowLeft") replay.seek(t - 10 * Math.max(1, speed));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!timeline) {
    return (
      <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-[min(1200px,calc(100%-1.5rem))] glass border hairline rounded-2xl px-4 py-3 font-mono text-[11px] shimmer-text">
        Fetching the session from F1&rsquo;s archive…
      </div>
    );
  }
  const span = timeline.end - timeline.start || 1;
  const x = (s: number) => Math.min(100, Math.max(0, ((s - timeline.start) / span) * 100));
  const shown = drag ?? t;
  const lap = [...timeline.laps].reverse().find((l) => l.t <= shown)?.lap;
  const total = timeline.laps.length ? Math.max(...timeline.laps.map((l) => l.lap)) : null;
  const part = [...timeline.parts].reverse().find((p) => p.t <= shown)?.label;

  const at = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    return timeline.start + Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * span;
  };

  // Flag stretches across the session.
  const bands = timeline.flags
    .map((f, i) => ({ from: Math.max(f.t, timeline.start), to: Math.min(timeline.flags[i + 1]?.t ?? timeline.end, timeline.end), tone: f.tone }))
    .filter((b) => b.to > b.from);
  const lapTicks = timeline.laps.filter((l) => l.lap > 1 && l.lap % 10 === 0 && l.t >= timeline.start);

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-[min(1200px,calc(100%-1.5rem))] glass border hairline rounded-2xl shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] px-3 sm:px-4 py-2.5 animate-[sheet-up_0.35s_var(--ease-out)]"
      role="region"
      aria-label="Replay"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={replay.toggle}
          className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-white"
          style={{ background: "var(--hue-f1)" }}
          aria-label={playing ? "Pause the replay" : "Play the replay"}
        >
          {playing ? (
            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" aria-hidden="true">
              <rect x="2.5" y="2" width="2.6" height="8" rx="0.6" />
              <rect x="6.9" y="2" width="2.6" height="8" rx="0.6" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" className="w-3 h-3 ml-[2px]" fill="currentColor" aria-hidden="true">
              <path d="M3 1.8v8.4c0 .5.5.8.9.5l6.4-4.2c.4-.3.4-.8 0-1.1L3.9 1.3c-.4-.3-.9 0-.9.5z" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 font-mono text-[10.5px] tabular-nums">
            <span className="flex items-center gap-2 min-w-0">
              <span className="font-label text-[8.5px]" style={{ color: "var(--hue-f1)" }}>
                Replay
              </span>
              <span className="text-ink">{hms(shown - timeline.start)}</span>
              <span className="text-ink-faint hidden sm:inline">/ {hms(span)}</span>
              {lap && total ? <span className="text-ink-soft truncate">· Lap {lap}/{total}</span> : part ? <span className="text-ink-soft">· {part}</span> : null}
            </span>
            <span className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => replay.setSpeed(s)}
                  className={`rounded-md px-1.5 h-6 font-mono text-[10.5px] font-semibold transition-colors ${speed === s ? "text-[color:var(--paper)]" : "text-ink-soft hover:text-ink"} ${s === 2 || s === 10 ? "hidden sm:block" : ""}`}
                  style={speed === s ? { background: "var(--ink)" } : undefined}
                  aria-pressed={speed === s}
                >
                  {s}×
                </button>
              ))}
              <button type="button" onClick={onClose} className="ml-1 w-6 h-6 grid place-items-center rounded-md text-ink-soft hover:text-ink" aria-label="Leave the replay">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </span>
          </div>
          {/* the session: flags along it, parts and laps marked; drag to go anywhere */}
          <div
            ref={track}
            className="relative h-5 mt-1.5 cursor-pointer touch-none select-none"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              setDrag(at(e.clientX));
            }}
            onPointerMove={(e) => dragRef.current !== null && setDrag(at(e.clientX))}
            onPointerUp={(e) => {
              if (dragRef.current === null) return;
              replay.seek(at(e.clientX));
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
            role="slider"
            aria-label="Replay position"
            aria-valuemin={0}
            aria-valuemax={Math.round(span)}
            aria-valuenow={Math.round(shown - timeline.start)}
            aria-valuetext={hms(shown - timeline.start)}
            tabIndex={0}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[5px] rounded-full overflow-hidden bg-[var(--rule)]">
              {bands.map((b, i) => (
                <span key={i} className="absolute inset-y-0" style={{ left: `${x(b.from)}%`, width: `${x(b.to) - x(b.from)}%`, background: FLAG[b.tone], opacity: b.tone === "green" ? 0.55 : 0.95 }} />
              ))}
              <span className="absolute inset-y-0 left-0 bg-[var(--ink)] opacity-25" style={{ width: `${x(shown)}%` }} />
            </div>
            {timeline.parts.map((p) => (
              <span key={p.label} className="absolute top-0 bottom-0 w-px bg-[var(--ink-soft)]" style={{ left: `${x(p.t)}%` }} title={p.label} />
            ))}
            {lapTicks.map((l) => (
              <span key={l.lap} className="absolute top-[3px] bottom-[3px] w-px bg-[var(--ink-faint)]" style={{ left: `${x(l.t)}%` }} title={`Lap ${l.lap}`} />
            ))}
            <span
              className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--paper)] shadow"
              style={{ left: `${x(shown)}%`, background: "var(--hue-f1)", transition: drag === null ? "left 0.25s linear" : undefined }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
