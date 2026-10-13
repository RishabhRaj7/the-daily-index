import type { LiveState } from "./f1-signalr";
import type { LiveLapHistory } from "@/lib/f1-live-types";

// A finished session replayed through time from F1's archive (the replay
// bar on /f1/live, and ?f1replay= in development). Each topic's
// ".jsonStream" holds every change the live feed sent, stamped with the time
// since the feed opened; applying them in order up to t rebuilds the state a
// live reader would have had at t. A race's streams come to about 6.5 MB;
// the two most recent sessions asked for stay in memory, each with a cursor,
// so playing forward costs only the changes since the last read (going back
// starts again from the top, still only milliseconds).

const TOPICS = [
  "SessionInfo",
  "SessionStatus",
  "TrackStatus",
  "LapCount",
  "ExtrapolatedClock",
  "DriverList",
  "TimingData",
  "TimingAppData",
  "TimingStats",
  "RaceControlMessages",
  "TeamRadio",
  "WeatherData",
  "ChampionshipPrediction",
  "LapSeries",
  "PitStopSeries",
];

interface Event {
  t: number;
  topic: string;
  data: unknown;
}

interface Timeline {
  events: Event[];
  state: Record<string, unknown>;
  cursor: number;
  t: number;
  /** Lap times and neutralised laps, as far as the cursor has played. */
  laps: LiveLapHistory;
}

const timelines = new Map<string, Promise<Event[]>>();
const cursors = new Map<string, Timeline>();
const KEEP = 2;

const stamp = (s: string) => {
  const [h, m, sec] = s.split(":").map(Number);
  return h * 3600 + m * 60 + sec;
};

