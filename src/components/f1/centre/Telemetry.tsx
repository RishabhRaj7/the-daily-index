"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CarNow, LapTrace, LiveSnapshot, TrackModel } from "@/lib/f1-live-types";
import { Empty } from "./ui";
import { clippingOn, cornerAfter, detectClipping, setClipping, type Clip } from "@/lib/f1-clipping";

const subStorage = (fn: () => void) => {
  window.addEventListener("storage", fn);
  return () => window.removeEventListener("storage", fn);
};
/** Whether clipping is marked (on unless switched off on this device). */
export function useClippingOn(): boolean {
  return useSyncExternalStore(subStorage, clippingOn, () => true);
}

// The followed driver's telemetry. Under the map, a speedometer in the
// driver's card (speed on the dial, throttle and brake on the inner arcs,
// revs, gear, DRS); a tap opens the detail: every reading as a gauge and the
// lap drawn out — speed as a line, the throttle as a band beneath it,
// braking marked in red.
//
//   replay    the lap in progress, played with the replay (F1's archive,
//             /api/f1/telemetry, asked a few seconds ahead)
//   finished  their fastest lap of the session, played on a loop
//   live      F1's latest reading with each 5-second read, and the last few
//             minutes of those readings as the line

type Sample = number[]; // [s, km/h, throttle %, brake 0/1, gear, rpm, drs 0/1]
const AHEAD = 4;

