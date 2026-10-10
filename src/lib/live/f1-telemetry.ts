import { inflateRawSync } from "node:zlib";
import type { CarNow, LapTrace } from "@/lib/f1-live-types";

// Telemetry: what the car is doing — speed, revs, gear, throttle, brake, DRS
// — about four times a second, from F1's car data (CarData.z: each line a
// deflated batch of readings for every car).
//
//   live      the shared read takes the newest batch along with the timing
//             (lib/live/f1-live.ts): every car's latest reading, every 5 s
//   finished  F1's archive keeps the whole session (a race is ~8 MB), read
//             once per server and cut to one driver's lap on request: the
//             lap in progress at a moment of the replay, or their fastest
//
// The archive's lines carry the feed's own clock (time since the feed
// opened), the same clock as every other stream, so the lap boundaries come
// from TimingData (when each car's lap count ticked over).

const STATIC = "https://livetiming.formula1.com/static";
const KEEP_MS = 30 * 60_000;

const stampOf = (s: string) => {
  const [h, m, sec] = s.split(":").map(Number);
  return (h * 3600 + m * 60 + sec) * 1000;
};

type Channels = Record<string, number>;
type Batch = { Entries?: { Utc: string; Cars: Record<string, { Channels: Channels }> }[] };

/** One reading, from F1's channel numbers. DRS: 10, 12 and 14 are open; 8 is eligible. */
export function reading(ch: Channels): CarNow {
  const drs = ch["45"] ?? 0;
  return {
    speed: ch["2"] ?? 0,
    rpm: ch["0"] ?? 0,
    gear: ch["3"] ?? 0,
    throttle: Math.min(100, Math.max(0, ch["4"] ?? 0)),
    brake: (ch["5"] ?? 0) > 0,
    drs: drs >= 10 ? "open" : drs === 8 ? "eligible" : "off",
  };
}

export function decode(b64: string): Batch | null {
  try {
    return JSON.parse(inflateRawSync(Buffer.from(b64, "base64")).toString());
  } catch {
    return null;
  }
}

/** The newest reading for every car in a live CarData.z message, by racing number. */
export function latestReadings(raw: unknown): Record<string, CarNow> {
  const batch = typeof raw === "string" ? decode(raw) : null;
  const last = batch?.Entries?.at(-1);
  const out: Record<string, CarNow> = {};
  for (const [no, car] of Object.entries(last?.Cars ?? {})) out[no] = reading(car.Channels);
  return out;
}

// ---- the archive, read once per server --------------------------------------

interface Archive {
  at: number;
  /** Each line's time on the feed's clock (ms), and its payload. */
  times: number[];
  data: string[];
  /** Feed clock = Date.parse(Utc) − offset. */
  offset: number;
  /** Each car's lap completions on the feed's clock: laps[no][n] = when lap n ended (0: the start). */
  laps: Map<string, Map<number, number>>;
  numbers: Map<string, string>;
  best: Map<string, { lap: number; time: string }>;
}

const archives = new Map<string, Promise<Archive | null>>();

async function text(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    return res.ok ? (await res.text()).replace(/^﻿/, "") : null;
  } catch {
    return null;
  }
}

