import { F1_DRIVERS, F1_DRIVER_SEASON } from "@/lib/config/f1-drivers";
import type {
  F1Race,
  F1Standing,
  F1RosterEntry,
  F1LastRace,
  F1ConstructorStanding,
  F1GridResult,
  F1LiveResult,
} from "@/lib/types";
export interface LiveF1Data {
  nextRace: F1Race;
  upcoming: F1Race[];
  standings: F1Standing[];
  constructorStandings: F1ConstructorStanding[];
  lastRace: F1LastRace | null;
  qualifyingGrid: F1GridResult[];
  liveResults: F1LiveResult[];
  currentRace: F1Race | null;
  racePhase: "last-race" | "qualifying" | "race";
}

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
const ERGAST_API = "https://api.jolpi.ca/ergast/f1";
const RESULT_DELAY_MS = 90 * 60 * 1000;

// Maps Ergast constructor names (lowercased) to OpenF1 team_name (lowercased).
// Confirmed against live data from both APIs — extend if new mismatches show up.
const TEAM_NAME_ALIASES: Record<string, string> = {
  "red bull": "red bull racing",
  "rb f1 team": "racing bulls",
  "alpine f1 team": "alpine",
  "cadillac f1 team": "cadillac",
};

function normalizeTeam(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_NAME_ALIASES[lower] ?? lower;
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

interface OpenF1ChampionshipDriver {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  position_start: number;
  position_current: number;
  points_start: number;
  points_current: number;
}

interface OpenF1ChampionshipTeam {
  meeting_key: number;
  session_key: number;
  team_name: string;
  position_start: number;
  position_current: number;
  points_start: number;
  points_current: number;
}

interface ErgastDriverStanding {
  wins: string;
  Driver: { code: string };
  Constructors: { name: string }[];
}

interface ErgastStandingsResponse {
  MRData: {
    StandingsTable: {
      StandingsLists: {
        DriverStandings: ErgastDriverStanding[];
      }[];
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
    const response = await fetch(`${OPENF1_API}/${path}`, { next: { revalidate } });
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

// Raw rows of the latest session — no driver details attached yet. Split
// from the labelling step so the network fetch can start before the season
// sessions (needed for the fallback roster) have resolved.
interface LatestResultRows {
  session: OpenF1Session;
  results: OpenF1Result[];
}

async function fetchLatestResultRows(): Promise<LatestResultRows | null> {
  // These two used to be sequential; both accept session_key=latest so they
  // resolve independently and run in parallel. Only the driver lookup below
  // needs the concrete session key from the first response.
  const [latestSessions, results] = await Promise.all([
    openF1<OpenF1Session[]>(`sessions?session_key=latest`, 900),
    openF1<OpenF1Result[]>(`session_result?session_key=latest`, 900),
  ]);
  const latestSession = latestSessions?.[0];
  if (!latestSession || !results?.length) return null;

  if (Date.now() < new Date(latestSession.date_start).getTime() + RESULT_DELAY_MS) return null;

  return { session: latestSession, results };
}

async function labelLatestSessionResults(
  rows: LatestResultRows,
  fallbackSessionKey?: number,
): Promise<F1LastRace> {
  const { session: latestSession, results } = rows;
  const drivers = await getDriverDetails(fallbackSessionKey);

  return {
    name: `${raceFromSession(latestSession, 0).name} — ${latestSession.session_name}`,
    circuit: latestSession.circuit_short_name,
    date: latestSession.date_start,
    results: results
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

async function fetchStartingGrid(sessionKey: number, drivers: Map<number, OpenF1Driver>): Promise<F1GridResult[]> {
  const grid = await openF1<{ driver_number: number; position: number; lap_duration: number | null }[]>(`starting_grid?session_key=${sessionKey}`, 900);
  return (grid ?? []).sort((a, b) => a.position - b.position).map((row) => ({
    position: row.position,
    driver: driverLabel(drivers.get(row.driver_number), row.driver_number),
    code: drivers.get(row.driver_number)?.name_acronym ?? "",
    team: drivers.get(row.driver_number)?.team_name ?? "",
    time: row.lap_duration ? `${row.lap_duration.toFixed(3)}s` : "—",
  }));
}

// Wins pulled from Ergast/Jolpica in a single request — no per-race loop
// needed, unlike OpenF1 which requires one session_result call per completed
// race to compute wins.
async function fetchWins(year: number): Promise<{ drivers: Map<string, number>; teams: Map<string, number> }> {
  const driverWins = new Map<string, number>();
  const teamWins = new Map<string, number>();
  try {
    const response = await fetch(`${ERGAST_API}/${year}/driverstandings/`, { next: { revalidate: 900 } });
    if (!response.ok) {
      console.error(`ergast wins failed: ${response.status} ${response.statusText}`);
      return { drivers: driverWins, teams: teamWins };
    }
    const data = await response.json() as ErgastStandingsResponse;
    const standings = data.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? [];
    for (const entry of standings) {
      const wins = Number(entry.wins) || 0;
      if (wins === 0) continue;
      driverWins.set(entry.Driver.code, wins);
      const team = entry.Constructors.at(-1)?.name;
      if (team) {
        const key = normalizeTeam(team);
        teamWins.set(key, (teamWins.get(key) ?? 0) + wins);
      }
    }
  } catch (err) {
    console.error(`ergast wins error`, err);
  }
  return { drivers: driverWins, teams: teamWins };
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
  const circuitImageUrl = await getMeetingImage(nextSession.meeting_key);
  return { nextRace: raceFromSession(nextSession, nextRound, circuitImageUrl) };
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

/** 4. Constructors' championship. Its own upstream call, so a failure here
 *     can never blank the drivers' table (and vice versa). */
export async function getF1Constructors(): Promise<F1ConstructorsData | null> {
  const [teamRows, wins] = await Promise.all([
    openF1<OpenF1ChampionshipTeam[]>(`championship_teams?session_key=latest`, 900),
    fetchWins(new Date().getUTCFullYear()),
  ]);
  if (!teamRows?.length) return null;
  return {
    constructorStandings: [...teamRows]
      .sort((a, b) => a.position_current - b.position_current)
      .map((row) => ({
        position: row.position_current,
        team: row.team_name,
        points: row.points_current,
        wins: wins.teams.get(normalizeTeam(row.team_name)) ?? 0,
      })),
  };
}

/** 5. Drivers' championship. */
export async function getF1DriverStandings(): Promise<F1DriverStandingsData | null> {
  const [driverRows, wins, drivers] = await Promise.all([
    openF1<OpenF1ChampionshipDriver[]>(`championship_drivers?session_key=latest`, 900),
    fetchWins(new Date().getUTCFullYear()),
    getDriverDetails(),
  ]);
  if (!driverRows?.length) return null;
  return {
    standings: [...driverRows]
      .sort((a, b) => a.position_current - b.position_current)
      .map((row) => {
        const code = drivers.get(row.driver_number)?.name_acronym ?? "";
        return {
          position: row.position_current,
          driverId: code.toLowerCase() || String(row.driver_number),
          name: driverLabel(drivers.get(row.driver_number), row.driver_number),
          code: row.driver_number === 22 ? "TSU" : code,
          team:
            row.driver_number === 22
              ? "Racing Bulls"
              : (drivers.get(row.driver_number)?.team_name ?? ""),
          points: row.points_current,
          wins: wins.drivers.get(code) ?? 0,
        };
      }),
  };
}

/** 6. Latest race result + the next race's starting grid — the slow tail. */
export async function getF1Results(): Promise<F1ResultsData | null> {
  const [rows, sessions] = await Promise.all([
    fetchLatestResultRows(),
    getSeasonSessions(),
  ]);
  if (!sessions?.length) return null;
  const { nextSession, lastSession } = analyzeSeason(sessions);
  const [lastRace, drivers] = await Promise.all([
    rows ? labelLatestSessionResults(rows, lastSession?.session_key) : Promise.resolve(null),
    getDriverDetails(lastSession?.session_key),
  ]);
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
  const circuitImageUrl = await getMeetingImage(nextSession.meeting_key);
  return { nextRace: raceFromSession(nextSession, nextRound, circuitImageUrl), upcoming };
}

/** Full sidebar payload composed from the parts running in parallel. Kept for
 *  callers that want everything at once; the sidebar consumes the parts
 *  individually so each block renders (and retries) independently. */
export async function getLiveF1(): Promise<LiveF1Data | null> {
  const [schedule, constructors, standings, results] = await Promise.all([
    getF1Schedule(),
    getF1Constructors(),
    getF1DriverStandings(),
    getF1Results(),
  ]);
  if (!schedule) return null;
  return {
    nextRace: schedule.nextRace,
    upcoming: schedule.upcoming,
    standings: standings?.standings ?? [],
    constructorStandings: constructors?.constructorStandings ?? [],
    lastRace: results?.lastRace ?? null,
    qualifyingGrid: results?.qualifyingGrid ?? [],
    liveResults: results?.liveResults ?? [],
    currentRace: results?.currentRace ?? null,
    racePhase: results?.racePhase ?? "last-race",
  };
}

/** Driver roster for the settings / onboarding chips. Static data — this used
 *  to cost two OpenF1 calls on every layout and settings render. */
export async function getF1Roster(): Promise<F1RosterEntry[]> {
  return (await getF1Drivers()).drivers;
}
