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
import { getWikipediaThumbnail } from "./wikipedia";

const FLAGS: Record<string, string> = {
  Australia: "🇦🇺",
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

async function fetchConstructorStandings(): Promise<F1ConstructorStanding[]> {
  try {
    const res = await fetch(
      "https://api.jolpi.ca/ergast/f1/current/constructorstandings.json?limit=20",
      { next: { revalidate: 21600 } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const list = json.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings;
    if (!Array.isArray(list)) return [];
    return list.map(
      (c: { position: string; points: string; wins: string; Constructor: { name: string } }) => ({
        position: Number(c.position),
        team: c.Constructor.name,
        points: Number(c.points),
        wins: Number(c.wins),
      }),
    );
  } catch {
    return [];
  }
}

interface JolpicaRace {
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit: {
    circuitName: string;
    url?: string;
    Location: { country: string };
  };
}

interface JolpicaStanding {
  position: string;
  points: string;
  wins: string;
  Driver: { driverId: string; code: string; givenName: string; familyName: string };
  Constructors: { name: string }[];
}

async function fetchStandingsList(): Promise<JolpicaStanding[] | null> {
  const res = await fetch(
    "https://api.jolpi.ca/ergast/f1/current/driverStandings.json?limit=30",
    { next: { revalidate: 21600 } },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const list = json.MRData.StandingsTable.StandingsLists[0];
  return list ? list.DriverStandings : null;
}

function toStanding(d: JolpicaStanding): F1Standing {
  return {
    position: Number(d.position),
    driverId: d.Driver.driverId,
    name: `${d.Driver.givenName[0]}. ${d.Driver.familyName}`,
    code: d.Driver.code,
    team: d.Constructors[0]?.name ?? "",
    points: Number(d.points),
    wins: Number(d.wins),
  };
}

async function fetchLastRace(): Promise<F1LastRace | null> {
  try {
    const res = await fetch(
      "https://api.jolpi.ca/ergast/f1/current/last/results.json?limit=30",
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const race = json.MRData?.RaceTable?.Races?.[0];
    if (!race) return null;

    const results: F1LastResult[] = (race.Results ?? []).map(
      (r: {
        position: string;
        Driver: { givenName: string; familyName: string; code: string };
        Constructor: { name: string };
        Time?: { time: string };
        FastestLap?: unknown;
        points: string;
        status: string;
      }) => ({
        position: Number(r.position),
        driver: `${r.Driver.givenName[0]}. ${r.Driver.familyName}`,
        code: r.Driver.code,
        team: r.Constructor.name,
        time: r.Time?.time ?? r.status ?? "—",
        points: Number(r.points),
      }),
    );

    return {
      name: race.raceName,
      flag: flagFor(race.Circuit?.Location?.country ?? ""),
      circuit: race.Circuit?.circuitName ?? "",
      date: race.date,
      results,
    };
  } catch {
    return null;
  }
}

async function fetchQualifyingGrid(round: number): Promise<F1GridResult[]> {
  try {
    const res = await fetch(
      `https://api.jolpi.ca/ergast/f1/current/${round}/qualifying.json?limit=30`,
      { next: { revalidate: 900 } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const results = json.MRData?.RaceTable?.Races?.[0]?.QualifyingResults;
    if (!Array.isArray(results)) return [];
    return results.map((r: {
      position: string;
      Driver: { givenName: string; familyName: string; code: string };
      Constructor: { name: string };
      Q1?: string;
      Q2?: string;
      Q3?: string;
    }) => ({
      position: Number(r.position),
      driver: `${r.Driver.givenName[0]}. ${r.Driver.familyName}`,
      code: r.Driver.code,
      team: r.Constructor?.name ?? "",
      time: r.Q3 ?? r.Q2 ?? r.Q1 ?? "—",
    }));
  } catch {
    return [];
  }
}

async function fetchLiveResults(round: number): Promise<F1LiveResult[]> {
  try {
    const res = await fetch(
      `https://api.jolpi.ca/ergast/f1/current/${round}/results.json?limit=30`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const results = json.MRData?.RaceTable?.Races?.[0]?.Results;
    if (!Array.isArray(results)) return [];
    return results.map((r: {
      position: string;
      Driver: { givenName: string; familyName: string; code: string };
      Constructor: { name: string };
      status?: string;
      Time?: { time?: string; millis?: string };
      FastestLap?: { AverageSpeed?: { speed?: string } };
    }) => ({
      position: Number(r.position),
      driver: `${r.Driver.givenName[0]}. ${r.Driver.familyName}`,
      code: r.Driver.code,
      team: r.Constructor?.name ?? "",
      interval: r.Time?.time ?? "—",
      status: r.status ?? "",
    }));
  } catch {
    return [];
  }
}

async function fetchOpenF1LiveResults(): Promise<F1LiveResult[]> {
  try {
    const year = new Date().getUTCFullYear();
    const sessionsRes = await fetch(
      `https://api.openf1.org/v1/sessions?year=${year}&session_name=Race`,
      { cache: "no-store" },
    );
    if (!sessionsRes.ok) return [];
    const sessions = await sessionsRes.json() as {
      session_key: number;
      date_start: string;
      date_end: string;
    }[];
    const now = Date.now();
    const session = sessions
      .filter((item) => {
        const start = new Date(item.date_start).getTime();
        const end = new Date(item.date_end).getTime();
        return start <= now && now <= end;
      })
      .at(-1);
    if (!session) return [];

    const [positionsRes, driversRes] = await Promise.all([
      fetch(`https://api.openf1.org/v1/position?session_key=${session.session_key}`, {
        cache: "no-store",
      }),
      fetch(`https://api.openf1.org/v1/drivers?session_key=${session.session_key}`, {
        cache: "no-store",
      }),
    ]);
    if (!positionsRes.ok || !driversRes.ok) return [];
    const positions = await positionsRes.json() as {
      driver_number: number;
      position: number;
      date: string;
    }[];
    const drivers = await driversRes.json() as {
      driver_number: number;
      full_name: string;
      name_acronym: string;
      team_name: string;
    }[];
    const latestByDriver = new Map<number, (typeof positions)[number]>();
    for (const position of positions) {
      const previous = latestByDriver.get(position.driver_number);
      if (!previous || position.date > previous.date) {
        latestByDriver.set(position.driver_number, position);
      }
    }
    const driverByNumber = new Map(drivers.map((driver) => [driver.driver_number, driver]));
    return [...latestByDriver.values()]
      .sort((a, b) => a.position - b.position)
      .map((position) => {
        const driver = driverByNumber.get(position.driver_number);
        return {
          position: position.position,
          driver: driver?.full_name ?? `Car ${position.driver_number}`,
          code: driver?.name_acronym ?? "",
          team: driver?.team_name ?? "",
          interval: "Live",
          status: "Running",
        };
      });
  } catch {
    return [];
  }
}

async function fetchPolePosition(
  round: number,
): Promise<F1Race["polePosition"] | undefined> {
  try {
    const res = await fetch(
      `https://api.jolpi.ca/ergast/f1/current/${round}/qualifying.json`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return undefined;
    const json = await res.json();
    const results =
      json.MRData?.RaceTable?.Races?.[0]?.QualifyingResults;
    if (!results || results.length === 0) return undefined;
    const pole = results[0];
    return {
      driver: `${pole.Driver.givenName[0]}. ${pole.Driver.familyName}`,
      team: pole.Constructor?.name ?? "",
      time: pole.Q3 ?? pole.Q2 ?? pole.Q1 ?? "—",
    };
  } catch {
    return undefined;
  }
}

export async function getLiveF1(): Promise<LiveF1Data | null> {
  try {
    const [scheduleRes, standingsList, constructorStandings] = await Promise.all([
      fetch("https://api.jolpi.ca/ergast/f1/current.json", {
        next: { revalidate: 21600 },
      }),
      fetchStandingsList(),
      fetchConstructorStandings(),
    ]);
    if (!scheduleRes.ok) return null;

    const scheduleJson = await scheduleRes.json();
    const races: JolpicaRace[] = scheduleJson.MRData.RaceTable.Races;
    const now = Date.now();

    const circuitUrlById = new Map(races.map((r) => [r.round, r.Circuit.url]));

    const mapped: F1Race[] = races.map((r) => ({
      round: Number(r.round),
      name: r.raceName,
      country: r.Circuit.Location.country,
      flag: flagFor(r.Circuit.Location.country),
      circuit: r.Circuit.circuitName,
      date: r.time ? `${r.date}T${r.time}` : r.date,
    }));

    const future = mapped.filter((r) => new Date(r.date).getTime() >= now);
    const nextRace = future[0] ?? mapped[mapped.length - 1];
    if (!nextRace) return null;
    const upcoming = future.length > 0 ? future.slice(0, 5) : mapped.slice(-5);

    const latestStarted = [...mapped]
      .reverse()
      .find((r) => new Date(r.date).getTime() <= now);
    const latestStartedAt = latestStarted ? new Date(latestStarted.date).getTime() : 0;
    const raceInProgress = Boolean(latestStarted && now - latestStartedAt <= 6 * 60 * 60 * 1000);
    const displayedRace = raceInProgress && latestStarted ? latestStarted : nextRace;

    // Fetch track image, pole position, and last race result in parallel.
    const displayedRaceCircuitUrl = circuitUrlById.get(String(displayedRace.round));
    const [circuitImageUrl, polePosition, lastRace, qualifyingGrid, openF1LiveResults] = await Promise.all([
      displayedRaceCircuitUrl
        ? getWikipediaThumbnail(displayedRaceCircuitUrl)
        : Promise.resolve(undefined),
      fetchPolePosition(displayedRace.round),
      fetchLastRace(),
      fetchQualifyingGrid(displayedRace.round),
      raceInProgress ? fetchOpenF1LiveResults() : Promise.resolve([] as F1LiveResult[]),
    ]);
    const liveResults = openF1LiveResults.length > 0
      ? openF1LiveResults
      : raceInProgress && latestStarted
        ? await fetchLiveResults(latestStarted.round)
        : [];
    if (circuitImageUrl) displayedRace.circuitImageUrl = circuitImageUrl;
    if (polePosition) displayedRace.polePosition = polePosition;
    const racePhase = raceInProgress
      ? "race"
      : qualifyingGrid.length > 0
        ? "qualifying"
        : "last-race";

    const standings: F1Standing[] = standingsList
      ? standingsList.map(toStanding)
      : [];

    return {
      nextRace: displayedRace,
      upcoming,
      standings,
      constructorStandings,
      lastRace,
      qualifyingGrid,
      liveResults,
      currentRace: raceInProgress ? latestStarted ?? null : null,
      racePhase,
    };
  } catch {
    return null;
  }
}

// Lightweight roster (all drivers, regardless of points scored) for the
// personalization picker — reuses the same cached standings request.
export async function getF1Roster(): Promise<F1RosterEntry[]> {
  try {
    const standingsList = await fetchStandingsList();
    if (!standingsList) return [];
    return standingsList.map((d) => ({
      id: d.Driver.driverId,
      name: `${d.Driver.givenName} ${d.Driver.familyName}`,
      code: d.Driver.code,
      team: d.Constructors[0]?.name ?? "",
    }));
  } catch {
    return [];
  }
}
