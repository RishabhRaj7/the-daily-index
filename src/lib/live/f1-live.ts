import { getStore } from "@/lib/server/store";
import { currentSession, f1Fetch, radioUrl, readLiveState, sessionTime, type CurrentSessionInfo, type LiveState } from "./f1-signalr";
import type { ReplayTimeline } from "./f1-replay";
import { driverPhoto } from "@/lib/f1-assets";
import { rememberSectors } from "./f1-track";
import { latestReadings } from "./f1-telemetry";
import type {
  LiveLapHistory,
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
  const info = await resolveSession();
  infoMemo = { at: Date.now(), info };
  await store.set(INFO_KEY, infoMemo, { ttlSeconds: 60 }).catch(() => {});
  return info;
}

/**
 * Which session is current. F1's public static/SessionInfo.json used to say,
 * but F1 stopped updating it (it still named Saturday's qualifying while the
 * Mexico race ran on Sunday), so it is only one witness now:
 *
 *   schedule  the season's index in F1's archive (with the F1 TV token): the
 *             session whose window (15 minutes before its start to half an
 *             hour after its end) holds now, else the next one to start
 *   feed      when there's no token and the static file looks stale, the live
 *             feed is asked which session it is serving (its SessionInfo and
 *             SessionStatus only, at most every two minutes)
 *
 * Whichever names the later session wins.
 */
async function resolveSession(): Promise<CurrentSessionInfo | null> {
  const now = Date.now();
  const [stat, sched] = await Promise.all([currentSession().catch(() => null), scheduledSession(now).catch(() => null)]);
  const later = (a: CurrentSessionInfo | null, b: CurrentSessionInfo | null) =>
    !a ? b : !b ? a : sessionTime(b.StartDate, b.GmtOffset) > sessionTime(a.StartDate, a.GmtOffset) ? b : a;
  let info = later(stat, sched);
  if (!sched && (!stat || sessionTime(stat.EndDate, stat.GmtOffset) + AFTER_MS < now)) info = later(info, await peekedSession());
  // The schedule knows when, the static file (when it's the same session) knows its status.
  if (info && stat && info.Key === stat.Key && !info.SessionStatus) info = { ...info, SessionStatus: stat.SessionStatus };
  return info;
}

type IndexMeeting = { Name: string; Location: string; Number?: number; Sessions?: Array<{ Key: number; Type?: string; Name: string; StartDate: string; EndDate: string; GmtOffset: string; Path?: string }> };

