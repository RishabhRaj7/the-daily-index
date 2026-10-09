import { AsyncLocalStorage } from "node:async_hooks";
import { F1_DRIVERS, F1_DRIVER_SEASON } from "@/lib/config/f1-drivers";
import { LOCAL_CIRCUITS } from "@/lib/config/f1-circuits";
import { getStore } from "@/lib/server/store";
import type {
  F1Race,
  F1Session,
  F1Standing,
  F1RosterEntry,
  F1LastRace,
  F1ConstructorStanding,
  F1GridResult,
  F1LiveResult,
  F1Phase,
  F1SessionResult,
  F1SessionTop,
} from "@/lib/types";
// Staged slices of LiveF1Data — each maps to one block of the F1 sidebar and
// is fetched independently so the section can render progressively:
//   schedule  — fastest (one memoized call): next race + upcoming calendar.
//   standings — championship tables (OpenF1 ×2 + Ergast wins, parallelised).
//   session   — last race result + next race's starting grid (the slow tail).
// Staged slices of the sidebar, in the exact order the reader sees them fill
// in. Each maps to one block and is fetched independently so the section
// renders progressively and a failure is scoped to its own block:
//
//   1. map          — next race + circuit map (fastest, leads the sidebar)
//   2. drivers      — driver details (static data; no upstream call at all)
//   3. calendar     — upcoming race calendar
//   4. constructors — constructors' championship
//   5. standings    — drivers' championship
//   6. results      — latest race result + starting grid (slowest tail)
export interface F1MapData {
  nextRace: F1Race;
}

export interface F1DriversData {
  drivers: F1RosterEntry[];
}

export interface F1CalendarData {
  upcoming: F1Race[];
}

export interface F1ConstructorsData {
  constructorStandings: F1ConstructorStanding[];
}

export interface F1DriverStandingsData {
  standings: F1Standing[];
}

export interface F1ResultsData {
  lastRace: F1LastRace | null;
  qualifyingGrid: F1GridResult[];
  liveResults: F1LiveResult[];
  currentRace: F1Race | null;
  racePhase: F1Phase;
  /** During practice (and sprint sessions), the latest finished session. */
  session?: F1SessionResult | null;
  /** The Grand Prix this weekend's grid or session belongs to. */
  weekendName?: string | null;
  /** When qualifying set the grid. */
  gridSetAt?: string | null;
  /** Each finished session of the weekend → its quickest driver. */
  tops?: Record<string, F1SessionTop>;
  /** Qualifying is over but its grid hasn't been released yet. */
  gridPending?: boolean;
}

/** Composite used for SSR of the fast part (map + calendar). */
export interface F1ScheduleData {
  nextRace: F1Race;
  upcoming: F1Race[];
}

// Shape returned by /api/f1 for each part — the ok/error split lets the
// client offer a scoped retry instead of a dead "unavailable" panel.
export interface F1PartSuccess<T> {
  ok: true;
  data: T;
  fetchedAt: string;
}
export interface F1PartFailure {
  ok: false;
  error: string;
  fetchedAt: string;
}
export type F1PartResult<T> = F1PartSuccess<T> | F1PartFailure;

const OPENF1_API = "https://api.openf1.org/v1";
const JOLPICA_API = "https://api.jolpi.ca/ergast/f1";
// A race counts as finished (and its result settled) this long after the
// session's scheduled end; qualifying and practice a little sooner.
const SETTLE_MS = 20 * 60 * 1000;
// Sessions often overrun (red flags) and OpenF1 locks its data until they
// end, so a session counts as finished half an hour after its scheduled end.
const SESSION_SETTLE_MS = 30 * 60 * 1000;

// Jolpica (Ergast) constructor names → the OpenF1 team names the rest of the
// sidebar (team colours, badges, the static roster) is keyed on. Confirmed
// against live data from both APIs — extend if a new mismatch shows up.
const JOLPICA_TEAM_NAMES: Record<string, string> = {
  "Red Bull": "Red Bull Racing",
  "RB F1 Team": "Racing Bulls",
  "Alpine F1 Team": "Alpine",
  "Cadillac F1 Team": "Cadillac",
};

function teamFromJolpica(name: string): string {
  return JOLPICA_TEAM_NAMES[name] ?? name;
}

// ---- OpenF1 pacing ------------------------------------------------------------
// The free OpenF1 tier allows 3 requests/second and 30/minute. Every OpenF1
// call in this process waits for a slot in both windows, so a cold sidebar
// (several parts at once) can never trip the limit. Upstream responses are
// also cached (Next Data Cache + the memo below), so most renders make no
// OpenF1 call at all.
const OPENF1_PER_SECOND = 3;
const OPENF1_PER_MINUTE = 30;
const openF1Calls: number[] = [];
let openF1Queue: Promise<void> = Promise.resolve();

