import type { F1Race, F1Standing, F1RosterEntry, F1LastRace, F1LastResult, F1ConstructorStanding } from "@/lib/types";
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
      "https://api.jolpi.ca/ergast/f1/current/last/results.json?limit=5",
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const race = json.MRData?.RaceTable?.Races?.[0];
    if (!race) return null;

    const results: F1LastResult[] = (race.Results ?? []).slice(0, 5).map(
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

    // Fetch track image, pole position, and last race result in parallel.
    const nextRaceCircuitUrl = circuitUrlById.get(String(nextRace.round));
    const [circuitImageUrl, polePosition, lastRace] = await Promise.all([
      nextRaceCircuitUrl
        ? getWikipediaThumbnail(nextRaceCircuitUrl)
        : Promise.resolve(undefined),
      fetchPolePosition(nextRace.round),
      fetchLastRace(),
    ]);
    if (circuitImageUrl) nextRace.circuitImageUrl = circuitImageUrl;
    if (polePosition) nextRace.polePosition = polePosition;

    const standings: F1Standing[] = standingsList
      ? standingsList.map(toStanding)
      : [];

    return { nextRace, upcoming, standings, constructorStandings, lastRace };
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