/** From F1's season index (needs the token): the session on now, else the next one, else the last one. */
async function scheduledSession(now: number): Promise<CurrentSessionInfo | null> {
  if (!process.env.F1TV_TOKEN?.trim()) return null;
  const year = new Date(now).getUTCFullYear();
  const res = await f1Fetch(`https://livetiming.formula1.com/static/${year}/Index.json`, { next: { revalidate: 900 }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const idx = JSON.parse((await res.text()).replace(/^\uFEFF/, "")) as { Meetings?: IndexMeeting[] };
  const all = (idx.Meetings ?? []).flatMap((m) =>
    (m.Sessions ?? []).map((x) => ({
      Key: x.Key,
      Type: x.Type ?? x.Name,
      Name: x.Name,
      StartDate: x.StartDate,
      EndDate: x.EndDate,
      GmtOffset: x.GmtOffset,
      Path: x.Path,
      Meeting: { Key: 0, Name: m.Name, Location: m.Location, Number: m.Number },
    })),
  );
  const start = (x: CurrentSessionInfo) => sessionTime(x.StartDate, x.GmtOffset);
  const end = (x: CurrentSessionInfo) => sessionTime(x.EndDate, x.GmtOffset);
  const on = all.filter((x) => now >= start(x) - BEFORE_MS && now <= end(x) + AFTER_MS).sort((a, b) => start(b) - start(a))[0];
  if (on) return on;
  const next = all.filter((x) => start(x) > now).sort((a, b) => start(a) - start(b))[0];
  return next ?? all.filter((x) => end(x) < now).sort((a, b) => end(b) - end(a))[0] ?? null;
}

/** The session the live feed is serving, asked directly (two small topics), shared for two minutes. */
async function peekedSession(): Promise<CurrentSessionInfo | null> {
  const store = getStore();
  const kept = await store.get<{ at: number; info: CurrentSessionInfo | null }>("f1:live:peek:v1").catch(() => null);
  if (kept && Date.now() - kept.at < 120_000) return kept.info;
  const state = await readLiveState(["SessionInfo", "SessionStatus"], 5000).catch(() => null);
  const si = obj(state?.SessionInfo);
  const info = si.Key
    ? ({ ...(si as unknown as CurrentSessionInfo), SessionStatus: str(obj(state?.SessionStatus).Status) || str(si.SessionStatus) } as CurrentSessionInfo)
    : null;
  await store.set("f1:live:peek:v1", { at: Date.now(), info }, { ttlSeconds: 300 }).catch(() => {});
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

/**
 * The track's state. F1's TrackStatus usually says, but under a red flag it
 * can keep saying "Yellow" (the Mexico race, 1 Nov 2026: "RED FLAG - RACE
 * SUSPENDED" from race control and the session Aborted, TrackStatus 2), so a
 * suspended session, or a red flag race control hasn't lifted since, reads red.
 */
function trackNow(code: string, status: string, rc: LiveRaceControl[]): { tone: TrackTone; label: string } {
  if (status === "Aborted" || status === "Suspended") return TRACK["5"];
  if (!/^(Finished|Finalised|Ends)$/.test(status)) {
    // Newest first: a red flag counts until a restart or green light comes after it.
    const red = rc.findIndex((m) => m.flag === "RED" || /\bRED FLAG\b/i.test(m.message));
    const resumed = rc.findIndex((m) => m.flag === "GREEN" || /\b(SESSION|RACE) RESUMED\b|PIT EXIT (IS )?OPEN|\b(ROLLING|STANDING) START\b|\bTRACK CLEAR\b/i.test(m.message));
    if (red >= 0 && (resumed < 0 || resumed > red) && !/RESUME/i.test(rc[red].message)) return TRACK["5"];
  }
  return TRACK[code] ?? TRACK["1"];
}

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

  // Every pit stop so far: lap, time standing, time in the lane. F1 publishes
  // PitStopSeries to its archive, but no longer during a live session; then
  // the stops are read from the tyre stints (each new stint follows a stop at
  // the end of the laps run before it), with the lane time from
  // PitLaneTimeCollection when F1 sends it, and timed by the read that first
  // saw them (mergeStops, from poll to poll).
  const series: LivePitStop[] = Object.entries(obj(obj(state.PitStopSeries).PitTimes))
    .flatMap(([no, v]) => {
      const r = byNo.get(no);
      return list(v).map((e) => {
        const p = obj(obj(e).PitStop);
        const n = (x: unknown) => (Number.isFinite(Number(str(x))) && str(x) !== "" ? Number(str(x)) : null);
        return { code: r?.code ?? no, colour: r?.colour ?? "#888888", lap: num(p.Lap), stationary: n(p.PitStopTime), lane: n(p.PitLaneTime), utc: str(obj(e).Timestamp) };
      });
    })
    .sort((a, b) => b.utc.localeCompare(a.utc));
  const lanes = Object.values(obj(obj(state.PitLaneTimeCollection).PitTimes)).map(obj);
  const pitStops: LivePitStop[] = series.length
    ? series
    : Object.entries(app).flatMap(([no, raw]) => {
        const r = byNo.get(no);
        const stints = list(obj(raw).Stints).map(obj);
        let laps = 0;
        return stints.flatMap((s, i) => {
          const lap = laps;
          laps += Math.max(0, num(s.TotalLaps) - num(s.StartLaps));
          if (i === 0 || lap === 0) return [];
          const lane = lanes.find((p) => str(p.RacingNumber) === no && Math.abs(num(p.Lap) - lap) <= 1);
          const d = lane ? Number.parseFloat(str(lane.Duration)) : NaN;
          return [{ code: r?.code ?? no, colour: r?.colour ?? "#888888", lap, stationary: null, lane: Number.isFinite(d) ? d : null, utc: "" }];
        });
      });

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
    track: trackNow(str(obj(state.TrackStatus).Status), status, raceControl),
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

export const SLOW_PARTS = ["raceControl", "radio", "stints", "prediction", "photos", "lapPositions", "stats", "pitStops", "lapTimes"] as const;

const lapSecs = (t: string): number | null => {
  const m = /^(?:(\d+):)?(\d+\.\d+)$/.exec(t.trim());
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

/**
 * The lap history carried on: what was kept (for the same session) plus each
 * car's latest lap, filed under the lap it closed, and the lap now running if
 * it's behind a safety car, VSC or red flag.
 */
/**
 * Pit stops read from the stints carry no time: each keeps the time of the
 * read that first saw it, and a lane time once one arrives. Stops F1 sent
 * itself (PitStopSeries, with their own times) pass through as they are.
 */
export function mergeStops(prev: LivePitStop[] | undefined, now: LivePitStop[] | undefined, at: string, rc: LiveRaceControl[] = []): LivePitStop[] {
  const cur = now ?? [];
  if (cur.some((p) => p.utc)) return cur;
  const was = new Map((prev ?? []).map((p) => [`${p.code}:${p.lap}`, p]));
  // Stops made before this session was first read: timed by race control's
  // clock for the lap after (its earliest message on that lap).
  const lapClock = new Map<number, string>();
  for (const m of rc) if (m.lap !== null && (!lapClock.has(m.lap) || m.utc < lapClock.get(m.lap)!)) lapClock.set(m.lap, m.utc);
  const ms = (t: string) => Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(t) ? t : `${t}Z`);
  const known = [...lapClock].map(([lap, t]) => [lap, ms(t)] as const).filter(([, t]) => Number.isFinite(t)).sort((a, b) => a[0] - b[0]);
  // A lap race control said nothing on sits between the laps it did, in proportion.
  const utcOf = (lap: number) => {
    const want = lap + 1;
    const before = [...known].reverse().find(([l]) => l <= want);
    const after = known.find(([l]) => l >= want);
    if (before && after && after[0] !== before[0]) return new Date(before[1] + ((after[1] - before[1]) * (want - before[0])) / (after[0] - before[0])).toISOString();
    // Past the last lap race control spoke on: carried on at the race's average lap.
    const span = known.length >= 2 ? (known.at(-1)![1] - known[0][1]) / Math.max(1, known.at(-1)![0] - known[0][0]) : 0;
    const one = before ?? after;
    if (!one) return at;
    const t = Math.min(one[1] + span * (want - one[0]), Date.parse(at));
    return new Date(t).toISOString();
  };
  const first = !prev?.length;
  return cur
    .map((p) => {
      const old = was.get(`${p.code}:${p.lap}`);
      return { ...p, utc: old?.utc || (first ? utcOf(p.lap) : at), lane: p.lane ?? old?.lane ?? null };
    })
    .sort((a, b) => b.utc.localeCompare(a.utc) || b.lap - a.lap);
}

export function addLaps(prev: LiveLapHistory | undefined, snap: LiveSnapshot): LiveLapHistory {
  const times: LiveLapHistory["times"] = Object.fromEntries(Object.entries(prev?.times ?? {}).map(([k, v]) => [k, [...v]]));
  for (const r of snap.rows) {
    const t = lapSecs(r.last);
    if (!r.laps || t === null) continue;
    const list = (times[r.code] ??= []);
    while (list.length < r.laps) list.push(null);
    list[r.laps - 1] = t;
  }
  const neutral = new Set(prev?.neutral ?? []);
  const lap = snap.lap?.current;
  if (lap && /^(sc|vsc|red)$/.test(snap.track.tone)) neutral.add(lap);
  return { times, neutral: [...neutral].sort((a, b) => a - b) };
}

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
  const { raceControl, radio, stints, prediction, photos, lapPositions, transcripts, stats, pitStops, versions, telemetry, lapTimes, ...rest } = s;
  void versions;
  void lapTimes;
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
      const res = await f1Fetch(`${base}${t}.json`, { next: { revalidate: 86_400 } }).catch(() => null);
      if (res?.ok) state[t as keyof LiveState] = JSON.parse((await res.text()).replace(/^\uFEFF/, ""));
    }),
  );
  const info = infoFrom(state, `${clean}/`);
  if (!info || !state.TimingData) return null;
  return { ...parse(state, info), running: false, clockRunning: false };
}

