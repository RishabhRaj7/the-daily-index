import type { LiveState } from "./f1-signalr";

// Development only: a finished session replayed through time from F1's
// archive. Each topic's ".jsonStream" holds every change the live feed sent,
// stamped with the time since the feed opened; applying them in order up to
// t rebuilds the state a live reader would have had at t. Used to see the
// live views move (rows changing places, flashes, cars on the map) without
// waiting for a race weekend.

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
}

const timelines = new Map<string, Promise<Event[]>>();
const cursors = new Map<string, Timeline>();

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

/** The session's state `t` seconds after its feed opened. */
export async function stateAt(path: string, t: number): Promise<{ state: LiveState; end: number }> {
  let events = timelines.get(path);
  if (!events) {
    events = loadEvents(path);
    timelines.set(path, events);
  }
  const list = await events;
  let tl = cursors.get(path);
  if (!tl || t < tl.t) {
    tl = { events: list, state: {}, cursor: 0, t: 0 };
    cursors.set(path, tl);
  }
  while (tl.cursor < list.length && list[tl.cursor].t <= t) {
    const e = list[tl.cursor++];
    tl.state[e.topic] = merge(tl.state[e.topic], e.data);
  }
  tl.t = t;
  return { state: tl.state as LiveState, end: list.at(-1)?.t ?? 0 };
}
