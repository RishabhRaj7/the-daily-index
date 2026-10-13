import { getStore } from "@/lib/server/store";
import { currentSession, radioUrl, readLiveState, sessionTime, type CurrentSessionInfo, type LiveState } from "./f1-signalr";
import { driverPhoto } from "@/lib/f1-assets";
import { rememberSectors } from "./f1-track";
import { latestReadings } from "./f1-telemetry";
import type {
  LapMark,
  LiveAnswer,
  LivePitStop,
  LivePrediction,
  LiveRaceControl,
  LiveRadio,
  LiveRow,
  LiveSnapshot,
  LiveStats,
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

/** F1's live audio coverage from the feed's AudioStreams: the English stream, else the first. */
function commentaryOf(state: LiveState): string | null {
  const streams = list(obj(state.AudioStreams).Streams).map(obj);
  const pick = streams.find((s) => str(s.Language) === "en") ?? streams[0];
  const uri = pick ? str(pick.Uri) : "";
  return /^https:\/\/[a-z0-9.-]+\.formula1\.com\//.test(uri) ? uri : null;
}

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
        grid: race ? num(obj(app[no]).GridPos) || null : null,
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
    // The whole session (a wet race with its blue flags runs to a few hundred).
    .slice(0, 800);

  const radio: LiveRadio[] = list(obj(state.TeamRadio).Captures)
    .map(obj)
    .flatMap((c) => {
      const no = str(c.RacingNumber);
      const url = radioUrl(info.Path, str(c.Path));
      const r = byNo.get(no);
      const first = str(obj(drivers[no]).FirstName);
      return url ? [{ utc: str(c.Utc), number: no, code: r?.code ?? no, colour: r?.colour ?? "#888888", url, ...(first ? { first } : {}) }] : [];
    })
    .reverse()
    .slice(0, 250);

  const stints: LiveStints[] = rows.map((r) => ({
    number: r.number,
    code: r.code,
    colour: r.colour,
    stints: list(obj(app[r.number]).Stints)
      .map(obj)
      .map((s) => ({ compound: compound(s.Compound), laps: Math.max(0, num(s.TotalLaps) - num(s.StartLaps)), fresh: str(s.New) === "true" })),
  }));

  // A typical lap's three sectors: the middle of the field's latest times.
  const median = (xs: number[]) => {
    const v = xs.filter((x) => x > 0).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  };
  const refs = [0, 1, 2].map((i) => median(rows.map((r) => num(r.sectors[i]?.value))));
  const sectorRef = refs.every((x) => x > 0) ? (refs as [number, number, number]) : null;

  const photos: Record<string, string> = {};
  for (const [no, raw] of Object.entries(drivers)) {
    const d = obj(raw);
    const url = driverPhoto({ publicId: str(d.PublicIdRight) || null, team: str(d.TeamName), reference: str(d.Reference) || null }, 160);
    const code = byNo.get(no)?.code ?? str(d.Tla);
    if (url && code) photos[code] = url;
  }

  const lapPositions = Object.entries(obj(state.LapSeries))
    .map(([no, v]) => {
      const r = byNo.get(no);
      return { code: r?.code ?? no, colour: r?.colour ?? "#888888", positions: list(obj(v).LapPosition).map(num) };
    })
    .filter((d) => d.positions.length > 1);

  // Each car's bests: speed traps, sectors, lap.
  const speed = (v: unknown) => {
    const n = Number(str(obj(v).Value));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const stats: LiveStats[] = Object.entries(obj(obj(state.TimingStats).Lines)).flatMap(([no, v]) => {
    const r = byNo.get(no);
    if (!r) return [];
    const l = obj(v);
    const bs = obj(l.BestSpeeds);
    const sectors = list(l.BestSectors).map((x) => str(obj(x).Value) || null);
    return [
      {
        code: r.code,
        colour: r.colour,
        team: r.team,
        speeds: { i1: speed(bs.I1), i2: speed(bs.I2), fl: speed(bs.FL), st: speed(bs.ST) },
        bestSectors: [sectors[0] ?? null, sectors[1] ?? null, sectors[2] ?? null] as [string | null, string | null, string | null],
        personalBest: str(obj(l.PersonalBestLapTime).Value) || null,
      },
    ];
  });

  // Every pit stop so far: lap, time standing, time in the lane.
  const pitStops: LivePitStop[] = Object.entries(obj(obj(state.PitStopSeries).PitTimes))
    .flatMap(([no, v]) => {
      const r = byNo.get(no);
      return list(v).map((e) => {
        const p = obj(obj(e).PitStop);
        const n = (x: unknown) => (Number.isFinite(Number(str(x))) && str(x) !== "" ? Number(str(x)) : null);
        return { code: r?.code ?? no, colour: r?.colour ?? "#888888", lap: num(p.Lap), stationary: n(p.PitStopTime), lane: n(p.PitLaneTime), utc: str(obj(e).Timestamp) };
      });
    })
    .sort((a, b) => b.utc.localeCompare(a.utc));

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

  const lap = lapCount.TotalLaps ? { current: num(lapCount.CurrentLap), total: num(lapCount.TotalLaps) } : null;
  return withVersions({
    at: new Date().toISOString(),
    sessionKey: num(si.Key) || info.Key,
    circuitKey: num(obj(meeting.Circuit).Key) || null,
    path: str(si.Path) || info.Path || null,
    sectorRef,
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
    lap,
    remaining: str(clock.Remaining) || null,
    clockAt: str(clock.Utc) || null,
    clockRunning: clock.Extrapolating === true,
    weather: Object.keys(w).length
      ? { air: num(w.AirTemp), track: num(w.TrackTemp), humidity: num(w.Humidity), wind: num(w.WindSpeed), rain: num(w.Rainfall) > 0 }
      : null,
    commentary: commentaryOf(state),
    rows,
    raceControl,
    radio,
    stints,
    prediction,
    photos,
    lapPositions: type === "Race" ? lapPositions : [],
    stats,
    pitStops,
  });
}

// ---- sending only what changed -----------------------------------------------
// Most of a full read barely moves between two polls: race control, radio,
// stints, pit stops, the lap chart, portraits. Each gets a fingerprint when
// the read is parsed (once, on the server, for every reader); a reader sends
// back the fingerprints it holds and gets only the parts that changed, so a
// poll carries the timing rows and little else.

export const SLOW_PARTS = ["raceControl", "radio", "stints", "prediction", "photos", "lapPositions", "stats", "pitStops"] as const;

const fingerprint = (v: unknown) => {
  const s = JSON.stringify(v ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${(h >>> 0).toString(36)}${s.length.toString(36)}`;
};

export function withVersions(s: LiveSnapshot): LiveSnapshot {
  if (s.versions) return s;
  return { ...s, versions: Object.fromEntries(SLOW_PARTS.map((k) => [k, fingerprint(s[k])])) };
}

/** The snapshot without the parts the reader already holds (`have`: "radio.k3x9,stints.p2…"). */
export function without(s: LiveSnapshot, have: string | null): LiveSnapshot {
  if (!have) return s;
  const held = new Set(have.split(","));
  const v = withVersions(s);
  const same = SLOW_PARTS.filter((k) => held.has(`${k}.${v.versions![k]}`));
  if (!same.length) return v;
  const out: LiveSnapshot = { ...v, same };
  for (const k of same) delete out[k];
  return out;
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
  const { raceControl, radio, stints, prediction, photos, lapPositions, transcripts, stats, pitStops, versions, telemetry, ...rest } = s;
  void versions;
  void telemetry;
  void stats;
  void pitStops;
  void stints;
  void prediction;
  void photos;
  void lapPositions;
  void transcripts;
  return {
    ...rest,
    rows: rest.rows.map((r) => ({ ...r, sectors: r.sectors.map((x) => ({ ...x, segments: [] })) })),
    // The newest message and radio clip, for the card's one-line note.
    raceControl: raceControl?.slice(0, 1),
    radio: radio?.slice(0, 1),
  };
}

/** Development only: a finished session from F1's archive, shown as if it were running. */
const ARCHIVE_TOPICS = ["SessionInfo", "SessionStatus", "TrackStatus", "LapCount", "ExtrapolatedClock", "DriverList", "TimingData", "TimingAppData", "TimingStats", "RaceControlMessages", "TeamRadio", "WeatherData", "ChampionshipPrediction", "LapSeries", "PitStopSeries", "AudioStreams"];

const infoFrom = (state: LiveState, fallbackPath?: string): CurrentSessionInfo | null => {
  const si = obj(state.SessionInfo);
  if (!si.Key) return null;
  return { Key: num(si.Key), Type: str(si.Type), Name: str(si.Name), StartDate: str(si.StartDate), EndDate: str(si.EndDate), GmtOffset: str(si.GmtOffset), Path: str(si.Path) || fallbackPath };
};

/** A finished session's final state from F1's archive (null until it's published). */
export async function archivedSession(path: string): Promise<LiveSnapshot | null> {
  const clean = path.replace(/^\/+|\/?$/g, "");
  const base = `https://livetiming.formula1.com/static/${clean}/`;
  const state: LiveState = {};
  await Promise.all(
    ARCHIVE_TOPICS.map(async (t) => {
      const res = await fetch(`${base}${t}.json`, { next: { revalidate: 86_400 } }).catch(() => null);
      if (res?.ok) state[t as keyof LiveState] = JSON.parse((await res.text()).replace(/^\uFEFF/, ""));
    }),
  );
  const info = infoFrom(state, `${clean}/`);
  if (!info || !state.TimingData) return null;
  return { ...parse(state, info), running: false, clockRunning: false };
}

/** Development only: a finished session shown as if running — at its end, or `t` seconds into its feed. */
export async function replay(path: string, t?: number): Promise<LiveAnswer> {
  let snap: LiveSnapshot | null;
  if (t !== undefined && Number.isFinite(t)) {
    const { stateAt } = await import("./f1-replay");
    const { state } = await stateAt(path, t);
    const info = infoFrom(state, path);
    snap = info ? parse(state, info) : null;
  } else {
    snap = await archivedSession(path);
  }
  return snap ? { live: true, snapshot: { ...snap, running: true, status: "Started", clockRunning: false } } : { live: false, next: null };
}

// ---- the last session, kept -------------------------------------------------
// Every session's final state is kept for six weeks, so between sessions the
// live centre still has the whole of the last one (timing, strategy, race
// control, radio, the title fight, the race story). If nobody had the page
// open when the flag fell, it is built once from F1's archive and kept.

const SESSION_DAYS = 45;
const LAST = "f1:session:last";

async function keepSession(snap: LiveSnapshot): Promise<void> {
  const store = getStore();
  await rememberSectors(snap.circuitKey, snap.sectorRef);
  await store.set(`f1:session:v3:${snap.sessionKey}`, snap, { ttlSeconds: SESSION_DAYS * 86_400 }).catch(() => {});
  await store.set(LAST, snap.sessionKey, { ttlSeconds: SESSION_DAYS * 86_400 }).catch(() => {});
}

interface IndexSession {
  Key: number;
  Name: string;
  EndDate: string;
  GmtOffset: string;
  Path?: string;
}

/** The latest session F1 lists as over (by its scheduled end, plus half an hour). */
async function latestFinished(): Promise<IndexSession | null> {
  const year = new Date().getUTCFullYear();
  for (const y of [year, year - 1]) {
    try {
      const res = await fetch(`https://livetiming.formula1.com/static/${y}/Index.json`, { next: { revalidate: 900 } });
      if (!res.ok) continue;
      const idx = JSON.parse((await res.text()).replace(/^\uFEFF/, "")) as { Meetings?: { Sessions?: IndexSession[] }[] };
      const done = (idx.Meetings ?? [])
        .flatMap((m) => m.Sessions ?? [])
        .filter((x) => x.Path && sessionTime(x.EndDate, x.GmtOffset) + AFTER_MS < Date.now())
        .sort((a, b) => sessionTime(a.EndDate, a.GmtOffset) - sessionTime(b.EndDate, b.GmtOffset));
      if (done.length) return done[done.length - 1];
    } catch {}
  }
  return null;
}

export async function lastSession(): Promise<LiveSnapshot | null> {
  const store = getStore();
  const [latest, pointer] = await Promise.all([latestFinished(), store.get<number>(LAST).catch(() => null)]);
  const want = latest?.Key ?? pointer;
  if (want) {
    const kept = await store.get<LiveSnapshot>(`f1:session:v3:${want}`).catch(() => null);
    if (kept) {
      void rememberSectors(kept.circuitKey, kept.sectorRef);
      return kept;
    }
  }
  if (latest?.Path) {
    const built = await archivedSession(latest.Path);
    if (built) {
      await keepSession(built);
      return built;
    }
  }
  // F1 hasn't published the newest yet: the one before, as kept.
  return pointer ? await store.get<LiveSnapshot>(`f1:session:v3:${pointer}`).catch(() => null) : null;
}

export async function getLive(opts: { fresh?: boolean; withLast?: boolean } = {}): Promise<LiveAnswer> {
  const info = await sessionInfo();
  if (!info || !inWindow(info)) {
    const start = info ? sessionTime(info.StartDate, info.GmtOffset) : 0;
    const next = start > Date.now() ? new Date(start).toISOString() : null;
    return { live: false, next, ...(opts.withLast ? { last: await lastSession().catch(() => null) } : {}) };
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
    // Car data on its own connection: if F1 holds it back (or it's slow), the timing still comes.
    const [state, cars] = await Promise.all([readLiveState(), readLiveState(["CarData.z"], 4000).catch(() => null)]);
    if (!state) return cached && cached.sessionKey === info.Key ? { live: true, snapshot: cached } : { live: false, next: null };
    const snap = parse(state, info);
    const readings = latestReadings(cars?.["CarData.z" as keyof LiveState]);
    if (Object.keys(readings).length) {
      const codes = new Map(snap.rows.map((r) => [r.number, r.code]));
      snap.telemetry = Object.fromEntries(Object.entries(readings).flatMap(([no, r]) => (codes.has(no) ? [[codes.get(no)!, r]] : [])));
    }
    await store.set(KEY, snap, { ttlSeconds: 3600 }).catch(() => {});
    await keepClassification(snap, info);
    // The flag has fallen: this is the session's final word, kept.
    if (!snap.running && /^(Finished|Finalised|Ends)$/.test(snap.status)) await keepSession(snap);
    return { live: true, snapshot: snap };
  } finally {
    await store.del(LOCK).catch(() => {});
  }
}

// ---- past sessions ------------------------------------------------------------

export interface PastMeeting {
  meeting: string;
  location: string;
  round: number;
  sessions: { name: string; path: string; end: string }[];
}

/** Every finished session of a season, newest meeting first (F1's archive index). */
export async function seasonSessions(year = new Date().getUTCFullYear()): Promise<PastMeeting[]> {
  try {
    const res = await fetch(`https://livetiming.formula1.com/static/${year}/Index.json`, { next: { revalidate: 900 } });
    if (!res.ok) return [];
    const idx = JSON.parse((await res.text()).replace(/^\uFEFF/, "")) as {
      Meetings?: { Name: string; Location: string; Number?: number; Sessions?: (IndexSession & { Type?: string })[] }[];
    };
    return (idx.Meetings ?? [])
      .filter((m) => (m.Number ?? 0) > 0 && !/testing/i.test(m.Name))
      .map((m) => ({
        meeting: m.Name,
        location: m.Location,
        round: m.Number ?? 0,
        sessions: (m.Sessions ?? [])
          .filter((x) => x.Path && sessionTime(x.EndDate, x.GmtOffset) + AFTER_MS < Date.now())
          .map((x) => ({ name: x.Name, path: x.Path!, end: new Date(sessionTime(x.EndDate, x.GmtOffset)).toISOString() })),
      }))
      .filter((m) => m.sessions.length > 0)
      .reverse();
  } catch {
    return [];
  }
}

/** One past session in full: what was kept, else F1's archive (then kept). */
export async function pastSession(path: string): Promise<LiveSnapshot | null> {
  const store = getStore();
  const key = `f1:past:v3:${path}`;
  const kept = await store.get<LiveSnapshot>(key).catch(() => null);
  if (kept) return kept;
  const built = await archivedSession(path);
  if (built) {
    await store.set(key, built, { ttlSeconds: 45 * 86_400 }).catch(() => {});
    void rememberSectors(built.circuitKey, built.sectorRef);
  }
  return built;
}
