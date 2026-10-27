import { gunzipSync, gzipSync } from "node:zlib";
import type { LiveState } from "./f1-signalr";
import { getStore } from "@/lib/server/store";
import type { LiveLapHistory, LiveSnapshot } from "@/lib/f1-live-types";

// Older sessions replay F1's archived ".jsonStream" changes. The latest one
// replays compressed snapshots captured from the live feed, kept for 30 days.
// Archive streams stay in memory for the two most recently requested sessions
// with a cursor, so playing forward applies only the changes since the last read.

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
const CAPTURE_PREFIX = "f1:replay:v1:";
const CAPTURE_TTL = 30 * 86_400;
const CAPTURE_INTERVAL = 10;
const MAX_CAPTURED_SAMPLES = 2_200;

interface CapturedSample {
  t: number;
  snap: LiveSnapshot;
}

const captureKey = (path: string) => `${CAPTURE_PREFIX}${encodeURIComponent(path)}`;
const parseCaptured = (entry: string): CapturedSample =>
  JSON.parse(gunzipSync(Buffer.from(entry, "base64")).toString("utf8")) as CapturedSample;

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

/** Keeps a bounded sample of a session read from the live feed for latest-session replay. */
export async function captureLiveSample(path: string, startAt: number, snap: LiveSnapshot): Promise<void> {
  const t = Math.max(0, (Date.parse(snap.at) - startAt) / 1000);
  const key = captureKey(path);
  const [last] = await getStore().zrevrangeFrom(key, 0, 1);
  if (last) {
    const previous = parseCaptured(last);
    if (t - previous.t < CAPTURE_INTERVAL) return;
  }
  const member = gzipSync(JSON.stringify({ t, snap })).toString("base64");
  await getStore().zadd(key, t, member, { ttlSeconds: CAPTURE_TTL });
}

async function capturedSamples(path: string): Promise<CapturedSample[]> {
  const entries = await getStore().zrevrangeFrom(captureKey(path), 0, MAX_CAPTURED_SAMPLES);
  return entries.reverse().flatMap((entry) => {
    try {
      const sample = parseCaptured(entry);
      return Number.isFinite(sample.t) && sample.snap?.path === path ? [sample] : [];
    } catch {
      return [];
    }
  });
}

function buildCapturedTimeline(samples: CapturedSample[]): ReplayTimeline | null {
  if (samples.length < 2 || samples.at(-1)!.t <= samples[0].t) return null;
  const flags: ReplayTimeline["flags"] = [];
  const laps: ReplayTimeline["laps"] = [];
  const parts: ReplayTimeline["parts"] = [];
  let tone: FlagTone | null = null;
  let lap: number | null = null;
  let part: string | null = null;
  for (const sample of samples) {
    const nextTone = sample.snap.track.tone;
    if (nextTone !== tone) {
      flags.push({ t: sample.t, tone: nextTone });
      tone = nextTone;
    }
    const nextLap = sample.snap.lap?.current ?? null;
    if (nextLap !== null && nextLap !== lap) {
      laps.push({ t: sample.t, lap: nextLap });
      lap = nextLap;
    }
    const nextPart = sample.snap.partLabel;
    if (nextPart && nextPart !== part) {
      parts.push({ t: sample.t, label: nextPart });
      part = nextPart;
    }
  }

  const start = samples[0].t;
  const end = samples.at(-1)!.t;
  return { start, end, flags, laps, parts };
}

/** Rebuilds the replay timeline from the live-feed samples stored for a session. */
export async function capturedTimeline(path: string): Promise<ReplayTimeline | null> {
  return buildCapturedTimeline(await capturedSamples(path));
}

/** Reads the closest state captured at or before `t`; the first sample handles an early seek. */
export async function capturedReplay(path: string, t: number): Promise<{ snap: LiveSnapshot } | null> {
  const key = captureKey(path);
  const entries = await getStore().zrevrangeTo(key, t, 1);
  let selected = entries[0] ? parseCaptured(entries[0]) : null;
  if (!selected) {
    const samples = await capturedSamples(path);
    if (!buildCapturedTimeline(samples)) return null;
    selected = samples[0];
  }
  if (selected.snap.path !== path) return null;
  return { snap: { ...selected.snap, running: true, status: "Started", clockRunning: false } };
}

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
