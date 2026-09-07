import type {
  F1Race,
  F1Standing,
  F1RosterEntry,
  F1LastRace,
  F1LastResult,
  F1ConstructorStanding,
  F1GridResult,
  F1LiveResult,
} from "@/lib/types";
const FLAGS: Record<string, string> = {
  Australia: "🇦🇺",
  "United States": "🇺🇸",
  Italy: "🇮🇹",
  Azerbaijan: "🇦🇿",
  Singapore: "🇸🇬",
  USA: "🇺🇸",
  Mexico: "🇲🇽",
  Netherlands: "🇳🇱",
  UK: "🇬🇧",
  "United Kingdom": "🇬🇧",
  Monaco: "🇲🇨",
  Spain: "🇪🇸",
  Hungary: "🇭🇺",
  Belgium: "🇧🇪",
  Japan: "🇯🇵",
  Qatar: "🇶🇦",
  UAE: "🇦🇪",
  "United Arab Emirates": "🇦🇪",
  "Saudi Arabia": "🇸🇦",
  China: "🇨🇳",
  Bahrain: "🇧🇭",
  Canada: "🇨🇦",
  Austria: "🇦🇹",
  Brazil: "🇧🇷",
  Germany: "🇩🇪",
  Portugal: "🇵🇹",
  France: "🇫🇷",
  Malaysia: "🇲🇾",
  India: "🇮🇳",
  "South Korea": "🇰🇷",
  Russia: "🇷🇺",
  Turkey: "🇹🇷",
  Sweden: "🇸🇪",
  "South Africa": "🇿🇦",
};

function flagFor(country: string): string {
  return FLAGS[country] ?? "🏁";
}

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