function useTrace(path: string | null, code: string | null, t: number | null): LapTrace | null {
  const [trace, setTrace] = useState<{ key: string; trace: LapTrace | null } | null>(null);
  // A replay asks again every couple of seconds of session time, for a few
  // seconds ahead, so the gauge can play on smoothly until the next answer.
  const step = t === null ? null : Math.floor(t / 2) * 2 + AHEAD;
  const key = `${path}|${code}|${step}`;
  useEffect(() => {
    if (!path || !code) return;
    let live = true;
    const q = new URLSearchParams({ session: path, code, ...(step !== null ? { t: String(step) } : {}) });
    fetch(`/api/f1/telemetry?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { trace: LapTrace | null } | null) => live && setTrace({ key, trace: d?.trace ?? null }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path, code, step, key]);
  // Keep the last trace on screen while the next is on its way (same driver).
  return trace && trace.key.split("|")[1] === code ? trace.trace : null;
}

/** Live: each read's reading for the driver, kept for the last few minutes. */
function useLiveHistory(snap: LiveSnapshot, code: string | null): Sample[] {
  const [hist, setHist] = useState<{ at: number; cars: Record<string, { at: number; r: CarNow }[]> }>({ at: 0, cars: {} });
  const at = Date.parse(snap.at);
  // A new read: add its readings (worked out while rendering, not in an effect).
  if (snap.telemetry && at !== hist.at) {
    const cars: Record<string, { at: number; r: CarNow }[]> = {};
    for (const [c, r] of Object.entries(snap.telemetry)) cars[c] = [...(hist.cars[c] ?? []), { at, r }].filter((x) => at - x.at < 4 * 60_000);
    setHist({ at, cars });
  }
  const list = (code && hist.cars[code]) || [];
  const start = list[0]?.at ?? at;
  return list.map((x) => [(x.at - start) / 1000, x.r.speed, x.r.throttle, x.r.brake ? 1 : 0, x.r.gear, x.r.rpm, x.r.drs === "open" ? 1 : 0]);
}

function Gauge({ label, value, unit, children }: { label: string; value: React.ReactNode; unit?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border hairline px-3 py-2 min-w-0">
      <div className="font-label text-[9px] text-ink-faint">{label}</div>
      <div className="font-display font-extrabold text-[1.45rem] leading-none mt-1 tabular-nums">
        {value}
        {unit && <span className="font-mono font-normal text-[10.5px] text-ink-soft ml-1">{unit}</span>}
      </div>
      {children}
    </div>
  );
}

function Bar({ value, colour }: { value: number; colour: string }) {
  return (
    <span className="block h-[5px] rounded-full mt-1.5 bg-[var(--rule)] overflow-hidden">
      <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: colour }} />
    </span>
  );
}

function Readout({ now, colour }: { now: CarNow; colour: string }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-2 gap-2">
      {/* (no DRS: gone in 2026, and its channel never opens) */}
      <Gauge label="Speed" value={now.speed} unit="km/h" />
      <Gauge label="Gear" value={now.gear || "N"} />
      <Gauge label="Revs" value={(now.rpm / 1000).toFixed(1)} unit="k rpm">
        <Bar value={(now.rpm / 13000) * 100} colour={colour} />
      </Gauge>
      <Gauge label="Throttle" value={now.throttle} unit="%">
        <Bar value={now.throttle} colour="var(--f1-personal)" />
      </Gauge>
      <Gauge label="Brake" value={<span style={{ color: now.brake ? "var(--down)" : "var(--ink-faint)" }}>{now.brake ? "On" : "Off"}</span>} />
    </div>
  );
}

function Chart({
  samples,
  colour,
  axis,
  hover,
  setHover,
  seekRef,
  clips = [],
}: {
  samples: Sample[];
  colour: string;
  axis: string;
  /** Where the car ran out of battery on a straight (amber bands). */
  clips?: Clip[];
  hover: number | null;
  setHover: (i: number | null) => void;
  /** Filled in here: moves the marker for where the gauges are (called every frame). */
  seekRef?: React.RefObject<((at: number) => void) | null>;
}) {
  const marker = useRef<SVGLineElement>(null);
  const W = 720;
  const H = 210;
  const pad = { l: 34, r: 8, t: 8, b: 22 };
  const band = 16; // the throttle band and the brake marks, under the speed
  const end = Math.max(1, samples.at(-1)?.[0] ?? 1);
  const top = Math.max(320, ...samples.map((s) => s[1]));
  const x = (s: number) => pad.l + (s / end) * (W - pad.l - pad.r);
  const speedH = H - pad.t - pad.b - band * 2 - 8;
  const y = (v: number) => pad.t + speedH - (v / top) * speedH;
  const line = samples.map((s, i) => `${i ? "L" : "M"}${x(s[0]).toFixed(1)},${y(s[1]).toFixed(1)}`).join("");
  const throttleY = pad.t + speedH + 6;
  const brakeY = throttleY + band + 2;
  const h = hover !== null ? (samples[hover] ?? null) : null;
  useEffect(() => {
    if (!seekRef) return;
    const span = W - pad.l - pad.r;
    seekRef.current = (at: number) => {
      const el = marker.current;
      if (!el) return;
      const px = (pad.l + (Math.min(at, end) / end) * span).toFixed(1);
      el.setAttribute("x1", px);
      el.setAttribute("x2", px);
    };
    return () => {
      seekRef.current = null;
    };
  }, [seekRef, end, pad.l, pad.r]);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full h-auto select-none"
      role="img"
      aria-label="Speed, throttle and braking through the lap"
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const s = ((e.clientX - box.left) / box.width) * W;
        const at = ((s - pad.l) / (W - pad.l - pad.r)) * end;
        let best = 0;
        samples.forEach((p, i) => {
          if (Math.abs(p[0] - at) < Math.abs(samples[best][0] - at)) best = i;
        });
        setHover(best);
      }}
      onPointerLeave={() => setHover(null)}
    >
      {[100, 200, 300].map((v) =>
        v <= top ? (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeDasharray="2 6" />
            <text x={pad.l - 6} y={y(v)} dy="0.35em" textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
              {v}
            </text>
          </g>
        ) : null,
      )}
      {/* clipping: flat out, but the speed falling */}
      {clips.map((c, i) => (
        <g key={i}>
          <rect x={x(c.at)} y={pad.t} width={Math.max(2, x(c.until) - x(c.at))} height={speedH} fill="var(--f1-investigation)" opacity="0.16" />
          <text x={x(c.at) + 3} y={pad.t + 10} fontSize="9.5" fontFamily="var(--font-mono)" fill="var(--f1-investigation)">
            {`−${c.drop}`}
          </text>
        </g>
      ))}
      <path d={line} fill="none" stroke={colour} strokeWidth="2.2" strokeLinejoin="round" />
      {/* throttle: a band that fills with the pedal */}
      <text x={pad.l - 6} y={throttleY + band / 2} dy="0.35em" textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
        THR
      </text>
      {samples.map((s, i) => {
        const next = samples[i + 1]?.[0] ?? s[0];
        const w = Math.max(0.8, x(next) - x(s[0]));
        return (
          <g key={i}>
            <rect x={x(s[0])} y={throttleY + band * (1 - s[2] / 100)} width={w} height={(band * s[2]) / 100} fill="var(--f1-personal)" opacity="0.75" />
            {s[3] ? <rect x={x(s[0])} y={brakeY} width={w} height={band * 0.6} fill="var(--down)" /> : null}
          </g>
        );
      })}
      <text x={pad.l - 6} y={brakeY + band * 0.3} dy="0.35em" textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
        BRK
      </text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
        {axis}
      </text>
      {/* where the gauges are in the lap */}
      {seekRef && <line ref={marker} x1={-10} x2={-10} y1={pad.t} y2={brakeY + band} stroke={colour} strokeWidth="1.5" strokeOpacity={h ? 0 : 0.8} pointerEvents="none" />}
      {h && (
        <g pointerEvents="none">
          <line x1={x(h[0])} x2={x(h[0])} y1={pad.t} y2={brakeY + band} stroke="var(--ink)" strokeOpacity="0.4" />
          <circle cx={x(h[0])} cy={y(h[1])} r="4" fill={colour} stroke="var(--paper)" strokeWidth="2" />
          <text
            x={Math.min(W - 150, x(h[0]) + 8)}
            y={pad.t + 12}
            fontSize="11"
            fontFamily="var(--font-mono)"
            fill="var(--ink)"
            stroke="var(--paper)"
            strokeWidth="4"
            paintOrder="stroke"
          >
            {`${h[0].toFixed(1)} s`}
          </text>
        </g>
      )}
    </svg>
  );
}

const toNow = (s: Sample): CarNow => ({ speed: s[1], throttle: s[2], brake: !!s[3], gear: s[4], rpm: s[5], drs: s[6] ? "open" : "off" });

/** The reading `at` seconds into the lap, blended between the two readings around it. */
function readingAt(samples: Sample[], at: number): CarNow | null {
  if (!samples.length) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid][0] <= at) lo = mid;
    else hi = mid - 1;
  }
  const a = samples[lo];
  const b = samples[lo + 1];
  if (!b || at <= a[0]) return toNow(a);
  const f = Math.min(1, (at - a[0]) / (b[0] - a[0] || 1));
  const mix = (k: number) => a[k] + (b[k] - a[k]) * f;
  return { speed: mix(1), throttle: mix(2), rpm: mix(5), brake: !!a[3], gear: a[4], drs: a[6] ? "open" : "off" };
}

/** How the gauges play a lap: the fastest on a loop, or the lap in progress with the replay. */
type Play = { kind: "loop"; samples: Sample[]; end: number } | { kind: "replay"; samples: Sample[]; end: number; asked: number; replayT: number; rate: number };

export interface Telemetry {
  now: CarNow | null;
  /** The lap so far (or the last few minutes, live). */
  samples: Sample[];
  axis: string;
  /** Where the readings come from, for the header. */
  source: string;
  /** What the gauges play between reads (nothing live: they ease to each reading). */
  play: Play | null;
}

/** The followed driver's telemetry, wherever the page is: live, a replay, or a finished session. */
export function useTelemetry(snap: LiveSnapshot, code: string | null, live: boolean, replayT: number | null): Telemetry {
  const archived = !live && !!snap.path;
  const trace = useTrace(archived ? snap.path : null, code, archived ? replayT : null);
  const history = useLiveHistory(snap, live ? code : null);

  // F1 sends car data only to a signed-in F1 TV account (F1TV_TOKEN on the server).
  const hasCars = Object.keys(snap.telemetry ?? {}).length > 0;
  if (live) {
    return { now: code ? (snap.telemetry?.[code] ?? null) : null, samples: history, axis: "Seconds, the last few minutes (a reading every 5 s)", source: hasCars ? "Live · a reading every 5 s" : "No car data · F1 shares it with F1 TV accounts only", play: null };
  }
  const all = trace?.samples ?? [];
  // No lap from F1's archive (it is closed to outside readers): a replay kept
  // from the live feed still carries each car's reading every 10 s or so.
  if (all.length < 2 && replayT !== null && code && snap.telemetry?.[code]) {
    return { now: snap.telemetry[code], samples: [], axis: "Seconds into the lap", source: "Replay · a reading every 10 s", play: null };
  }
  if (all.length < 2) {
    return { now: null, samples: [], axis: "Seconds into the lap", source: hasCars || replayT !== null ? "No car data kept for this moment" : "No lap trace · F1's archive is closed", play: null };
  }
  const end = all.at(-1)?.[0] ?? 0;
  if (replayT !== null) {
    // The answer runs a few seconds ahead of the replay: play up to where the replay is.
    const asked = Math.floor(replayT / 2) * 2 + AHEAD;
    const at = Math.max(0, end - (asked - replayT));
    return {
      now: readingAt(all, at) ?? trace?.now ?? null,
      samples: all.filter((x) => x[0] <= at),
      axis: "Seconds into the lap",
      source: `Lap ${trace?.lap ?? "—"}, as it's driven`,
      play: all.length > 1 ? { kind: "replay", samples: all, end, asked, replayT, rate: snap.replaySpeed ?? 1 } : null,
    };
  }
  return {
    now: readingAt(all, 0) ?? trace?.now ?? null,
    samples: all,
    axis: `Seconds into the lap${trace?.lapTime ? ` · ${trace.lapTime}` : ""}`,
    source: trace ? `Fastest lap, lap ${trace.lap}${trace.lapTime ? ` · ${trace.lapTime}` : ""}` : "Fastest lap",
    play: all.length > 1 ? { kind: "loop", samples: all, end } : null,
  };
}

const same = (a: CarNow, b: CarNow) =>
  Math.round(a.speed) === Math.round(b.speed) && Math.round(a.throttle) === Math.round(b.throttle) && Math.round(a.rpm / 20) === Math.round(b.rpm / 20) && a.gear === b.gear && a.brake === b.brake && a.drs === b.drs;

/**
 * What the gauges show, frame by frame: a lap played back is blended between
 * its readings (about four a second) at the display's own rate, and every
 * value eases towards where it should be — quickly when playing a lap,
 * more gently towards each live reading five seconds apart. Only the gauges
 * that use this redraw; `seekRef` moves a chart's marker along with them.
 */
function useSmooth(t: Telemetry, seekRef?: React.RefObject<((at: number) => void) | null>): CarNow | null {
  const [shown, setShown] = useState<CarNow | null>(null);
  const latest = useRef(t);
  useEffect(() => {
    latest.current = t;
  }, [t]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mark = { replayT: -1, wall: 0 };
    let cur: CarNow | null = null;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = latest.current;
      const p = t.play;
      let target = t.now;
      let at: number | null = null;
      if (p?.kind === "loop" && p.end > 0) {
        at = (now / 1000) % p.end;
        target = readingAt(p.samples, at);
      } else if (p?.kind === "replay") {
        // The replay's clock moves on between its updates (four a second): carry it on.
        if (mark.replayT !== p.replayT) {
          mark.replayT = p.replayT;
          mark.wall = now;
        }
        const tNow = p.replayT + Math.min(1, (now - mark.wall) / 1000) * p.rate;
        at = Math.max(0, Math.min(p.end, p.end - (p.asked - tNow)));
        target = readingAt(p.samples, at);
      }
      if (at !== null) seekRef?.current?.(at);
      if (target) {
        const k = reduced || !cur ? 1 : 1 - Math.exp(-dt / (p ? 0.06 : 0.35));
        const from: CarNow = cur ?? target;
        const next: CarNow = { ...target, speed: from.speed + (target.speed - from.speed) * k, rpm: from.rpm + (target.rpm - from.rpm) * k, throttle: from.throttle + (target.throttle - from.throttle) * k };
        cur = next;
        setShown((prev) => (prev && same(prev, next) ? prev : next));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [seekRef]);
  const v = shown ?? t.now;
  return v ? { ...v, speed: Math.round(v.speed), rpm: Math.round(v.rpm), throttle: Math.round(v.throttle) } : null;
}

// ---- the speedometer -----------------------------------------------------------

const TOP = 360;
// Angles in degrees, clockwise from pointing right (the screen's y runs down):
// the dial sweeps from bottom left (135) over the top to bottom right (405).
const polar = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)] as const;
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  return `M${x0.toFixed(1)},${y0.toFixed(1)}A${r},${r} 0 ${Math.abs(to - from) > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

/** The card's speedometer: the dial, played smoothly (a tap opens the detail); at rest once the session is over. */
export function Speedometer({ t, colour, code, onOpen, ended = false, className = "" }: { t: Telemetry; colour: string; code: string; onOpen?: () => void; ended?: boolean; className?: string }) {
  const now = useSmooth(ended ? { ...t, now: null, play: null } : t);
  return <Dial now={ended ? null : now} colour={colour} code={code} onOpen={onOpen} source={ended ? (t.play ? "Session ended · tap for the fastest lap" : "Session ended") : t.source} className={className} />;
}

/**
 * A speedometer: speed round the dial in the team's colour, throttle and
 * brake on the inner arcs. Everything has its own ring, so nothing overlaps:
 * the scale outside the dial; the throttle and brake arcs inside it, their
 * names just outside each arc; the speed, revs and gear in the middle, clear
 * of the arcs' ends.
 */
function Dial({ now, colour, code, onOpen, source, className = "" }: { now: CarNow | null; colour: string; code: string; onOpen?: () => void; source: string; className?: string }) {
  const cx = 110;
  const cy = 104;
  const R = 78; // the speed ring
  const r = 61; // the throttle and brake arcs
  const v = now?.speed ?? 0;
  const at = 135 + (Math.min(TOP, v) / TOP) * 270;
  const thr = now?.throttle ?? 0;
  const id = `speedo-${code}-${onOpen ? "card" : "sheet"}`;
  const body = (
    <svg viewBox="0 0 220 180" className="block w-full max-w-[17rem] max-h-full mx-auto h-auto" role="img" aria-label={now ? `${code}: ${v} km/h, gear ${now.gear}, throttle ${thr}%${now.brake ? ", braking" : ""}` : `${code}: no reading`}>
      <defs>
        {/* the arcs' names run just outside them (clockwise, so the letters stand outwards) */}
        <path id={`${id}-thr`} d={arc(cx, cy, r + 5, 152, 248)} />
        <path id={`${id}-brk`} d={arc(cx, cy, r + 5, 292, 388)} />
      </defs>
      {/* the dial, its ticks and the scale outside it */}
      <path d={arc(cx, cy, R, 135, 405)} fill="none" stroke="var(--rule)" strokeWidth="10" strokeLinecap="round" />
      {now && v > 0 && <path d={arc(cx, cy, R, 135, at)} fill="none" stroke={colour} strokeWidth="10" strokeLinecap="round" />}
      {[0, 60, 120, 180, 240, 300, 360].map((k) => {
        const a = 135 + (k / TOP) * 270;
        const [x1, y1] = polar(cx, cy, R + 7, a);
        const [x2, y2] = polar(cx, cy, R + 11, a);
        const [tx, ty] = polar(cx, cy, R + 22, a);
        return (
          <g key={k}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-faint)" strokeWidth="1.2" />
            <text x={tx} y={ty} dy="0.35em" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
              {k}
            </text>
          </g>
        );
      })}
      {/* throttle (left) and brake (right) */}
      <path d={arc(cx, cy, r, 150, 250)} fill="none" stroke="var(--rule)" strokeWidth="6" strokeLinecap="round" />
      {thr > 0 && <path d={arc(cx, cy, r, 150, 150 + thr)} fill="none" stroke="var(--f1-personal)" strokeWidth="6" strokeLinecap="round" />}
      <path d={arc(cx, cy, r, 290, 390)} fill="none" stroke={now?.brake ? "var(--down)" : "var(--rule)"} strokeWidth="6" strokeLinecap="round" />
      <text fontSize="6.5" fontWeight="700" letterSpacing="1.4" fontFamily="var(--font-sans)" fill={thr > 0 ? "var(--f1-personal)" : "var(--ink-faint)"}>
        <textPath href={`#${id}-thr`} startOffset="50%" textAnchor="middle">
          THROTTLE
        </textPath>
      </text>
      <text fontSize="6.5" fontWeight="700" letterSpacing="1.4" fontFamily="var(--font-sans)" fill={now?.brake ? "var(--down)" : "var(--ink-faint)"}>
        <textPath href={`#${id}-brk`} startOffset="50%" textAnchor="middle">
          BRAKE
        </textPath>
      </text>
      {/* the numbers: speed, revs, then the gear below the arcs' ends */}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="32" fontWeight="800" fontFamily="var(--font-display)" fill={now ? "var(--ink)" : "var(--ink-faint)"}>
        {now ? v : "—"}
      </text>
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="8.5" letterSpacing="1.2" fontFamily="var(--font-mono)" fill="var(--ink-soft)">
        KM/H
      </text>
      <text x={cx} y={cy + 23} textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="var(--font-mono)" fill={now ? "var(--ink)" : "var(--ink-faint)"}>
        {now ? now.rpm.toLocaleString("en-GB") : "—"}
        <tspan fontSize="7" fontWeight="400" fill="var(--ink-soft)">
          {" "}
          RPM
        </tspan>
      </text>
      <g transform={`translate(${cx} ${cy + 50})`}>
        <text x={-4} textAnchor="end" dy="0.35em" fontSize="8.5" letterSpacing="1.2" fontFamily="var(--font-mono)" fill="var(--ink-soft)">
          GEAR
        </text>
        <text x={2} dy="0.36em" fontSize="18" fontWeight="800" fontFamily="var(--font-display)" fill={now ? "var(--ink)" : "var(--ink-faint)"}>
          {now ? now.gear || "N" : "—"}
        </text>
      </g>
    </svg>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`group flex flex-col w-full rounded-xl border hairline px-3 pt-2.5 pb-2 text-left hover:border-[color:var(--ink-faint)] transition-colors overflow-hidden ${className}`} title={`${code}'s telemetry in detail`}>
      <span className="flex items-baseline justify-between gap-2 font-label text-[9.5px] text-ink-faint shrink-0">
        <span>Telemetry</span>
        <span className="group-hover:text-ink transition-colors">Detail →</span>
      </span>
      <span className="flex-1 min-h-0 grid place-items-center">{body}</span>
      <span className="block text-center font-mono text-[10px] text-ink-faint truncate shrink-0">{source}</span>
    </button>
  ) : (
    body
  );
}

