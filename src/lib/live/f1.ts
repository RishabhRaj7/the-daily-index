import { F1_DRIVERS, F1_DRIVER_SEASON } from "@/lib/config/f1-drivers";
import type {
  F1Race,
  F1Session,
  F1Standing,
  F1RosterEntry,
  F1LastRace,
  F1ConstructorStanding,
  F1GridResult,
  F1LiveResult,
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
  racePhase: "last-race" | "qualifying" | "race";
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
const RESULT_DELAY_MS = 90 * 60 * 1000;

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

function memoized<T>(
  key: string,
  fn: () => Promise<T>,
  shouldCache: (value: T) => boolean = () => true,
): Promise<T> {
  const hit = memoStore.get(key);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) {
    return Promise.resolve(hit.value as T);
  }
  const pending = memoInflight.get(key);
  if (pending) return pending as Promise<T>;
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
    await waitForOpenF1Slot();
    let response = await fetch(`${OPENF1_API}/${path}`, { next: { revalidate } });
    if (response.status === 429) {
      // Another instance used the budget; one paced retry, then give up.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await waitForOpenF1Slot();
      response = await fetch(`${OPENF1_API}/${path}`, { next: { revalidate } });
    }
    if (!response.ok) {
      // OpenF1 answers 404 when a query has no rows yet — e.g. the next
      // race's starting_grid before qualifying. That is "no data", not a
      // failure, so it stays out of the error log.
      if (response.status !== 404) {
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
    const response = await fetch(`${JOLPICA_API}/${path}`, { next: { revalidate } });
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
  return memoized(`sessions:${year}`, async () => {
    const sessions = await openF1<OpenF1Session[]>(
      `sessions?year=${year}&session_name=Race`,
      21600,
    );
    if (!sessions?.length) return null;
    return sessions
      .filter((session) => !session.session_name.includes("Sprint"))
      .sort((a, b) => a.date_start.localeCompare(b.date_start));
  });
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
  if (fallbackSessionKey === undefined) return staticDriverMap();
  const live = await getLiveSessionDrivers(fallbackSessionKey);
  return live.size > 0 ? live : staticDriverMap();
}

// The meetings endpoint carries the official F1 track-map image
// (circuit_image); sessions alone do not include it.
function getMeetingImage(meetingKey: number): Promise<string | undefined> {
  return memoized(`meeting:${meetingKey}`, async () => {
    const meeting = await openF1<OpenF1Meeting[]>(`meetings?meeting_key=${meetingKey}`, 21600);
    return meeting?.[0]?.circuit_image ?? undefined;
  });
}

/** Every session of one race weekend, in running order. */
function getMeetingSessions(meetingKey: number): Promise<F1Session[]> {
  return memoized(
    `meeting-sessions:${meetingKey}`,
    async () => {
      const sessions = await openF1<OpenF1Session[]>(`sessions?meeting_key=${meetingKey}`, 21600);
      return (sessions ?? [])
        .sort((a, b) => a.date_start.localeCompare(b.date_start))
        .map((s) => ({ name: s.session_name, start: s.date_start, end: s.date_end }));
    },
    (list) => list.length > 0,
  );
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
// session that started at least RESULT_DELAY_MS ago, so provisional
// classifications have settled. Taken from the season's Race sessions — the
// old `session_key=latest` pointed at whatever ran last, which on a race
// weekend's Friday printed practice times as the "last race".
function resultSession(sorted: OpenF1Session[]): OpenF1Session | undefined {
  const cutoff = Date.now() - RESULT_DELAY_MS;
  return [...sorted].reverse().find((s) => new Date(s.date_start).getTime() <= cutoff);
}

function getSessionResult(sessionKey: number): Promise<OpenF1Result[]> {
  return memoized(
    `result:${sessionKey}`,
    async () => (await openF1<OpenF1Result[]>(`session_result?session_key=${sessionKey}`, 3600)) ?? [],
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

// Memoized, empty answers included: before qualifying OpenF1 has no grid
// (it answers 404), and asking again on every render would spend the
// request budget on a guaranteed miss.
function getStartingGrid(sessionKey: number) {
  return memoized(`grid:${sessionKey}`, async () =>
    (await openF1<{ driver_number: number; position: number; lap_duration: number | null }[]>(
      `starting_grid?session_key=${sessionKey}`,
      900,
    )) ?? [],
  );
}

async function fetchStartingGrid(sessionKey: number, drivers: Map<number, OpenF1Driver>): Promise<F1GridResult[]> {
  const grid = await getStartingGrid(sessionKey);
  return [...grid].sort((a, b) => a.position - b.position).map((row) => ({
    position: row.position,
    driver: driverLabel(drivers.get(row.driver_number), row.driver_number),
    code: drivers.get(row.driver_number)?.name_acronym ?? "",
    team: drivers.get(row.driver_number)?.team_name ?? "",
    time: row.lap_duration ? `${row.lap_duration.toFixed(3)}s` : "—",
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
    getMeetingImage(nextSession.meeting_key),
    getMeetingSessions(nextSession.meeting_key).catch(() => []),
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

/** 6. Latest race result + the next race's starting grid — the slow tail. */
export async function getF1Results(): Promise<F1ResultsData | null> {
  const sessions = await getSeasonSessions();
  if (!sessions?.length) return null;
  const { nextSession, lastSession } = analyzeSeason(sessions);
  const race = resultSession(sessions);
  const [results, drivers] = await Promise.all([
    race ? getSessionResult(race.session_key) : Promise.resolve([] as OpenF1Result[]),
    getDriverDetails(lastSession?.session_key),
  ]);
  const lastRace = race && results.length > 0 ? labelRaceResults(race, results, drivers) : null;
  const qualifyingGrid = await fetchStartingGrid(nextSession.session_key, drivers);
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
      liveResults.length > 0 ? "race" : qualifyingGrid.length > 0 ? "qualifying" : "last-race",
  };
}

/** SSR convenience: map + calendar together (what app/page.tsx prints). */
export async function getF1Schedule(): Promise<F1ScheduleData | null> {
  const sessions = await getSeasonSessions();
  if (!sessions?.length) return null;
  const { nextSession, nextRound, upcoming } = analyzeSeason(sessions);
  const [circuitImageUrl, weekend] = await Promise.all([
    getMeetingImage(nextSession.meeting_key),
    getMeetingSessions(nextSession.meeting_key).catch(() => []),
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