async function openF1<T>(path: string, revalidate = 3600): Promise<T | null> {
  try {
    const response = await fetch(`${OPENF1_API}/${path}`, { next: { revalidate } });
    if (!response.ok) {
      console.error(`openF1 failed: ${path} -> ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.json() as T;
  } catch (err) {
    console.error(`openF1 error: ${path}`, err);
    return null;
  }
}

function raceFromSession(session: OpenF1Session, round: number, circuitImageUrl?: string): F1Race {
  return {
    round,
    name: session.country_name === "United States" ? "United States Grand Prix" : `${session.country_name} Grand Prix`,
    country: session.country_name,
    flag: flagFor(session.country_name),
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

async function getDrivers(sessionKey: number): Promise<Map<number, OpenF1Driver>> {
  const drivers = await openF1<OpenF1Driver[]>(`drivers?session_key=${sessionKey}`, 21600);
  return new Map((drivers ?? []).map((driver) => [driver.driver_number, driver]));
}

async function fetchLatestSessionResults(): Promise<F1LastRace | null> {
  // Sequential by design: identify the latest session first, then fetch its
  // result, then the driver details needed to label the rows.
  const latestSessions = await openF1<OpenF1Session[]>(`sessions?session_key=latest`, 900);
  const latestSession = latestSessions?.[0];
  if (!latestSession) return null;

  const results = await openF1<OpenF1Result[]>(`session_result?session_key=latest`, 900);
  if (!results?.length) return null;

  if (Date.now() < new Date(latestSession.date_start).getTime() + RESULT_DELAY_MS) return null;

  const drivers = await getDrivers(latestSession.session_key);

  return {
    name: `${raceFromSession(latestSession, 0).name} — ${latestSession.session_name}`,
    flag: flagFor(latestSession.country_name),
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

async function fetchChampionship(): Promise<{
  driverRows: OpenF1ChampionshipDriver[];
  teamRows: OpenF1ChampionshipTeam[];
}> {
  const driverStandings = await openF1<OpenF1ChampionshipDriver[]>(`championship_drivers?session_key=latest`, 900);
  const teamStandings = await openF1<OpenF1ChampionshipTeam[]>(`championship_teams?session_key=latest`, 900);
  return {
    driverRows: (driverStandings ?? []).sort((a, b) => a.position_current - b.position_current),
    teamRows: (teamStandings ?? []).sort((a, b) => a.position_current - b.position_current),
  };
}

// Merges the raw championship tables with driver details and the win counts
// (fetched separately from Ergast) into the final sidebar standings.
function toStandings(
  championship: { driverRows: OpenF1ChampionshipDriver[]; teamRows: OpenF1ChampionshipTeam[] },
  drivers: Map<number, OpenF1Driver>,
  wins: { drivers: Map<string, number>; teams: Map<string, number> },
): { drivers: F1Standing[]; teams: F1ConstructorStanding[] } {
  return {
    drivers: championship.driverRows.map((row) => {
      const code = drivers.get(row.driver_number)?.name_acronym ?? "";
      return {
        position: row.position_current,
        driverId: code.toLowerCase() || String(row.driver_number),
        name: driverLabel(drivers.get(row.driver_number), row.driver_number),
        code: row.driver_number === 22 ? "TSU" : code,
        team: row.driver_number === 22 ? "Racing Bulls" : (drivers.get(row.driver_number)?.team_name ?? ""),
        points: row.points_current,
        wins: wins.drivers.get(code) ?? 0,
      };
    }),
    teams: championship.teamRows.map((row) => ({
      position: row.position_current,
      team: row.team_name,
      points: row.points_current,
      wins: wins.teams.get(normalizeTeam(row.team_name)) ?? 0,
    })),
  };
}

export async function getLiveF1(): Promise<LiveF1Data | null> {
  const year = new Date().getUTCFullYear();
  const sessions = await openF1<OpenF1Session[]>(`sessions?year=${year}&session_name=Race`, 21600);
  if (!sessions?.length) return null;
  const sorted = sessions.filter((session) => !session.session_name.includes("Sprint")).sort((a, b) => a.date_start.localeCompare(b.date_start));
  const now = Date.now();
  const nextIndex = sorted.findIndex((session) => new Date(session.date_start).getTime() > now);
  const nextSession = sorted[nextIndex >= 0 ? nextIndex : sorted.length - 1];
  const lastSession = [...sorted].reverse().find((session) => new Date(session.date_start).getTime() <= now);
  const upcoming = sorted.slice(nextIndex >= 0 ? nextIndex : sorted.length, (nextIndex >= 0 ? nextIndex : sorted.length) + 5).map((session, index) => raceFromSession(session, (nextIndex >= 0 ? nextIndex : sorted.length) + index + 1));
  const nextRound = nextIndex >= 0 ? nextIndex + 1 : sorted.length;

  // Latest session in the whole season (used for standings so we get current team/driver lineup)
  const latestSession = sorted[sorted.length - 1];

  // Everything below runs strictly one call at a time, in this order:
  // 1) driver details → 2) meetings (track image) → 3) championship standings
  // (drivers + teams, no wins yet) → 4) latest session result → 5) starting
  // grid → 6) wins from Ergast/Jolpica (single call, merged into standings).

  // 1) Driver details.
  const nextRaceDrivers = await getDrivers(nextSession.session_key);
  const latestDrivers = latestSession.session_key === nextSession.session_key
    ? nextRaceDrivers
    : await getDrivers(latestSession.session_key);

  // Some drivers in the championship standings (e.g. after a mid-season seat
  // swap) may be missing from the latest session's roster but still appear
  // in the next race's roster, or vice versa. Merge both so name/team/code
  // resolve either way — no extra API calls, both maps are already fetched.
  // latestDrivers is spread second so its data wins when a driver appears in both.
  const mergedDrivers = new Map([...nextRaceDrivers, ...latestDrivers]);

  // 2) Track image — the meetings endpoint carries the official F1 track-map
  // image (circuit_image); sessions alone do not include it.
  const nextMeeting = await openF1<OpenF1Meeting[]>(`meetings?meeting_key=${nextSession.meeting_key}`, 21600);
  const circuitImageUrl = nextMeeting?.[0]?.circuit_image ?? undefined;
  const nextRace = raceFromSession(nextSession, nextRound, circuitImageUrl);

  // 3) Driver + team championship standings (wins merged in step 6).
  const championship = await fetchChampionship();

  // 4) Last session result.
  const lastRace = await fetchLatestSessionResults();

  // 5) Next race's starting grid.
  const qualifyingGrid = await fetchStartingGrid(nextSession.session_key, nextRaceDrivers);

  // 6) Wins — single Ergast/Jolpica call, merged into the standings from step 3.
  const wins = await fetchWins(year);
  const standings = toStandings(championship, mergedDrivers, wins);

  const resultReady = Boolean(lastSession && lastRace);
  const liveResults = paidLiveProvider && lastSession ? await paidLiveProvider.getLiveResults(lastSession.session_key) : [];
  return {
    nextRace: resultReady && lastSession ? raceFromSession(nextSession, nextRound, circuitImageUrl) : nextRace,
    upcoming,
    standings: standings.drivers,
    constructorStandings: standings.teams,
    lastRace,
    qualifyingGrid,
    liveResults,
    currentRace: null,
    racePhase: liveResults.length > 0 ? "race" : qualifyingGrid.length > 0 ? "qualifying" : "last-race",
  };
}

export async function getF1Roster(): Promise<F1RosterEntry[]> {
  const year = new Date().getUTCFullYear();
  const sessions = await openF1<OpenF1Session[]>(`sessions?year=${year}&session_name=Race`, 21600);
  const session = sessions?.at(-1);
  if (!session) return [];
  const drivers = await getDrivers(session.session_key);
  return [...drivers.values()].map((driver) => ({
    id: driver.name_acronym.toLowerCase(),
    name: `${driver.first_name} ${driver.last_name}`,
    code: driver.name_acronym,
    team: driver.team_name,
  }));
}