function waitForOpenF1Slot(): Promise<void> {
  const turn = openF1Queue.then(async () => {
    for (;;) {
      const now = Date.now();
      while (openF1Calls.length && now - openF1Calls[0] >= 60_000) openF1Calls.shift();
      const lastSecond = openF1Calls.filter((t) => now - t < 1000);
      if (openF1Calls.length < OPENF1_PER_MINUTE && lastSecond.length < OPENF1_PER_SECOND) {
        openF1Calls.push(now);
        return;
      }
      const waitMs =
        openF1Calls.length >= OPENF1_PER_MINUTE
          ? 60_000 - (now - openF1Calls[0])
          : 1000 - (now - lastSecond[0]);
      await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 20)));
    }
  });
  // The queue only orders callers; one failure must not block the next.
  openF1Queue = turn.catch(() => {});
  return turn;
}

interface OpenF1Session {
  session_key: number;
  meeting_key: number;
  session_name: string;
  date_start: string;
  date_end: string;
  country_name: string;
  circuit_short_name: string;
  location: string;
  year: number;
}

interface OpenF1Meeting {
  meeting_key: number;
  circuit_image: string | null;
}

interface OpenF1Driver {
  driver_number: number;
  full_name: string;
  first_name: string;
  last_name: string;
  name_acronym: string;
  team_name: string;
}

interface OpenF1WeekendResult {
  driver_number: number;
  position: number | null;
  duration?: number | (number | null)[] | null;
  gap_to_leader: number | string | (number | string | null)[] | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
}

interface OpenF1Result {
  driver_number: number;
  position: number | null;
  number_of_laps: number;
  points: number;
  duration?: number | null;
  gap_to_leader: number | string | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
}

interface JolpicaDriverStanding {
  position: string;
  points: string;
  wins: string;
  Driver: { code?: string; givenName: string; familyName: string; permanentNumber?: string };
  Constructors: { name: string }[];
}

interface JolpicaConstructorStanding {
  position: string;
  points: string;
  wins: string;
  Constructor: { name: string };
}

interface JolpicaStandingsResponse {
  MRData: {
    StandingsTable: {
      StandingsLists: Array<{
        DriverStandings?: JolpicaDriverStanding[];
        ConstructorStandings?: JolpicaConstructorStanding[];
      }>;
    };
  };
}

interface F1DataProvider {
  getLiveResults(sessionKey: number): Promise<F1LiveResult[]>;
}

// Live timing is deliberately isolated. The free OpenF1 API does not expose it.
const paidLiveProvider: F1DataProvider | null = null;

// ---------------------------------------------------------------------------
// In-memory memo layer. Every F1 read used to go through `getLiveF1`, which
// ran ~10 sequential HTTP calls on the page's critical path and could not be
// split. The staged fetchers below share this short-lived (10 min) per-process
// memo on top of the Next.js Data Cache, so the page render, the /api/f1 parts
// and the settings/layout roster call all reuse the same upstream responses
// instead of re-asking OpenF1 for the same season sessions / driver lists.
// ---------------------------------------------------------------------------
const MEMO_TTL_MS = 10 * 60 * 1000;
const memoStore = new Map<string, { at: number; value: unknown }>();
const memoInflight = new Map<string, Promise<unknown>>();

// ---- where the data comes from ------------------------------------------------
// OpenF1 first. While any session is running it shuts every endpoint, past
// races included, to keyless callers — a whole Friday afternoon can go dark —
// and it can simply be down. So:
//   1. every good OpenF1 answer is kept in the store (Redis) for weeks, keyed
//      by the race weekend rather than OpenF1's ids, and served when OpenF1
//      won't answer;
//   2. with nothing kept, Jolpica (the Ergast successor, never locked) stands
//      in: the calendar and session times, race, sprint and qualifying
//      classifications. Practice times exist only in OpenF1, so they come
//      from what was kept.
// The Pit wall's ↻ Refresh runs in a fresh scope: no memo, no Data Cache,
// OpenF1 asked again first, then the same fallbacks.
const freshScope = new AsyncLocalStorage<boolean>();
const isFreshRead = () => freshScope.getStore() === true;

/** Run `fn` with every F1 cache skipped (the Pit wall's refresh). */
export function withFreshF1<T>(fn: () => Promise<T>): Promise<T> {
  return freshScope.run(true, fn);
}

const KEPT_DAYS = 21;

/** Ask upstream; keep a good answer, and fall back to the last kept one. */
async function kept<T>(key: string, ask: () => Promise<T | null>, good: (v: T) => boolean, days = KEPT_DAYS): Promise<T | null> {
  const store = getStore();
  const answer = await ask().catch(() => null);
  if (answer != null && good(answer)) {
    await store.set(`f1:kept:v1:${key}`, answer, { ttlSeconds: days * 86_400 }).catch(() => {});
    return answer;
  }
  const last = await store.get<T>(`f1:kept:v1:${key}`).catch(() => null);
  return last != null && good(last) ? last : null;
}

/** A race weekend's id across sources: the race's UTC date. */
const raceDay = (race: { date_start: string }) => race.date_start.slice(0, 10);

