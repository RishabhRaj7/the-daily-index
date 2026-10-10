import { getStore } from "@/lib/server/store";
import { currentSession, radioUrl, readLiveState, sessionTime, type CurrentSessionInfo, type LiveState } from "./f1-signalr";
import type {
  LapMark,
  LiveAnswer,
  LivePrediction,
  LiveRaceControl,
  LiveRadio,
  LiveRow,
  LiveSnapshot,
  LiveStints,
  SegmentMark,
  TrackTone,
  TyreCompound,
} from "@/lib/f1-live-types";

// Live F1, shared: one read of F1's live timing serves every reader for a few
// seconds. While no session is near, nothing connects at all — a single plain
// request (cached) says which session is current and when it runs.
//
//   window   a session counts as live from 15 minutes before its start until
//            30 minutes after its scheduled end (longer while it still runs:
//            red flags overrun), matching the timing card's own settle time
//   sharing  the parsed snapshot sits in the store for 5 s; one reader at a
//            time refreshes it (a short lock), the rest take what's there
//   keeping  a practice or sprint-qualifying classification is kept when the
//            flag falls, so the Pit wall has those times even while OpenF1
//            locks its API for the next session (lib/live/f1.ts reads it)

const BEFORE_MS = 15 * 60_000;
const AFTER_MS = 30 * 60_000;
const FRESH_MS = 5_000;
const INFO_MS = 30_000;
const KEY = "f1:live:v1";
const LOCK = "f1:live:lock";
const INFO_KEY = "f1:live:info:v1";

let infoMemo: { at: number; info: CurrentSessionInfo | null } | null = null;

async function sessionInfo(): Promise<CurrentSessionInfo | null> {
  if (infoMemo && Date.now() - infoMemo.at < INFO_MS) return infoMemo.info;
  const store = getStore();
  const shared = await store.get<{ at: number; info: CurrentSessionInfo | null }>(INFO_KEY).catch(() => null);
  if (shared && Date.now() - shared.at < INFO_MS) {
    infoMemo = shared;
    return shared.info;
  }
  const info = await currentSession();
  infoMemo = { at: Date.now(), info };
  await store.set(INFO_KEY, infoMemo, { ttlSeconds: 60 }).catch(() => {});
  return info;
}

const RUNNING = new Set(["Started", "Aborted", "Suspended"]);

function inWindow(info: CurrentSessionInfo, now = Date.now()): boolean {
  const start = sessionTime(info.StartDate, info.GmtOffset);
  const end = sessionTime(info.EndDate, info.GmtOffset);
  if (now < start - BEFORE_MS) return false;
  if (RUNNING.has(info.SessionStatus ?? "")) return true;
  return now <= end + AFTER_MS;
}

// ---- parsing ---------------------------------------------------------------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number.parseFloat(str(v));
  return Number.isFinite(n) ? n : 0;
};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as Obj) : []);

const COMPOUNDS = new Set<TyreCompound>(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]);
const compound = (v: unknown): TyreCompound => {
  const c = str(v).toUpperCase() as TyreCompound;
  return COMPOUNDS.has(c) ? c : "UNKNOWN";
};

const mark = (v: Obj): LapMark => (v.OverallFastest === true ? "fastest" : v.PersonalFastest === true ? "personal" : "none");

// Mini-sector status codes as the timing screens use them.
const SEGMENT: Record<number, SegmentMark> = { 2048: "slower", 2049: "personal", 2051: "fastest", 2064: "pit", 2052: "slower" };

const TRACK: Record<string, { tone: TrackTone; label: string }> = {
  "1": { tone: "green", label: "Track clear" },
  "2": { tone: "yellow", label: "Yellow flag" },
  "4": { tone: "sc", label: "Safety car" },
  "5": { tone: "red", label: "Red flag" },
  "6": { tone: "vsc", label: "Virtual safety car" },
  "7": { tone: "vsc", label: "VSC ending" },
};

const colour = (hex: string) => (/^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : "#888888");