async function load(path: string): Promise<Archive | null> {
  const [car, timing, final, drivers] = await Promise.all([
    text(`${STATIC}/${path}CarData.z.jsonStream`),
    text(`${STATIC}/${path}TimingData.jsonStream`),
    text(`${STATIC}/${path}TimingData.json`),
    text(`${STATIC}/${path}DriverList.json`),
  ]);
  if (!car || !timing) return null;

  const times: number[] = [];
  const data: string[] = [];
  for (const line of car.split(/\r?\n/)) {
    const m = /^(\d{2}:\d{2}:\d{2}\.\d{3})"(.*)"$/.exec(line);
    if (!m) continue;
    times.push(stampOf(m[1]));
    data.push(m[2]);
  }
  if (!times.length) return null;
  // The clock: a line is written just after its newest reading.
  const first = decode(data[0])?.Entries?.at(-1);
  const offset = first ? Date.parse(first.Utc) - times[0] : 0;

  const laps = new Map<string, Map<number, number>>();
  for (const line of timing.split(/\r?\n/)) {
    const m = /^(\d{2}:\d{2}:\d{2}\.\d{3})(.*)$/.exec(line);
    if (!m || !m[2].includes("NumberOfLaps")) continue;
    let d: { Lines?: Record<string, { NumberOfLaps?: number }> };
    try {
      d = JSON.parse(m[2]);
    } catch {
      continue;
    }
    for (const [no, l] of Object.entries(d.Lines ?? {})) {
      if (typeof l.NumberOfLaps !== "number") continue;
      const mine = laps.get(no) ?? new Map<number, number>();
      if (!mine.has(l.NumberOfLaps)) mine.set(l.NumberOfLaps, stampOf(m[1]));
      laps.set(no, mine);
    }
  }

  const numbers = new Map<string, string>();
  try {
    for (const [no, d] of Object.entries(JSON.parse(drivers ?? "{}") as Record<string, { Tla?: string }>)) if (d?.Tla) numbers.set(d.Tla, no);
  } catch {}
  const best = new Map<string, { lap: number; time: string }>();
  try {
    const lines = (JSON.parse(final ?? "{}") as { Lines?: Record<string, { BestLapTime?: { Value?: string; Lap?: number } }> }).Lines ?? {};
    for (const [no, l] of Object.entries(lines)) if (l.BestLapTime?.Lap && l.BestLapTime.Value) best.set(no, { lap: l.BestLapTime.Lap, time: l.BestLapTime.Value });
  } catch {}
  return { at: Date.now(), times, data, offset, laps, numbers, best };
}

function archive(path: string): Promise<Archive | null> {
  const hit = archives.get(path);
  if (hit) return hit;
  const p = load(path).catch(() => null);
  archives.set(path, p);
  // Kept a while (a replay asks every couple of seconds), then let go.
  p.then((a) => setTimeout(() => archives.delete(path), a ? KEEP_MS : 60_000));
  return p;
}

/**
 * One driver's lap from the archive: the lap in progress `t` seconds into the
 * feed (a replay), or without `t` their fastest lap.
 */
export async function lapTrace(path: string, code: string, t?: number): Promise<LapTrace | null> {
  const a = await archive(path);
  if (!a) return null;
  const no = a.numbers.get(code);
  const laps = no ? a.laps.get(no) : null;
  if (!no || !laps) return null;

  let lap: number;
  let from: number;
  let to: number;
  if (t !== undefined) {
    to = t * 1000;
    // The laps finished by then; the one after is in progress.
    const done = [...laps.entries()].filter(([, at]) => at <= to).sort((x, y) => y[0] - x[0])[0];
    lap = (done?.[0] ?? 0) + 1;
    from = done?.[1] ?? Math.max(0, to - 120_000);
  } else {
    const b = a.best.get(no);
    if (!b) return null;
    lap = b.lap;
    const end = laps.get(b.lap);
    const start = laps.get(b.lap - 1);
    if (end === undefined || start === undefined) return null;
    from = start;
    to = end;
  }

  // The lines that hold the stretch (a little either side: a line holds about a second).
  let lo = 0;
  let hi = a.times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a.times[mid] < from) lo = mid + 1;
    else hi = mid;
  }
  const samples: number[][] = [];
  let now: LapTrace["now"] = null;
  for (let i = Math.max(0, lo - 1); i < a.times.length && a.times[i] <= to + 1500; i++) {
    for (const e of decode(a.data[i])?.Entries ?? []) {
      const at = Date.parse(e.Utc) - a.offset;
      const ch = e.Cars[no]?.Channels;
      if (!ch || at < from || at > to) continue;
      const r = reading(ch);
      samples.push([Math.round((at - from) / 100) / 10, r.speed, r.throttle, r.brake ? 1 : 0, r.gear, r.rpm, r.drs === "open" ? 1 : 0]);
      now = r;
    }
  }
  if (samples.length < 2) return null;
  return { code, lap, kind: t === undefined ? "fastest" : "current", lapTime: t === undefined ? (a.best.get(no)?.time ?? null) : null, samples, now };
}