/** A finished session shown as if running — at its end, or `t` seconds into its feed. */
export async function replay(path: string, t?: number): Promise<LiveAnswer> {
  let snap: LiveSnapshot | null;
  if (t !== undefined && Number.isFinite(t)) {
    const { stateAt } = await import("./f1-replay");
    const { state, laps } = await stateAt(path, t);
    const info = infoFrom(state, path);
    snap = info ? withVersions({ ...parse(state, info), versions: undefined, lapTimes: laps }) : null;
  } else {
    snap = await archivedSession(path);
  }
  return snap ? { live: true, snapshot: { ...snap, running: true, status: "Started", clockRunning: false } } : { live: false, next: null };
}

// ---- the last session, kept -------------------------------------------------
// Every session's final state is kept for the season, so between sessions the
// live centre still has the whole of the last one (timing, strategy, race
// control, radio, the title fight, the race story), and the past-sessions list
// can open any of them. If nobody had the page open when the flag fell, it is
// read once from the live feed, which holds a finished session's final state
// until the next one starts (F1's archive answers only with the F1 TV token).

const SESSION_DAYS = 400;
const LAST = "f1:session:last";
// Every kept session, scored by its end: one JSON line each (KeptEntry).
const KEPT_INDEX = "f1:session:kept:v1";