async function loadEvents(path: string): Promise<Event[]> {
  const base = `https://livetiming.formula1.com/static/${path.replace(/^\/+|\/?$/g, "")}/`;
  const all: Event[] = [];
  await Promise.all(
    TOPICS.map(async (topic) => {
      const res = await fetch(`${base}${topic}.jsonStream`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const text = (await res.text()).replace(/^﻿/, "");
      for (const line of text.split(/\r?\n/)) {
        const m = /^(\d{2}:\d{2}:\d{2}\.\d{3})(.*)$/.exec(line);
        if (!m) continue;
        try {
          all.push({ t: stamp(m[1]), topic, data: JSON.parse(m[2]) });
        } catch {}
      }
    }),
  );
  return all.sort((a, b) => a.t - b.t);
}

/** SignalR's delta rule: objects merge key by key; an object of numbered keys updates an array in place. */
function merge(target: unknown, delta: unknown): unknown {
  if (delta === null || typeof delta !== "object") return delta;
  if (Array.isArray(delta)) return delta.map((d) => merge(undefined, d));
  if (Array.isArray(target)) {
    const out = [...target];
    for (const [k, v] of Object.entries(delta)) {
      const i = Number(k);
      if (Number.isInteger(i)) out[i] = merge(out[i], v);
    }
    return out;
  }
  const out: Record<string, unknown> = target && typeof target === "object" ? { ...(target as Record<string, unknown>) } : {};
  for (const [k, v] of Object.entries(delta)) {
    if (k === "_deleted") continue;
    out[k] = merge(out[k], v);
  }
  return out;
}

function eventsFor(path: string): Promise<Event[]> {
  let events = timelines.get(path);
  if (events) {
    // Most recently used last.
    timelines.delete(path);
    timelines.set(path, events);
    return events;
  }
  events = loadEvents(path);
  events.then((l) => l.length === 0 && timelines.delete(path)).catch(() => timelines.delete(path));
  timelines.set(path, events);
  while (timelines.size > KEEP) {
    const oldest = timelines.keys().next().value as string;
    timelines.delete(oldest);
    cursors.delete(oldest);
  }
  return events;
}

export type FlagTone = "green" | "yellow" | "sc" | "vsc" | "red";

/** The shape of a session for the replay bar: when it ran, its flags, its laps and parts. */
export interface ReplayTimeline {
  /** Seconds into the feed: a minute before the first start … the end. */
  start: number;
  end: number;
  flags: { t: number; tone: FlagTone }[];
  laps: { t: number; lap: number }[];
  /** Where each part begins (Q1/Q2/Q3, or SQ…), for qualifying. */
  parts: { t: number; label: string }[];
}

const TRACK_TONE: Record<string, FlagTone> = { "1": "green", "2": "yellow", "4": "sc", "5": "red", "6": "vsc", "7": "vsc" };

export async function timeline(path: string): Promise<ReplayTimeline | null> {
  const list = await eventsFor(path);
  if (list.length === 0) return null;
  const starts: number[] = [];
  let end = list.at(-1)!.t;
  const flags: ReplayTimeline["flags"] = [];
  const laps: ReplayTimeline["laps"] = [];
  for (const e of list) {
    const d = e.data as Record<string, unknown>;
    if (e.topic === "SessionStatus") {
      if (d.Status === "Started") starts.push(e.t);
      if (d.Status === "Finalised" || d.Status === "Ends") end = Math.min(end, e.t);
    } else if (e.topic === "TrackStatus" && typeof d.Status === "string") {
      const tone = TRACK_TONE[d.Status];
      if (tone && flags.at(-1)?.tone !== tone) flags.push({ t: e.t, tone });
    } else if (e.topic === "LapCount" && typeof d.CurrentLap === "number") {
      laps.push({ t: e.t, lap: d.CurrentLap });
    }
  }
  const start = Math.max(0, (starts[0] ?? 0) - 60);
  const sprint = /sprint/i.test(path);
  const parts = starts.length > 1 ? starts.map((t, i) => ({ t, label: `${sprint ? "SQ" : "Q"}${i + 1}` })) : [];
  return { start, end: Math.max(start + 60, end), flags, laps, parts };
}

/** The session's state `t` seconds after its feed opened. */
export async function stateAt(path: string, t: number): Promise<{ state: LiveState; end: number; laps: LiveLapHistory }> {
  const list = await eventsFor(path);
  let tl = cursors.get(path);
  if (!tl || t < tl.t) {
    tl = { events: list, state: {}, cursor: 0, t: 0, laps: { times: {}, neutral: [] } };
    cursors.set(path, tl);
  }
  while (tl.cursor < list.length && list[tl.cursor].t <= t) {
    const e = list[tl.cursor++];
    tl.state[e.topic] = merge(tl.state[e.topic], e.data);
    noteLaps(tl, e);
  }
  tl.t = t;
  return { state: tl.state as LiveState, end: list.at(-1)?.t ?? 0, laps: tl.laps };
}

/** The lap history as the feed plays: a car's lap time each time one closes; the laps behind a safety car, VSC or red flag. */
function noteLaps(tl: { state: Record<string, unknown>; laps: LiveLapHistory }, e: { topic: string; data: unknown }) {
  const d = (e.data ?? {}) as Record<string, unknown>;
  if (e.topic === "TimingData" && d.Lines && typeof d.Lines === "object") {
    const lines = ((tl.state.TimingData as Record<string, unknown>)?.Lines ?? {}) as Record<string, Record<string, unknown>>;
    const drivers = (tl.state.DriverList ?? {}) as Record<string, { Tla?: string }>;
    for (const [no, part] of Object.entries(d.Lines as Record<string, Record<string, unknown>>)) {
      const value = (part?.LastLapTime as { Value?: string } | undefined)?.Value;
      if (!value) continue;
      const m = /^(?:(\d+):)?(\d+\.\d+)$/.exec(value);
      const laps = Number(lines[no]?.NumberOfLaps ?? 0);
      const code = drivers[no]?.Tla;
      if (!m || !laps || !code) continue;
      const list = (tl.laps.times[code] ??= []);
      while (list.length < laps) list.push(null);
      list[laps - 1] = Number(m[1] ?? 0) * 60 + Number(m[2]);
    }
  } else if (e.topic === "TrackStatus" || e.topic === "LapCount") {
    const status = String(((tl.state.TrackStatus ?? {}) as { Status?: string }).Status ?? "1");
    const lap = Number(((tl.state.LapCount ?? {}) as { CurrentLap?: number }).CurrentLap ?? 0);
    if (lap && /^[4567]$/.test(status) && !tl.laps.neutral.includes(lap)) tl.laps.neutral.push(lap);
  }
}