function memoized<T>(
  key: string,
  fn: () => Promise<T>,
  shouldCache: (value: T) => boolean = () => true,
): Promise<T> {
  const fresh = isFreshRead();
  const hit = memoStore.get(key);
  if (!fresh && hit && Date.now() - hit.at < MEMO_TTL_MS) {
    return Promise.resolve(hit.value as T);
  }
  const pending = memoInflight.get(key);
  if (pending && !fresh) return pending as Promise<T>;
  const promise = fn()
    .then((value) => {
      // Empty-looking results (a transient 5xx/429 answered by openF1()'s
      // null path) are deliberately NOT cached — the next call retries
      // instead of serving the hollow answer for ten minutes.
      if (shouldCache(value)) memoStore.set(key, { at: Date.now(), value });
      memoInflight.delete(key);
      return value;
    })
    .catch((err) => {
      memoInflight.delete(key);
      throw err;
    });
  memoInflight.set(key, promise);
  return promise;
}

/** "Refresh edition" purge — drops the process-level memo; the fetch-level
 *  Data Cache is invalidated by the route handler via revalidatePath("/"). */
export function clearF1Memo(): void {
  memoStore.clear();
  memoInflight.clear();
}

async function openF1<T>(path: string, revalidate = 3600): Promise<T | null> {
  try {
    const init: RequestInit = isFreshRead() ? { cache: "no-store" } : { next: { revalidate } };
    await waitForOpenF1Slot();
    let response = await fetch(`${OPENF1_API}/${path}`, init);
    if (response.status === 429) {
      // Another instance used the budget; one paced retry, then give up.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await waitForOpenF1Slot();
      response = await fetch(`${OPENF1_API}/${path}`, init);
    }
    if (!response.ok) {
      // OpenF1 answers 404 when a query has no rows yet — e.g. the next
      // race's starting_grid before qualifying. That is "no data", not a
      // failure, so it stays out of the error log.
      // A 401 is the live-session lockout: expected, and answered by the
      // fallbacks, so it is logged once as a note rather than an error.
      if (response.status === 401) console.warn(`openF1 locked (live session): ${path}`);
      else if (response.status !== 404) {
        console.error(`openF1 failed: ${path} -> ${response.status} ${response.statusText}`);
      }
      return null;
    }
    return await response.json() as T;
  } catch (err) {
    console.error(`openF1 error: ${path}`, err);
    return null;
  }
}