export function parse(state: LiveState, info: CurrentSessionInfo): LiveSnapshot {
  const si = obj(state.SessionInfo);
  const meeting = obj(si.Meeting);
  const type = (str(si.Type) || info.Type) as LiveSnapshot["type"];
  const session = str(si.Name) || info.Name;
  const status = str(obj(state.SessionStatus).Status) || str(si.SessionStatus) || info.SessionStatus || "";
  const timing = obj(state.TimingData);
  const lines = obj(timing.Lines);
  const app = obj(obj(state.TimingAppData).Lines);
  const drivers = obj(state.DriverList);
  const quali = type === "Qualifying";
  const part = quali ? num(timing.SessionPart) || null : null;
  const entries = list(timing.NoEntries).map(num);
  // Part p of qualifying keeps entries[p] cars (the next part's field).
  const cutoff = part && part < entries.length ? entries[part] : null;

  const rows: LiveRow[] = Object.entries(lines)
    .map(([no, raw]) => {
      const l = obj(raw);
      const d = obj(drivers[no]);
      const stints = list(obj(app[no]).Stints).map(obj);
      const cur = stints.at(-1);
      const statsPart = quali && part ? obj(list(l.Stats)[part - 1]) : null;
      const bestPart = quali && part ? obj(list(l.BestLapTimes)[part - 1]) : null;
      const best = str(bestPart?.Value) || str(obj(l.BestLapTime).Value) || [...list(l.BestLapTimes)].reverse().map((b) => str(obj(b).Value)).find(Boolean) || "";
      const last = obj(l.LastLapTime);
      const race = type === "Race";
      return {
        position: num(l.Position) || num(l.Line) || 99,
        number: no,
        code: str(d.Tla) || no,
        name: str(d.LastName) || str(d.BroadcastName),
        team: str(d.TeamName),
        colour: colour(str(d.TeamColour)),
        gap: race ? str(l.GapToLeader) : str(statsPart?.TimeDiffToFastest ?? l.TimeDiffToFastest),
        interval: race ? str(obj(l.IntervalToPositionAhead).Value) : str(statsPart?.TimeDifftoPositionAhead ?? l.TimeDiffToPositionAhead),
        catching: race && obj(l.IntervalToPositionAhead).Catching === true,
        last: str(last.Value),
        lastMark: mark(last),
        best,
        bestFastest: false,
        laps: num(l.NumberOfLaps),
        stops: num(l.NumberOfPitStops),
        inPit: l.InPit === true,
        pitOut: l.PitOut === true,
        out: l.Retired === true || l.Stopped === true,
        knockedOut: l.KnockedOut === true,
        tyre: cur ? { compound: compound(cur.Compound), fresh: str(cur.New) === "true", laps: num(cur.TotalLaps) } : null,
        sectors: list(l.Sectors).map((s) => {
          const so = obj(s);
          return {
            value: str(so.Value) || str(so.PreviousValue),
            mark: mark(so),
            segments: list(so.Segments).map((g) => SEGMENT[num(obj(g).Status)] ?? "none"),
          };
        }),
      } satisfies LiveRow;
    })
    .sort((a, b) => a.position - b.position);

  // The session's fastest lap: the quickest best time among the field.
  const secs = (t: string) => {
    const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
    return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : Infinity;
  };
  const fastest = Math.min(...rows.map((r) => secs(r.best)));
  for (const r of rows) r.bestFastest = Number.isFinite(fastest) && secs(r.best) === fastest;

  const lapCount = obj(state.LapCount);
  const clock = obj(state.ExtrapolatedClock);
  const w = obj(state.WeatherData);
  const byNo = new Map(rows.map((r) => [r.number, r]));

  const raceControl: LiveRaceControl[] = list(obj(state.RaceControlMessages).Messages)
    .map(obj)
    .map((m) => ({ utc: str(m.Utc), lap: m.Lap == null ? null : num(m.Lap), category: str(m.Category), flag: str(m.Flag) || null, message: str(m.Message) }))
    .reverse()
    .slice(0, 60);

  const radio: LiveRadio[] = list(obj(state.TeamRadio).Captures)
    .map(obj)
    .flatMap((c) => {
      const no = str(c.RacingNumber);
      const url = radioUrl(info.Path, str(c.Path));
      const r = byNo.get(no);
      return url ? [{ utc: str(c.Utc), number: no, code: r?.code ?? no, colour: r?.colour ?? "#888888", url }] : [];
    })
    .reverse()
    .slice(0, 30);

  const stints: LiveStints[] = rows.map((r) => ({
    number: r.number,
    code: r.code,
    colour: r.colour,
    stints: list(obj(app[r.number]).Stints)
      .map(obj)
      .map((s) => ({ compound: compound(s.Compound), laps: Math.max(0, num(s.TotalLaps) - num(s.StartLaps)), fresh: str(s.New) === "true" })),
  }));

  const cp = obj(state.ChampionshipPrediction);
  const teamColour = new Map(rows.map((r) => [r.team, r.colour]));
  const prediction: LivePrediction | null =
    Object.keys(obj(cp.Drivers)).length > 0
      ? {
          drivers: Object.entries(obj(cp.Drivers))
            .map(([no, v]) => {
              const p = obj(v);
              const r = byNo.get(no);
              return { code: r?.code ?? no, colour: r?.colour ?? "#888888", position: num(p.CurrentPosition), predicted: num(p.PredictedPosition), points: num(p.CurrentPoints), predictedPoints: num(p.PredictedPoints) };
            })
            .sort((a, b) => a.predicted - b.predicted),
          teams: Object.values(obj(cp.Teams))
            .map(obj)
            .map((p) => ({ name: str(p.TeamName), colour: teamColour.get(str(p.TeamName)) ?? "#888888", position: num(p.CurrentPosition), predicted: num(p.PredictedPosition), points: num(p.CurrentPoints), predictedPoints: num(p.PredictedPoints) }))
            .sort((a, b) => a.predicted - b.predicted),
        }
      : null;

  return {
    at: new Date().toISOString(),
    sessionKey: num(si.Key) || info.Key,
    meeting: str(meeting.Name) || info.Meeting?.Name || "",
    location: str(meeting.Location) || info.Meeting?.Location || "",
    session,
    type,
    status,
    running: RUNNING.has(status),
    part,
    partLabel: part ? `${/^Sprint/.test(session) ? "SQ" : "Q"}${part}` : null,
    cutoff,
    track: TRACK[str(obj(state.TrackStatus).Status)] ?? TRACK["1"],
    lap: lapCount.TotalLaps ? { current: num(lapCount.CurrentLap), total: num(lapCount.TotalLaps) } : null,
    remaining: str(clock.Remaining) || null,
    clockAt: str(clock.Utc) || null,
    clockRunning: clock.Extrapolating === true,
    weather: Object.keys(w).length
      ? { air: num(w.AirTemp), track: num(w.TrackTemp), humidity: num(w.Humidity), wind: num(w.WindSpeed), rain: num(w.Rainfall) > 0 }
      : null,
    rows,
    raceControl,
    radio,
    stints,
    prediction,
  };
}