/** Where the followed car clipped on the lap shown (a lap trace only: not the live readings, five seconds apart). */
export function ClipNote({ t, track, className = "" }: { t: Telemetry; track: TrackModel | null; className?: string }) {
  const on = useClippingOn();
  const live = /^live/i.test(t.source);
  const clips = useMemo(() => (on && !live ? detectClipping(t.samples) : []), [on, live, t.samples]);
  const lap = track?.lapTime || t.samples.at(-1)?.[0] || 1;
  // Always there, so the card keeps its shape: why there's nothing, when there's nothing.
  const none = !on ? "Switched off" : live ? "Replays and past sessions only" : t.samples.length < 2 ? "—" : "None on this lap";
  return (
    <div className={`rounded-xl border hairline px-3 py-2 overflow-hidden ${className}`} title="Flat out but losing speed: the battery running dry before the braking point">
      <div className="font-label text-[9px] text-ink-faint">Clipping</div>
      {!clips.length && <div className="font-mono text-[10.5px] text-ink-faint mt-1.5 truncate">{none}</div>}
      <div className="flex flex-wrap gap-1.5 mt-1 max-h-[2.6rem] overflow-hidden">
        {clips.map((c, i) => {
          const corner = cornerAfter(track, (c.until / lap) % 1);
          return (
            <span key={i} className="whitespace-nowrap rounded px-1.5 font-mono text-[10.5px] font-semibold leading-[17px]" style={{ color: "var(--f1-investigation)", background: "color-mix(in srgb, var(--f1-investigation) 15%, transparent)" }}>
              {corner ? `into T${corner} ` : ""}−{c.drop} km/h
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---- the detail ------------------------------------------------------------------

/** The sheet's dial and gauges, played smoothly; pointing at the lap holds them at that moment. */
function SheetGauges({ t, held, colour, code, seekRef }: { t: Telemetry; held: CarNow | null; colour: string; code: string; seekRef: React.RefObject<((at: number) => void) | null> }) {
  const smooth = useSmooth(t, seekRef);
  const now = held ?? smooth;
  return (
    <>
      <Dial now={now} colour={colour} code={code} source={t.source} />
      {now && <Readout now={now} colour={colour} />}
    </>
  );
}

export function TelemetrySheet({ t, code, name, colour, onClose }: { t: Telemetry; code: string; name: string; colour: string; onClose: () => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const seekRef = useRef<((at: number) => void) | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  // Pointing at the lap shows that moment; otherwise, as it plays.
  const at = hover !== null ? t.samples[hover] : null;
  const held = at ? toNow(at) : null;
  const marking = useClippingOn();
  const clips = useMemo(() => (marking ? detectClipping(t.samples) : []), [marking, t.samples]);
  return createPortal(
    <div className="sheet-scale fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm animate-[fade-in_0.2s_ease] sm:p-5 flex items-end sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${name}'s telemetry`}>
      <div
        className="sheet-panel relative w-full max-w-[980px] mx-auto rounded-t-3xl sm:rounded-3xl border hairline bg-[var(--surface)] text-ink overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-4 px-5 py-4 border-b hairline" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${colour} 22%, transparent), transparent 70%)` }}>
          <div className="min-w-0 flex-1">
            <div className="font-label text-[10.5px] text-ink-soft">Telemetry · {t.source}</div>
            <div className="font-display font-extrabold uppercase text-[1.6rem] leading-none mt-1 truncate">{name || code}</div>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain p-4 sm:p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {!t.now && t.samples.length < 2 ? (
            <Empty>Reading the car data…</Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[17rem_minmax(0,1fr)] gap-5 items-start">
              <div className="space-y-3">
                <SheetGauges t={t} held={held} colour={colour} code={code} seekRef={seekRef} />
              </div>
              <div>
                {t.samples.length >= 2 ? <Chart samples={t.samples} colour={colour} axis={t.axis} hover={hover} setHover={setHover} seekRef={t.play ? seekRef : undefined} clips={clips} /> : <Empty>The lap draws as readings come in.</Empty>}
                <p className="font-mono text-[10.5px] text-ink-faint mt-2 leading-relaxed">
                  Speed is the line; the green band is the throttle, the red marks braking. Point at the lap to see that moment in the gauges. From F1&rsquo;s car data, about four readings a second
                  {t.source.startsWith("live") ? " (live: one every 5 s)" : ""}. Amber bands: clipping, flat out but losing speed as the battery runs dry (the km/h lost
                  {t.source.startsWith("live") ? "; it needs a full lap's readings, so a replay or a past session" : ""}).{" "}
                  <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => setClipping(!marking)}>
                    {marking ? "Hide clipping" : "Show clipping"}
                  </button>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