export async function replayTimeline(path: string): Promise<ReplayTimeline | null> {
  const { timeline } = await import("./f1-replay");
  return timeline(path);
}

interface KeptEntry {
  key: number;
  path: string;
  meeting: string;
  location: string;
  round: number;
  name: string;
  end: string;
}

async function keepSession(snap: LiveSnapshot, info?: CurrentSessionInfo, round = 0): Promise<void> {
  const store = getStore();
  await rememberSectors(snap.circuitKey, snap.sectorRef);
  // The one kept before this, listed before the pointer moves on (it may predate the index).
  const before = await store.get<number>(LAST).catch(() => null);
  if (before && before !== snap.sessionKey && !indexed.has(before)) {
    const prev = await store.get<LiveSnapshot>(`f1:session:v3:${before}`).catch(() => null);
    if (prev) await indexSession(prev);
  }
  await store.set(`f1:session:v3:${snap.sessionKey}`, snap, { ttlSeconds: SESSION_DAYS * 86_400 }).catch(() => {});
  await store.set(LAST, snap.sessionKey, { ttlSeconds: SESSION_DAYS * 86_400 }).catch(() => {});
  await indexSession(snap, info, round);
}

// Sessions this instance has already listed (the poll between sessions asks every minute).
const indexed = new Set<number>();

/** Lists a kept session for the past-sessions picker (the same line again is a no-op). */
async function indexSession(snap: LiveSnapshot, info?: CurrentSessionInfo, round = 0): Promise<void> {
  if (!snap.path || indexed.has(snap.sessionKey)) return;
  indexed.add(snap.sessionKey);
  const end = info ? sessionTime(info.EndDate, info.GmtOffset) : Date.parse(snap.at);
  const entry: KeptEntry = { key: snap.sessionKey, path: snap.path, meeting: snap.meeting, location: snap.location, round, name: snap.session, end: new Date(end).toISOString() };
  await getStore().zadd(KEPT_INDEX, end, JSON.stringify(entry)).catch(() => {});
}

async function keptEntries(): Promise<KeptEntry[]> {
  const lines = await getStore()
    .zrevrangeFrom(KEPT_INDEX, Date.now() - SESSION_DAYS * 86_400_000, 500)
    .catch(() => [] as string[]);
  const seen = new Set<number>();
  // Redis (Upstash) hands JSON members back already parsed; memory hands back the text.
  return (lines as unknown[]).flatMap((l) => {
    try {
      const e = (typeof l === "string" ? JSON.parse(l) : l) as KeptEntry;
      if (!e?.key || !e.path || seen.has(e.key)) return [];
      seen.add(e.key);
      return [e];
    } catch {
      return [];
    }
  });
}