// ---- keeping a finished session --------------------------------------------

// The race weekend's id across the F1 module: the race's date, which F1's
// session folder carries ("2026/2026-10-11_Singapore_Grand_Prix/…").
const raceDayOf = (path?: string) => /^\d{4}\/(\d{4}-\d{2}-\d{2})_/.exec(path ?? "")?.[1] ?? null;

async function keepClassification(snap: LiveSnapshot, info: CurrentSessionInfo): Promise<void> {
  if (snap.running || !/^(Finished|Finalised|Ends)$/.test(snap.status)) return;
  if (snap.type !== "Practice" && snap.session !== "Sprint Qualifying") return;
  const day = raceDayOf(info.Path);
  if (!day) return;
  const secs = (t: string) => {
    const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
    return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
  };
  // Shaped like OpenF1's session_result, which is what lib/live/f1.ts keeps.
  const rows = snap.rows
    .filter((r) => r.best)
    .map((r) => ({
      driver_number: Number(r.number),
      position: r.position,
      duration: secs(r.best),
      gap_to_leader: r.position === 1 ? 0 : secs(r.gap.replace(/^\+/, "")),
      dnf: false,
      dns: false,
      dsq: false,
    }));
  if (rows.length === 0) return;
  await getStore()
    .set(`f1:kept:v1:wk:${day}:${snap.session}`, rows, { ttlSeconds: 21 * 86_400 })
    .catch(() => {});
}