// Jolpica (the Ergast successor) serves both championship tables — with
// positions, points and wins — in one request each.
async function jolpica<T>(path: string, revalidate = 900): Promise<T | null> {
  try {
    const init: RequestInit = isFreshRead() ? { cache: "no-store" } : { next: { revalidate } };
    const response = await fetch(`${JOLPICA_API}/${path}`, init);
    if (!response.ok) {
      console.error(`jolpica failed: ${path} -> ${response.status} ${response.statusText}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (err) {
    console.error(`jolpica error: ${path}`, err);
    return null;
  }
}

// ---- Jolpica stand-ins ---------------------------------------------------------
// Shaped like OpenF1's answers so everything downstream reads one form. Its
// sessions carry negative keys (−round for the weekend, −(round·10 + n) for
// each session) so they can never be sent to OpenF1 by mistake.

interface JolpicaSlot {
  date: string;
  time?: string;
}

interface JolpicaRace extends Partial<Record<"FirstPractice" | "SecondPractice" | "ThirdPractice" | "Qualifying" | "Sprint" | "SprintQualifying" | "SprintShootout", JolpicaSlot>> {
  season: string;
  round: string;
  date: string;
  time?: string;
  Circuit: { circuitId: string; circuitName: string; Location: { locality: string; country: string } };
}

interface JolpicaClassified {
  number: string;
  position: string;
  points?: string;
  laps?: string;
  status?: string;
  Time?: { millis?: string; time: string };
  Q1?: string;
  Q2?: string;
  Q3?: string;
}

interface JolpicaRacesResponse {
  MRData: { RaceTable: { Races: Array<JolpicaRace & { Results?: JolpicaClassified[]; SprintResults?: JolpicaClassified[]; QualifyingResults?: JolpicaClassified[] }> } };
}

// How long each session runs, for the end times Jolpica doesn't give.
const SESSION_MINUTES: Record<string, number> = {
  "Practice 1": 60, "Practice 2": 60, "Practice 3": 60, "Sprint Qualifying": 45, Sprint: 60, Qualifying: 60, Race: 120,
};

function jolpicaSession(r: JolpicaRace, name: string, slot: JolpicaSlot, n: number): OpenF1Session {
  const round = Number(r.round);
  const start = new Date(`${slot.date}T${slot.time ?? "12:00:00Z"}`);
  return {
    session_key: -(round * 10 + n),
    meeting_key: -round,
    session_name: name,
    date_start: start.toISOString(),
    date_end: new Date(start.getTime() + (SESSION_MINUTES[name] ?? 60) * 60_000).toISOString(),
    country_name: r.Circuit.Location.country,
    circuit_short_name: r.Circuit.Location.locality,
    location: r.Circuit.Location.locality,
    year: Number(r.season),
  };
}

function jolpicaWeekend(r: JolpicaRace): OpenF1Session[] {
  const slots: [string, JolpicaSlot | undefined][] = [
    ["Practice 1", r.FirstPractice],
    ["Sprint Qualifying", r.SprintQualifying ?? r.SprintShootout],
    ["Practice 2", r.SecondPractice],
    ["Sprint", r.Sprint],
    ["Practice 3", r.ThirdPractice],
    ["Qualifying", r.Qualifying],
    ["Race", { date: r.date, time: r.time }],
  ];
  return slots
    .flatMap(([name, slot], i) => (slot ? [jolpicaSession(r, name, slot, i + 1)] : []))
    .sort((a, b) => a.date_start.localeCompare(b.date_start));
}

function getJolpicaSeason(year: number): Promise<JolpicaRace[]> {
  return memoized(
    `jolpica-season:${year}`,
    async () => (await jolpica<JolpicaRacesResponse>(`${year}/races/?limit=40`, 21600))?.MRData.RaceTable.Races ?? [],
    (races) => races.length > 0,
  );
}

/** The Jolpica round of a race weekend, matched on the race's date. */
async function jolpicaRace(race: OpenF1Session): Promise<JolpicaRace | undefined> {
  const races = await getJolpicaSeason(race.year);
  if (race.meeting_key < 0) return races.find((r) => Number(r.round) === -race.meeting_key);
  const t = Date.parse(race.date_start);
  return races.find((r) => Math.abs(Date.parse(`${r.date}T12:00:00Z`) - t) < 3 * 86_400_000);
}

/** "1:31.234" or "+5.123" → seconds. */
function seconds(text: string | undefined): number | null {
  if (!text) return null;
  const m = /^\+?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(text.trim());
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
}

/** A Jolpica race or sprint classification, as OpenF1 rows. */
function jolpicaRaceRows(rows: JolpicaClassified[]): OpenF1Result[] {
  return rows.map((r) => {
    const status = r.status ?? "";
    const lapped = /^\+\d+ Laps?$/.test(status) || status === "Lapped";
    const finished = status === "Finished" || lapped;
    const pos = Number(r.position);
    return {
      driver_number: Number(r.number),
      position: Number.isFinite(pos) ? pos : null,
      number_of_laps: Number(r.laps ?? 0),
      points: Number(r.points ?? 0),
      duration: pos === 1 && r.Time?.millis ? Number(r.Time.millis) / 1000 : null,
      gap_to_leader: pos === 1 ? 0 : r.Time ? seconds(r.Time.time) : lapped ? status.toUpperCase() : null,
      dnf: !finished && !/Did not start|Disqualified/i.test(status),
      dns: /Did not start/i.test(status),
      dsq: /Disqualified/i.test(status),
    };
  });
}

async function jolpicaClassification(race: OpenF1Session, kind: "results" | "sprint" | "qualifying"): Promise<JolpicaClassified[]> {
  const r = await jolpicaRace(race);
  if (!r) return [];
  const data = await jolpica<JolpicaRacesResponse>(`${r.season}/${r.round}/${kind}/?limit=40`, 600);
  const got = data?.MRData.RaceTable.Races[0];
  return (kind === "results" ? got?.Results : kind === "sprint" ? got?.SprintResults : got?.QualifyingResults) ?? [];
}

// Grand Prix names are built from the session's `location` (the host city /
// circuit locality), never the country. Every name the sidebar prints — the
// Starting Grid title, the calendar rows and the last-race label — comes
// through here, so this is the single place that decides it.
//
// Location is the right key for three reasons: it is what the paddock calls
// the round ("Monza", "Spa-Francorchamps", "Yas Marina"), it disambiguates
// the multiple rounds a country hosts (Miami Gardens / Austin / Las Vegas
// were all "United States Grand Prix"; Barcelona and Madrid were both
// "Spain"), and it sidesteps bad upstream country data — OpenF1 currently
// files the Kuala Lumpur round under country_name "Bahrain", which printed
// two identical "Bahrain Grand Prix" rows in the calendar.
//
// No country flag or code is attached to the name anywhere in the sidebar —
// the location alone identifies the round.
function grandPrixName(session: OpenF1Session): string {
  const locality =
    session.location?.trim() ||
    session.circuit_short_name?.trim() ||
    session.country_name?.trim() ||
    "";
  return locality ? `${locality} Grand Prix` : "Grand Prix";
}

function raceFromSession(session: OpenF1Session, round: number, circuitImageUrl?: string): F1Race {
  return {
    round,
    name: grandPrixName(session),
    country: session.country_name,
    circuit: session.circuit_short_name,
    date: session.date_start,
    circuitImageUrl,
  };
}

function driverLabel(driver: OpenF1Driver | undefined, number: number): string {
  return number === 22
    ? "Y. Tsunoda"
    : driver
      ? `${driver.first_name[0]}. ${driver.last_name}`
      : `Car ${number}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  const readableSeconds = remaining.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return hours > 0
    ? `${hours}h ${minutes}m ${readableSeconds}s`
    : minutes > 0
      ? `${minutes}m ${readableSeconds}s`
      : `${readableSeconds}s`;
}

// --- shared, memoized upstream reads ----------------------------------------

// Race sessions for the current season — the shared root every part derives
// from (schedule, standings, session details and the roster all need it).
function getSeasonSessions(): Promise<OpenF1Session[] | null> {
  const year = new Date().getUTCFullYear();
  return memoized(
    `sessions:${year}`,
    async () => {
      const races = await kept(
        `season:${year}`,
        async () =>
          (await openF1<OpenF1Session[]>(`sessions?year=${year}&session_name=Race`, 21600))
            ?.filter((session) => !session.session_name.includes("Sprint"))
            .sort((a, b) => a.date_start.localeCompare(b.date_start)) ?? null,
        (list) => list.length > 0,
        60,
      );
      if (races) return races;
      const fallback = (await getJolpicaSeason(year)).map((r) => jolpicaSession(r, "Race", { date: r.date, time: r.time }, 7));
      return fallback.length > 0 ? fallback : null;
    },
    (list) => list !== null,
  );
}

// Driver details come from static season data (lib/config/f1-drivers.ts).
// Number → name/acronym/team is fixed for a season, so the old per-session
// `drivers?session_key=…` calls (several per render, same 22 rows every
// time) are gone. A transient upstream blip can no longer degrade the
// tables into "Car 63" placeholders, because there is nothing to fetch.
//
// The live endpoint is still used as a fallback when the running season no
// longer matches the static file's season, so a stale file degrades to the
// previous behaviour instead of printing wrong names.
function staticDriverMap(): Map<number, OpenF1Driver> {
  const map = new Map<number, OpenF1Driver>();
  for (const d of F1_DRIVERS) {
    map.set(d.driverNumber, {
      driver_number: d.driverNumber,
      full_name: `${d.firstName} ${d.lastName}`,
      first_name: d.firstName,
      last_name: d.lastName,
      name_acronym: d.nameAcronym,
      team_name: d.teamName,
    });
  }
  return map;
}

function getLiveSessionDrivers(sessionKey: number): Promise<Map<number, OpenF1Driver>> {
  return memoized(
    `drivers:${sessionKey}`,
    async () => {
      const drivers = await openF1<OpenF1Driver[]>(`drivers?session_key=${sessionKey}`, 21600);
      return new Map((drivers ?? []).map((driver) => [driver.driver_number, driver]));
    },
    (map) => map.size > 0,
  );
}

/**
 * Driver details for labelling every table. Static for the current season
 * (zero network); falls back to the live roster for other seasons, and tops
 * the static map up with any live-only entry when a fallback key is given
 * (covers a mid-season seat swap without costing a call in the normal case).
 */
async function getDriverDetails(fallbackSessionKey?: number): Promise<Map<number, OpenF1Driver>> {
  const seasonMatches = new Date().getUTCFullYear() === F1_DRIVER_SEASON;
  if (seasonMatches) return staticDriverMap();
  if (fallbackSessionKey === undefined || fallbackSessionKey < 0) return staticDriverMap();
  const live = await getLiveSessionDrivers(fallbackSessionKey);
  return live.size > 0 ? live : staticDriverMap();
}

// The track map: the site's own copy when it has one (lib/config/f1-circuits.ts),
// so it costs no OpenF1 call and survives a lockout. Otherwise the meetings
// endpoint's circuit_image (sessions alone do not include it), kept by race
// weekend so a weekend read from Jolpica still gets the map OpenF1 gave.
function getMeetingImage(race: OpenF1Session): Promise<string | undefined> {
  return memoized(`meeting:${raceDay(race)}`, async () => {
    const circuit = (await jolpicaRace(race).catch(() => undefined))?.Circuit.circuitId;
    if (circuit && LOCAL_CIRCUITS.has(circuit)) return `/f1/circuits/${circuit}.png`;
    const image = await kept(
      `image:${raceDay(race)}`,
      async () => (race.meeting_key > 0 ? ((await openF1<OpenF1Meeting[]>(`meetings?meeting_key=${race.meeting_key}`, 21600))?.[0]?.circuit_image ?? null) : null),
      (url) => url.length > 0,
      120,
    );
    return image ?? undefined;
  });
}

/** Every session of one race weekend, raw, in running order: OpenF1, what
 *  was kept of it, or Jolpica's timetable. */
function getMeetingRaw(race: OpenF1Session): Promise<OpenF1Session[]> {
  return memoized(
    `meeting-sessions:${raceDay(race)}`,
    async () => {
      const sessions = await kept(
        `weekend:${raceDay(race)}`,
        async () => (race.meeting_key > 0 ? await openF1<OpenF1Session[]>(`sessions?meeting_key=${race.meeting_key}`, 21600) : null),
        (list) => list.length > 0,
      );
      if (sessions) return [...sessions].sort((a, b) => a.date_start.localeCompare(b.date_start));
      const r = await jolpicaRace(race);
      return r ? jolpicaWeekend(r) : [];
    },
    (list) => list.length > 0,
  );
}

/** Every session of one race weekend, in running order. */
async function getMeetingSessions(race: OpenF1Session): Promise<F1Session[]> {
  return (await getMeetingRaw(race)).map((s) => ({ name: s.session_name, start: s.date_start, end: s.date_end }));
}

// Time-sensitive derivation from the (cached) season sessions — computed on
// every call, never memoized, so countdowns and "next race" stay correct.
function analyzeSeason(sorted: OpenF1Session[]) {
  const now = Date.now();
  const nextIndex = sorted.findIndex(
    (session) => new Date(session.date_start).getTime() > now,
  );
  const start = nextIndex >= 0 ? nextIndex : sorted.length;
  const nextSession = sorted[Math.min(start, sorted.length - 1)];
  const lastSession = [...sorted]
    .reverse()
    .find((session) => new Date(session.date_start).getTime() <= now);
  const latestSession = sorted[sorted.length - 1];
  const upcoming = sorted
    .slice(start, start + 5)
    .map((session, index) => raceFromSession(session, start + index + 1));
  const nextRound = nextIndex >= 0 ? nextIndex + 1 : sorted.length;
  return { nextSession, lastSession, latestSession, upcoming, nextRound };
}

// The race whose result is shown as "last race": the most recent Race
// session that ended at least SETTLE_MS ago, so provisional classifications
// have settled. Taken from the season's Race sessions — the old
// `session_key=latest` pointed at whatever ran last, which on a race
// weekend's Friday printed practice times as the "last race".
function resultSession(sorted: OpenF1Session[]): OpenF1Session | undefined {
  const cutoff = Date.now() - SETTLE_MS;
  return [...sorted].reverse().find((s) => new Date(s.date_end).getTime() <= cutoff);
}

function getSessionResult(race: OpenF1Session): Promise<OpenF1Result[]> {
  return memoized(
    `result:${raceDay(race)}`,
    async () =>
      (await kept(
        `result:${raceDay(race)}`,
        async () => (race.session_key > 0 ? await openF1<OpenF1Result[]>(`session_result?session_key=${race.session_key}`, 3600) : null),
        (rows) => rows.length > 0,
        60,
      )) ?? jolpicaRaceRows(await jolpicaClassification(race, "results")),
    (rows) => rows.length > 0,
  );
}

function labelRaceResults(
  session: OpenF1Session,
  results: OpenF1Result[],
  drivers: Map<number, OpenF1Driver>,
): F1LastRace {
  return {
    name: `${raceFromSession(session, 0).name} — ${session.session_name}`,
    circuit: session.circuit_short_name,
    date: session.date_start,
    results: [...results]
      .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
      .map((result) => ({
        position: result.position,
        driver: driverLabel(drivers.get(result.driver_number), result.driver_number),
        code: drivers.get(result.driver_number)?.name_acronym ?? "",
        team: drivers.get(result.driver_number)?.team_name ?? "",
        time: result.dsq ? "DSQ" : result.dns ? "DNS" : result.dnf ? "DNF" : result.position === 1 && result.duration ? formatDuration(result.duration) : result.gap_to_leader == null ? "—" : typeof result.gap_to_leader === "number" ? `+${result.gap_to_leader.toFixed(3)}s` : result.gap_to_leader,
        points: result.points,
      })),
  };
}

// A finished practice, sprint or qualifying session's classification, kept
// briefly (10 min) since timing can be amended just after the flag. What
// OpenF1 last said is kept for weeks: it locks every endpoint while a later
// session is live, and the weekend list and practice table must not empty
// out for the length of qualifying. Failing both, Jolpica has qualifying and
// the sprint (practice times are OpenF1's alone).
function getWeekendResult(s: OpenF1Session, race: OpenF1Session): Promise<OpenF1WeekendResult[]> {
  const id = `${raceDay(race)}:${s.session_name}`;
  return memoized(
    `wk-result:${id}`,
    async () => {
      const rows = await kept(
        `wk:${id}`,
        async () => (s.session_key > 0 ? await openF1<OpenF1WeekendResult[]>(`session_result?session_key=${s.session_key}`, 600) : null),
        (list) => list.length > 0,
      );
      if (rows) return rows;
      // Kept before the store was keyed by weekend (until mid-Oct 2026).
      const legacy = s.session_key > 0 ? await getStore().get<OpenF1WeekendResult[]>(`f1:wk-result:v1:${s.session_key}`).catch(() => null) : null;
      if (legacy?.length) return legacy;
      if (s.session_name === "Sprint") return jolpicaRaceRows(await jolpicaClassification(race, "sprint"));
      if (s.session_name !== "Qualifying") return [];
      return (await jolpicaClassification(race, "qualifying")).map((q) => ({
        driver_number: Number(q.number),
        position: Number(q.position) || null,
        duration: [seconds(q.Q1), seconds(q.Q2), seconds(q.Q3)],
        gap_to_leader: null,
        dnf: false,
        dns: false,
        dsq: false,
      }));
    },
    (rows) => rows.length > 0,
  );
}

function lapTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : `${s}s`;
}

// A session's best lap: practice gives one number, qualifying one per part
// (Q1, Q2, Q3), of which the last one set counts.
function bestLap(d: OpenF1WeekendResult["duration"]): number | null {
  if (Array.isArray(d)) return [...d].reverse().find((x): x is number => typeof x === "number") ?? null;
  return typeof d === "number" ? d : null;
}

function weekendRows(rows: OpenF1WeekendResult[], drivers: Map<number, OpenF1Driver>, race: boolean): F1GridResult[] {
  return [...rows]
    .filter((r) => r.position != null)
    .sort((a, b) => a.position! - b.position!)
    .map((r) => {
      const lap = bestLap(r.duration);
      const gap = Array.isArray(r.gap_to_leader) ? [...r.gap_to_leader].reverse().find((x) => x != null) : r.gap_to_leader;
      const time =
        r.dsq ? "DSQ" : r.dns ? "DNS" : r.dnf ? "DNF"
        : r.position === 1
          ? lap != null ? (race ? formatDuration(lap) : lapTime(lap)) : "—"
          : typeof gap === "number" ? `+${gap.toFixed(3)}${race ? "s" : ""}` : typeof gap === "string" ? gap : lap != null ? lapTime(lap) : "—";
      return {
        position: r.position!,
        driver: driverLabel(drivers.get(r.driver_number), r.driver_number),
        code: drivers.get(r.driver_number)?.name_acronym ?? "",
        team: drivers.get(r.driver_number)?.team_name ?? "",
        time,
      };
    });
}

// Only asked once qualifying has finished, and only a real grid is kept: just
// after the flag OpenF1 can still answer nothing (it locks every endpoint
// while a session is live, and an overrunning qualifying stays "live"), so an
// empty answer is asked again on the next read rather than kept.
function getStartingGrid(quali: OpenF1Session, race: OpenF1Session) {
  return memoized(
    `grid:${raceDay(race)}`,
    async () =>
      (await kept(
        `grid:${raceDay(race)}`,
        async () =>
          quali.session_key > 0
            ? await openF1<{ driver_number: number; position: number; lap_duration: number | null }[]>(`starting_grid?session_key=${quali.session_key}`, 120)
            : null,
        (rows) => rows.length > 0,
      )) ?? [],
    (rows) => rows.length > 0,
  );
}

async function fetchStartingGrid(quali: OpenF1Session, race: OpenF1Session, drivers: Map<number, OpenF1Driver>): Promise<F1GridResult[]> {
  const grid = await getStartingGrid(quali, race);
  return [...grid].sort((a, b) => a.position - b.position).map((row) => ({
    position: row.position,
    driver: driverLabel(drivers.get(row.driver_number), row.driver_number),
    code: drivers.get(row.driver_number)?.name_acronym ?? "",
    team: drivers.get(row.driver_number)?.team_name ?? "",
    time: row.lap_duration ? lapTime(row.lap_duration) : "—",
  }));
}

// --- staged fetchers, in sidebar fill order ---------------------------------
//
// Every part is independently fetchable, independently cacheable and
// independently retryable. Ordering lives on the client (F1Sidebar), which
// walks them in the order the reader sees the sidebar fill in.

/** 1. Next race + circuit map. Fastest piece: one memoized season read plus
 *     a non-fatal meeting lookup for the track image. */
export async function getF1Map(): Promise<F1MapData | null> {
  const sessions = await getSeasonSessions();
  if (!sessions?.length) return null;
  const { nextSession, nextRound } = analyzeSeason(sessions);
  const [circuitImageUrl, weekend] = await Promise.all([
    getMeetingImage(nextSession).catch(() => undefined),
    getMeetingSessions(nextSession).catch(() => []),
  ]);
  return { nextRace: { ...raceFromSession(nextSession, nextRound, circuitImageUrl), sessions: weekend } };
}

/** 2. Driver details — served from static season data, so this resolves
 *     without touching the network at all. */
export async function getF1Drivers(): Promise<F1DriversData> {
  const details = await getDriverDetails();
  return {
    drivers: [...details.values()].map((d) => ({
      id: d.name_acronym.toLowerCase(),
      name: `${d.first_name} ${d.last_name}`,
      code: d.name_acronym,
      team: d.team_name,
    })),
  };
}

/** 3. Upcoming race calendar (shares the memoized season read with the map). */
export async function getF1Calendar(): Promise<F1CalendarData | null> {
  const sessions = await getSeasonSessions();
  if (!sessions?.length) return null;
  return { upcoming: analyzeSeason(sessions).upcoming };
}

/** 4. Constructors' championship — one Jolpica call (points and wins). */
export async function getF1Constructors(): Promise<F1ConstructorsData | null> {
  const year = new Date().getUTCFullYear();
  const data = await jolpica<JolpicaStandingsResponse>(`${year}/constructorstandings/`);
  const rows = data?.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? [];
  if (rows.length === 0) return null;
  return {
    constructorStandings: rows.map((row) => ({
      position: Number(row.position),
      team: teamFromJolpica(row.Constructor.name),
      points: Number(row.points),
      wins: Number(row.wins) || 0,
    })),
  };
}

/** 5. Drivers' championship — one Jolpica call (points and wins). Names and
 *     teams come from the static roster when the driver is on it, so they
 *     match every other table in the sidebar. */
export async function getF1DriverStandings(): Promise<F1DriverStandingsData | null> {
  const year = new Date().getUTCFullYear();
  const [data, drivers] = await Promise.all([
    jolpica<JolpicaStandingsResponse>(`${year}/driverstandings/`),
    getDriverDetails(),
  ]);
  const rows = data?.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? [];
  if (rows.length === 0) return null;
  const byCode = new Map([...drivers.values()].map((d) => [d.name_acronym, d]));
  return {
    standings: rows.map((row) => {
      const code = row.Driver.code ?? row.Driver.familyName.slice(0, 3).toUpperCase();
      const known = byCode.get(code);
      return {
        position: Number(row.position),
        driverId: code.toLowerCase(),
        name: known
          ? driverLabel(known, known.driver_number)
          : `${row.Driver.givenName[0]}. ${row.Driver.familyName}`,
        code,
        team: known?.team_name ?? teamFromJolpica(row.Constructors.at(-1)?.name ?? ""),
        points: Number(row.points),
        wins: Number(row.wins) || 0,
      };
    }),
  };
}

/** 6. The weekend's timing — the slow tail. Which table the reader gets
 *     follows the weekend: the latest practice (or sprint) session from FP1
 *     until qualifying, the starting grid from qualifying until the race is
 *     settled, then the race result. Off weekends show the last result. */
export async function getF1Results(): Promise<F1ResultsData | null> {
  const sessions = await getSeasonSessions();
  if (!sessions?.length) return null;
  const { lastSession } = analyzeSeason(sessions);
  const now = Date.now();
  const race = resultSession(sessions);
  // This weekend: the first race not yet settled (running or to come).
  const weekendRace = sessions.find((s) => Date.parse(s.date_end) + SETTLE_MS > now);
  const [results, drivers, weekend] = await Promise.all([
    race ? getSessionResult(race) : Promise.resolve([] as OpenF1Result[]),
    getDriverDetails(lastSession?.session_key),
    weekendRace ? getMeetingRaw(weekendRace).catch(() => [] as OpenF1Session[]) : Promise.resolve([] as OpenF1Session[]),
  ]);
  const lastRace = race && results.length > 0 ? labelRaceResults(race, results, drivers) : null;
  const weekendName = weekendRace ? grandPrixName(weekendRace) : null;

  // Sessions of this weekend that have finished (the race itself excluded:
  // its result arrives as lastRace once settled).
  const finished = weekend.filter((s) => s.session_name !== "Race" && Date.parse(s.date_end) + SESSION_SETTLE_MS <= now);
  const quali = finished.find((s) => s.session_name === "Qualifying");

  // The quickest in each finished session, for the weekend list.
  const tops: Record<string, F1SessionTop> = {};
  const byName = new Map<string, F1GridResult[]>();
  await Promise.all(
    finished.map(async (s) => {
      const rows = weekendRows(await getWeekendResult(s, weekendRace!).catch(() => []), drivers, s.session_name === "Sprint");
      byName.set(s.session_name, rows);
      if (rows[0]) tops[s.session_name] = { code: rows[0].code, driver: rows[0].driver, team: rows[0].team, time: rows[0].time };
    }),
  );

  let qualifyingGrid: F1GridResult[] = [];
  if (quali) {
    qualifyingGrid = await fetchStartingGrid(quali, weekendRace!, drivers);
    // The official grid can lag the session (and differs only by penalties):
    // until it lands, the qualifying order stands in.
    if (qualifyingGrid.length === 0) qualifyingGrid = byName.get("Qualifying") ?? [];
  }
  // Qualifying is over by the clock but nothing about it has been released
  // (an overrun, or the feed still locked): the weekend stays on the grid
  // step, with the latest practice standing in until the grid arrives.
  const gridPending = Boolean(quali) && qualifyingGrid.length === 0;
  const latest =
    !quali || gridPending
      ? [...finished].reverse().find((s) => s.session_name !== "Qualifying" && (byName.get(s.session_name)?.length ?? 0) > 0)
      : undefined;
  const session: F1SessionResult | null =
    latest && weekendName ? { name: latest.session_name, race: weekendName, end: latest.date_end, rows: byName.get(latest.session_name)! } : null;

  const liveResults =
    paidLiveProvider && lastSession
      ? await paidLiveProvider.getLiveResults(lastSession.session_key)
      : [];
  return {
    lastRace,
    qualifyingGrid,
    liveResults,
    currentRace: null,
    racePhase:
      liveResults.length > 0 ? "race" : qualifyingGrid.length > 0 || gridPending ? "qualifying" : session ? "practice" : "last-race",
    session,
    weekendName,
    gridSetAt: quali?.date_end ?? null,
    tops,
    gridPending,
  };
}

/** SSR convenience: map + calendar together (what app/page.tsx prints). */
export async function getF1Schedule(): Promise<F1ScheduleData | null> {
  const sessions = await getSeasonSessions();
  if (!sessions?.length) return null;
  const { nextSession, nextRound, upcoming } = analyzeSeason(sessions);
  const [circuitImageUrl, weekend] = await Promise.all([
    getMeetingImage(nextSession).catch(() => undefined),
    getMeetingSessions(nextSession).catch(() => []),
  ]);
  return {
    nextRace: { ...raceFromSession(nextSession, nextRound, circuitImageUrl), sessions: weekend },
    upcoming,
  };
}

/** Driver roster for the settings / onboarding chips. Static data — this used
 *  to cost two OpenF1 calls on every layout and settings render. */
export async function getF1Roster(): Promise<F1RosterEntry[]> {
  return (await getF1Drivers()).drivers;
}