const OVER = /^(Finished|Finalised|Ends)$/;

const startOf = (info: CurrentSessionInfo) => sessionTime(info.StartDate, info.GmtOffset);

/**
 * Over: F1 says so, or it is half an hour past its scheduled end — and never
 * before its scheduled start. Between sessions F1 sometimes runs rehearsal
 * data through the live feed under a session still to come, already marked
 * "Ends" (the Mexico race showed up at "lap 3 of 56" the day before it ran),
 * and that must not be kept as the session.
 */
function isOver(info: CurrentSessionInfo, now = Date.now()): boolean {
  if (now < startOf(info)) return false;
  return OVER.test(info.SessionStatus ?? "") || sessionTime(info.EndDate, info.GmtOffset) + AFTER_MS < now;
}

/** A copy kept before its session's scheduled start is rehearsal data: dropped, so the real session is read. */
async function droppedIfEarly(kept: LiveSnapshot | null, info: CurrentSessionInfo): Promise<LiveSnapshot | null> {
  if (!kept || kept.sessionKey !== info.Key || Date.parse(kept.at) >= startOf(info)) return kept;
  const store = getStore();
  await Promise.all([
    store.del(`f1:session:v3:${info.Key}`),
    store.del(`f1:session:settled:${info.Key}`),
  ]).catch(() => {});
  return null;
}

/**
 * The session F1's feed names as current, once it is over: its final state as
 * the feed still holds it, kept. One reader connects (a short lock); a feed
 * that won't answer is left alone for a few minutes.
 */
async function finishedFromFeed(info: CurrentSessionInfo, prev?: LiveSnapshot | null): Promise<LiveSnapshot | null> {
  const store = getStore();
  if (!isOver(info)) return null;
  if (!(await store.setIfAbsent(`f1:session:feedread:${info.Key}`, 1, 300).catch(() => true))) return null;
  const state = await readLiveState().catch(() => null);
  if (!state || num(obj(state.SessionInfo).Key) !== info.Key || !state.TimingData) return null;
  // A re-read keeps the lap-by-lap history that was gathered while it ran (the feed's final state has no history).
  const lapTimes = prev?.sessionKey === info.Key ? prev.lapTimes : undefined;
  const snap = withVersions({ ...parse(state, info), versions: undefined, running: false, clockRunning: false, ...(lapTimes ? { lapTimes } : {}) });
  await keepSession(snap, info, num(obj(obj(state.SessionInfo).Meeting).Number) || (info.Meeting?.Number ?? 0));
  return snap;
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
      const res = await f1Fetch(`https://livetiming.formula1.com/static/${y}/Index.json`, { next: { revalidate: 900 } });
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
  const [info, pointer] = await Promise.all([sessionInfo(), store.get<number>(LAST).catch(() => null)]);
  // The feed's own session, once over, is the latest; F1's index only if the feed names none.
  const current = info && isOver(info) ? info : null;
  const latest = current ? null : await latestFinished();
  const want = current?.Key ?? latest?.Key ?? pointer;
  if (want) {
    const stored = await store.get<LiveSnapshot>(`f1:session:v3:${want}`).catch(() => null);
    const kept = current ? await droppedIfEarly(stored, current) : stored;
    if (kept) {
      void rememberSectors(kept.circuitKey, kept.sectorRef);
      // Sessions kept before the index existed join it here.
      const same = current?.Key === kept.sessionKey ? current : undefined;
      await indexSession(kept, same, same?.Meeting?.Number ?? 0);
      return kept;
    }
  }
  // The newest session not kept yet: from the feed while it still holds it, else F1's archive when it answers.
  if (current) {
    const read = await finishedFromFeed(current);
    if (read) return read;
  }
  const path = current?.Path ?? latest?.Path;
  if (path) {
    const built = await archivedSession(path);
    if (built) {
      await keepSession(built, current ?? undefined, current?.Meeting?.Number ?? 0);
      return built;
    }
  }
  // F1 hasn't published the newest yet: the one before, as kept.
  return pointer ? await store.get<LiveSnapshot>(`f1:session:v3:${pointer}`).catch(() => null) : null;
}