// ---- the shared read ---------------------------------------------------------

/** Pit wall size: the table and its header, nothing else. */
export function compact(s: LiveSnapshot): LiveSnapshot {
  const { raceControl, radio, stints, prediction, ...rest } = s;
  void stints;
  void prediction;
  return {
    ...rest,
    rows: rest.rows.map((r) => ({ ...r, sectors: r.sectors.map((x) => ({ ...x, segments: [] })) })),
    // The newest message and radio clip, for the card's one-line note.
    raceControl: raceControl?.slice(0, 1),
    radio: radio?.slice(0, 1),
  };
}

/** Development only: a finished session from F1's archive, shown as if it were running. */
export async function replay(path: string): Promise<LiveAnswer> {
  const base = `https://livetiming.formula1.com/static/${path.replace(/^\/+|\/?$/g, "")}/`;
  const topics = ["SessionInfo", "SessionStatus", "TrackStatus", "LapCount", "ExtrapolatedClock", "DriverList", "TimingData", "TimingAppData", "TimingStats", "RaceControlMessages", "TeamRadio", "WeatherData", "ChampionshipPrediction"];
  const state: LiveState = {};
  await Promise.all(
    topics.map(async (t) => {
      const res = await fetch(`${base}${t}.json`, { next: { revalidate: 3600 } }).catch(() => null);
      if (res?.ok) state[t as keyof LiveState] = JSON.parse((await res.text()).replace(/^\uFEFF/, ""));
    }),
  );
  const si = obj(state.SessionInfo);
  if (!si.Key) return { live: false, next: null };
  const info: CurrentSessionInfo = { Key: num(si.Key), Type: str(si.Type), Name: str(si.Name), StartDate: str(si.StartDate), EndDate: str(si.EndDate), GmtOffset: str(si.GmtOffset), Path: str(si.Path) };
  const snap = parse(state, info);
  return { live: true, snapshot: { ...snap, running: true, status: "Started", clockRunning: false } };
}

export async function getLive(opts: { fresh?: boolean } = {}): Promise<LiveAnswer> {
  const info = await sessionInfo();
  if (!info) return { live: false, next: null };
  if (!inWindow(info)) {
    const start = sessionTime(info.StartDate, info.GmtOffset);
    return { live: false, next: start > Date.now() ? new Date(start).toISOString() : null };
  }

  const store = getStore();
  const cached = await store.get<LiveSnapshot>(KEY).catch(() => null);
  const age = cached ? Date.now() - Date.parse(cached.at) : Infinity;
  if (cached && cached.sessionKey === info.Key && age < FRESH_MS && !opts.fresh) return { live: true, snapshot: cached };

  // One reader refreshes; the others take the last snapshot (or wait a beat).
  if (!(await store.setIfAbsent(LOCK, 1, 8).catch(() => true))) {
    if (cached && cached.sessionKey === info.Key && age < 30_000) return { live: true, snapshot: cached };
    await new Promise((r) => setTimeout(r, 1200));
    const again = await store.get<LiveSnapshot>(KEY).catch(() => null);
    return again && again.sessionKey === info.Key ? { live: true, snapshot: again } : { live: false, next: null };
  }
  try {
    const state = await readLiveState();
    if (!state) return cached && cached.sessionKey === info.Key ? { live: true, snapshot: cached } : { live: false, next: null };
    const snap = parse(state, info);
    await store.set(KEY, snap, { ttlSeconds: 3600 }).catch(() => {});
    await keepClassification(snap, info);
    return { live: true, snapshot: snap };
  } finally {
    await store.del(LOCK).catch(() => {});
  }
}
