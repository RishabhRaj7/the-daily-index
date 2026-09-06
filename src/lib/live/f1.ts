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
const RESULT_DELAY_MS = 90 * 60 * 1000;

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

interface F1DataProvider {
  getLiveResults(sessionKey: number): Promise<F1LiveResult[]>;
}

// Live timing is deliberately isolated. The free OpenF1 API does not expose it.
const paidLiveProvider: F1DataProvider | null = null;

async function openF1<T>(path: string, revalidate = 3600): Promise<T | null> {
  try {
    const response = await fetch(`${OPENF1_API}/${path}`, { next: { revalidate } });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

function raceFromSession(session: OpenF1Session, round: number): F1Race {
  return {
    round,
    name: session.country_name === "United States" ? "United States Grand Prix" : `${session.country_name} Grand Prix`,
    country: session.country_name,
    flag: flagFor(session.country_name),
    circuit: session.circuit_short_name,
    date: session.date_start,
  };
}

function driverLabel(driver: OpenF1Driver | undefined, number: number): string {
  return driver ? `${driver.first_name[0]}. ${driver.last_name}` : `Car ${number}`;
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

async function fetchSessionResults(
  session: OpenF1Session,
  drivers: Map<number, OpenF1Driver>,
): Promise<F1LastRace | null> {
  if (Date.now() < new Date(session.date_start).getTime() + RESULT_DELAY_MS) return null;
  const results = await openF1<OpenF1Result[]>(`session_result?session_key=${session.session_key}`, 900);
  if (!results?.length) return null;
  return {
    name: raceFromSession(session, 0).name,
    flag: flagFor(session.country_name),
    circuit: session.circuit_short_name,
    date: session.date_start,
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

async function fetchWins(sessions: OpenF1Session[]): Promise<{ drivers: Map<number, number>; teams: Map<string, number> }> {
  const resultSets = await Promise.all(sessions.map((session) =>
    openF1<OpenF1Result[]>(`session_result?session_key=${session.session_key}`, 900),
  ));
  const driverWins = new Map<number, number>();
  const teamWins = new Map<string, number>();
  for (const results of resultSets) {
    for (const result of results ?? []) {
      if (result.position !== 1) continue;
      driverWins.set(result.driver_number, (driverWins.get(result.driver_number) ?? 0) + 1);
    }
  }
  return { drivers: driverWins, teams: teamWins };
}

async function fetchStandings(
  sessions: OpenF1Session[],
  drivers: Map<number, OpenF1Driver>,
): Promise<{ drivers: F1Standing[]; teams: F1ConstructorStanding[] }> {
  const [driverStandings, teamStandings, wins] = await Promise.all([
    openF1<OpenF1ChampionshipDriver[]>(`championship_drivers?session_key=latest`, 900),
    openF1<OpenF1ChampionshipTeam[]>(`championship_teams?session_key=latest`, 900),
    fetchWins(sessions),
  ]);

  // team wins = sum of each team's drivers' wins
  for (const [driverNumber, count] of wins.drivers) {
    const team = drivers.get(driverNumber)?.team_name;
    if (team) wins.teams.set(team, (wins.teams.get(team) ?? 0) + count);
  }

  const driverRows = (driverStandings ?? []).sort((a, b) => a.position_current - b.position_current);
  const teamRows = (teamStandings ?? []).sort((a, b) => a.position_current - b.position_current);

  return {
    drivers: driverRows.map((row) => ({
      position: row.position_current,
      driverId: drivers.get(row.driver_number)?.name_acronym.toLowerCase() ?? String(row.driver_number),
      name: driverLabel(drivers.get(row.driver_number), row.driver_number),
      code: drivers.get(row.driver_number)?.name_acronym ?? "",
      team: drivers.get(row.driver_number)?.team_name ?? "",
      points: row.points_current,
      wins: wins.drivers.get(row.driver_number) ?? 0,
    })),
    teams: teamRows.map((row) => ({
      position: row.position_current,
      team: row.team_name,
      points: row.points_current,
      wins: wins.teams.get(row.team_name) ?? 0,
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
  const nextRace = raceFromSession(nextSession, nextIndex >= 0 ? nextIndex + 1 : sorted.length);
  const upcoming = sorted.slice(nextIndex >= 0 ? nextIndex : sorted.length, (nextIndex >= 0 ? nextIndex : sorted.length) + 5).map((session, index) => raceFromSession(session, (nextIndex >= 0 ? nextIndex : sorted.length) + index + 1));
  const resultSession = lastSession ?? nextSession;
  const nextRound = nextIndex >= 0 ? nextIndex + 1 : sorted.length;

  // Latest session in the whole season (used for standings so we get current team/driver lineup)
  const latestSession = sorted[sorted.length - 1];

  const [resultDrivers, nextRaceDrivers, latestDrivers] = await Promise.all([
    getDrivers(resultSession.session_key),
    getDrivers(nextSession.session_key),
    getDrivers(latestSession.session_key),
  ]);
  const [lastRace, qualifyingGrid, standings] = await Promise.all([
    lastSession ? fetchSessionResults(lastSession, resultDrivers) : Promise.resolve(null),
    fetchStartingGrid(nextSession.session_key, nextRaceDrivers),
    fetchStandings(sorted.filter((session) => new Date(session.date_start).getTime() <= now - RESULT_DELAY_MS), latestDrivers),
  ]);
  const resultReady = Boolean(lastSession && lastRace);
  const liveResults = paidLiveProvider && lastSession ? await paidLiveProvider.getLiveResults(lastSession.session_key) : [];
  return {
    nextRace: resultReady && lastSession ? raceFromSession(nextSession, nextRound) : nextRace,
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
