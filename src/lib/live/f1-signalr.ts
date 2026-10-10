// F1's own live timing: the feed the official app, OpenF1 and FastF1 all
// read (SignalR Core at livetiming.formula1.com). No account is needed for
// timing, tyres, race control, team radio and weather; only car telemetry and
// on-track positions sit behind an F1 TV login, and nothing here asks for them.
//
// Subscribing answers with the complete current state of every topic, so a
// read is a short visit — negotiate, open, subscribe, take the state, close —
// about a second. Nothing has to stay connected, which suits serverless; the
// caller (lib/live/f1-live.ts) shares one read between every reader.

const BASE = "https://livetiming.formula1.com";
const RS = "\x1e"; // SignalR's record separator

export const LIVE_TOPICS = [
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
] as const;

export type LiveTopic = (typeof LIVE_TOPICS)[number];
export type LiveState = Partial<Record<LiveTopic, unknown>>;

/** The session F1's servers call current (between sessions, the last one). */
export interface CurrentSessionInfo {
  Key: number;
  Type: string;
  Name: string;
  StartDate: string;
  EndDate: string;
  GmtOffset: string;
  Path?: string;
  SessionStatus?: string;
  Meeting?: { Key: number; Name: string; Location?: string; Country?: { Name: string } };
}

/** "2026-10-10T21:30:00" in local time + "08:00:00" → UTC milliseconds. */
export function sessionTime(local: string, gmtOffset: string): number {
  const [h, m] = gmtOffset.replace(/^-/, "").split(":").map(Number);
  const sign = gmtOffset.startsWith("-") ? -1 : 1;
  return Date.parse(`${local}Z`) - sign * ((h || 0) * 60 + (m || 0)) * 60_000;
}

/** One plain request: which session is current, and when it runs. */
export async function currentSession(): Promise<CurrentSessionInfo | null> {
  try {
    const res = await fetch(`${BASE}/static/SessionInfo.json`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return JSON.parse((await res.text()).replace(/^﻿/, "")) as CurrentSessionInfo;
  } catch {
    return null;
  }
}

/** The full current state of the given topics, or null if the feed won't answer. */
export async function readLiveState(topics: readonly string[] = LIVE_TOPICS, timeoutMs = 8000): Promise<LiveState | null> {
  const Socket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!Socket) return null;
  let cookie = "";
  let token: string;
  try {
    const neg = await fetch(`${BASE}/signalrcore/negotiate?negotiateVersion=1`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!neg.ok) return null;
    // The load balancer pins the connection to the server that negotiated it.
    cookie = (neg.headers.get("set-cookie") ?? "").split(/,(?=\s*AWSALB)/).map((c) => c.split(";")[0].trim()).join("; ");
    token = ((await neg.json()) as { connectionToken?: string }).connectionToken ?? "";
    if (!token) return null;
  } catch {
    return null;
  }

  return new Promise<LiveState | null>((resolve) => {
    let settled = false;
    let ws: WebSocket;
    const done = (state: LiveState | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {}
      resolve(state);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      // Node's WebSocket (undici) takes headers; browsers never run this.
      const Ctor = Socket as unknown as new (url: string, init?: { headers?: Record<string, string> }) => WebSocket;
      ws = new Ctor(`wss://livetiming.formula1.com/signalrcore?id=${encodeURIComponent(token)}`, cookie ? { headers: { Cookie: cookie } } : undefined);
    } catch {
      done(null);
      return;
    }
    ws.onopen = () => {
      ws.send(JSON.stringify({ protocol: "json", version: 1 }) + RS);
      ws.send(JSON.stringify({ type: 1, invocationId: "1", target: "Subscribe", arguments: [topics] }) + RS);
    };
    ws.onmessage = (event) => {
      for (const part of String(event.data).split(RS)) {
        if (!part) continue;
        let msg: { type?: number; invocationId?: string; result?: LiveState; error?: string };
        try {
          msg = JSON.parse(part);
        } catch {
          continue;
        }
        if (msg.type === 3 && msg.invocationId === "1") done(msg.error ? null : (msg.result ?? null));
        else if (msg.type === 7) done(null);
      }
    };
    ws.onerror = () => done(null);
    ws.onclose = () => done(null);
  });
}

/** A team radio clip's address (captures carry a path under the session's folder). */
export function radioUrl(sessionPath: string | undefined, clipPath: string): string | null {
  return sessionPath ? `${BASE}/static/${sessionPath}${clipPath}` : null;
}