export async function getLive(opts: { fresh?: boolean; withLast?: boolean } = {}): Promise<LiveAnswer> {
  const info = await sessionInfo();
  // A session still running past its window (a red flag) stays live while the last read says so.
  const held = info ? await getStore().get<LiveSnapshot>(KEY).catch(() => null) : null;
  const overrun = !!info && held?.sessionKey === info.Key && held.running && Date.now() - Date.parse(held.at) < 10 * 60_000;
  if (!info || !(inWindow(info) || overrun)) {
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
    // F1 sends it only to a signed-in F1 TV account: F1TV_TOKEN is that account's
    // subscription token (see .env.example). Without it, or once it expires, the
    // car read comes back empty and nothing else changes.
    const f1tv = process.env.F1TV_TOKEN?.trim() || undefined;
    const [state, cars] = await Promise.all([readLiveState(), f1tv ? readLiveState(["CarData.z"], 4000, f1tv).catch(() => null) : null]);
    if (!state) return cached && cached.sessionKey === info.Key ? { live: true, snapshot: cached } : { live: false, next: null };
    // The lap history: kept from the last read of this session, with this read's laps added.
    const parsed = parse(state, info);
    const same = cached?.sessionKey === info.Key;
    const snap = withVersions({
      ...parsed,
      versions: undefined,
      lapTimes: addLaps(same ? cached.lapTimes : undefined, parsed),
      pitStops: mergeStops(same ? cached.pitStops : undefined, parsed.pitStops, parsed.at, parsed.raceControl),
    });
    const readings = latestReadings(cars?.["CarData.z" as keyof LiveState]);
    if (Object.keys(readings).length) {
      const codes = new Map(snap.rows.map((r) => [r.number, r.code]));
      snap.telemetry = Object.fromEntries(Object.entries(readings).flatMap(([no, r]) => (codes.has(no) ? [[codes.get(no)!, r]] : [])));
    }
    await store.set(KEY, snap, { ttlSeconds: 3600 }).catch(() => {});
    await keepClassification(snap, info);
    // The flag has fallen: this is the session's final word, kept.
    if (!snap.running && OVER.test(snap.status) && Date.now() >= startOf(info)) await keepSession(snap, info, num(obj(obj(state.SessionInfo).Meeting).Number) || (info.Meeting?.Number ?? 0));
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

/** The season as kept here (when F1's archive index won't answer): newest meeting first. */
async function keptSeason(year: number): Promise<PastMeeting[]> {
  const meetings = new Map<string, PastMeeting>();
  // Oldest first, so each meeting's sessions run in order.
  for (const e of (await keptEntries()).filter((x) => x.path.startsWith(`${year}/`)).reverse()) {
    const id = e.path.split("/")[1];
    const m = meetings.get(id) ?? { meeting: e.meeting, location: e.location, round: e.round, sessions: [] };
    if (!m.round && e.round) m.round = e.round;
    m.sessions.push({ name: e.name, path: e.path, end: e.end });
    meetings.set(id, m);
  }
  return [...meetings.values()].reverse();
}

/** Every finished session of a season, newest meeting first (F1's archive index, else what was kept). */
export async function seasonSessions(year = new Date().getUTCFullYear()): Promise<PastMeeting[]> {
  try {
    const res = await f1Fetch(`https://livetiming.formula1.com/static/${year}/Index.json`, { next: { revalidate: 900 } });
    if (!res.ok) return keptSeason(year);
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
    return keptSeason(year);
  }
}

/** One past session in full: what was kept, else F1's archive (then kept). */
export async function pastSession(path: string): Promise<LiveSnapshot | null> {
  const store = getStore();
  const key = `f1:past:v3:${path}`;
  const kept = await store.get<LiveSnapshot>(key).catch(() => null);
  if (kept) return kept;
  const entry = (await keptEntries()).find((e) => e.path === path);
  const session = entry ? await store.get<LiveSnapshot>(`f1:session:v3:${entry.key}`).catch(() => null) : null;
  if (session) return session;
  const built = await archivedSession(path);
  if (built) {
    await store.set(key, built, { ttlSeconds: 45 * 86_400 }).catch(() => {});
    void rememberSectors(built.circuitKey, built.sectorRef);
  }
  return built;
}
