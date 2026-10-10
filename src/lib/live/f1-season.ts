import { getStore } from "@/lib/server/store";
import { teamColor } from "@/lib/personalization";

// The season so far, from Jolpica (the Ergast successor: free, no key):
//   - every driver's points and finishing place, round by round, Grand Prix
//     and sprint (the grid on /f1/live, with the rounds still to come shown
//     empty);
//   - the season's records — most wins, podiums and poles (driver and
//     constructor), best average finish, most places gained, the largest and
//     closest winning margins, the biggest climb — for races, sprints or both;
//   - lap benchmarks for a meeting: last year's pole or fastest race lap, and
//     the fastest race lap there since the current cars came in (2022).
// Built once and kept for three hours (benchmarks a week), so the page costs
// Jolpica a handful of calls a day.

const API = "https://api.jolpi.ca/ergast/f1";
const KEEP_SECONDS = 3 * 3600;

interface JDriver {
  code?: string;
  givenName: string;
  familyName: string;
}
interface JResult {
  laps?: string;
  position: string;
  positionText: string;
  points: string;
  grid: string;
  status: string;
  Driver: JDriver;
  Constructor: { name: string };
  Time?: { millis?: string; time?: string };
  FastestLap?: { rank?: string; Time?: { time?: string } };
  Q1?: string;
  Q2?: string;
  Q3?: string;
}
interface JRace {
  season: string;
  round: string;
  raceName: string;
  date: string;
  Circuit: { circuitId: string; Location: { country: string; locality: string } };
  Results?: JResult[];
  SprintResults?: JResult[];
  QualifyingResults?: JResult[];
  Sprint?: unknown;
}

export interface SeasonCell {
  /** Finishing place (classified or not), null without one. */
  pos: number | null;
  /** "3", or DNF / DNS / DSQ / NC. */
  text: string;
  points: number;
  grid: number | null;
  /** How the race ended for them: "Finished", "+1 Lap", "Collision", "Engine"… */
  status: string;
  /** Laps completed. */
  laps: number | null;
  /** Their fastest lap, and whether it was the race's quickest. */
  fastestLap: string | null;
  fastestOfAll: boolean;
}

export interface SeasonDriver {
  code: string;
  name: string;
  team: string;
  colour: string;
  points: number;
  /** One per round of the calendar; null where the driver had no result. */
  gp: (SeasonCell | null)[];
  sprint: (SeasonCell | null)[];
  /** Qualifying place each round (null where they didn't qualify). */
  quali: (number | null)[];
  /** Their best qualifying lap each round (the deepest part they reached). */
  qualiTime: (string | null)[];
}

export interface SeasonRound {
  round: number;
  name: string;
  country: string;
  date: string;
  sprint: boolean;
  done: boolean;
}

export interface Leader {
  value: number;
  who: string;
  /** The driver's timing code (driver records). */
  code?: string;
  team: string;
  /** For records tied to one race: where. */
  detail?: string;
}

export interface SeasonStats {
  wins: { driver: Leader | null; team: Leader | null };
  podiums: { driver: Leader | null; team: Leader | null };
  poles: { driver: Leader | null; team: Leader | null };
  bestAverage: Leader | null;
  placesGained: Leader | null;
  largestMargin: Leader | null;
  closestMargin: Leader | null;
  biggestClimb: Leader | null;
}

export interface Season {
  year: number;
  rounds: SeasonRound[];
  drivers: SeasonDriver[];
  stats: { race: SeasonStats; sprint: SeasonStats; combined: SeasonStats };
  updated: string;
}

async function pages(path: string, total = 6): Promise<JRace[]> {
  const got = await Promise.all(
    Array.from({ length: total }, (_, i) => i * 100).map(async (offset) => {
      try {
        const res = await fetch(`${API}/${path}?limit=100&offset=${offset}`, { next: { revalidate: 3 * 3600 } });
        if (!res.ok) return [] as JRace[];
        return ((await res.json()) as { MRData: { RaceTable: { Races: JRace[] } } }).MRData.RaceTable.Races;
      } catch {
        return [] as JRace[];
      }
    }),
  );
  // A round can straddle two pages; join its rows back up (by season and
  // round: a circuit's history spans many seasons).
  const byRound = new Map<string, JRace>();
  for (const r of got.flat()) {
    const id = `${r.season}-${r.round}`;
    const had = byRound.get(id);
    byRound.set(
      id,
      had
        ? {
            ...had,
            Results: [...(had.Results ?? []), ...(r.Results ?? [])],
            SprintResults: [...(had.SprintResults ?? []), ...(r.SprintResults ?? [])],
            QualifyingResults: [...(had.QualifyingResults ?? []), ...(r.QualifyingResults ?? [])],
          }
        : r,
    );
  }
  return [...byRound.values()].sort((a, b) => Number(a.season) - Number(b.season) || Number(a.round) - Number(b.round));
}

const code = (d: JDriver) => d.code ?? d.familyName.slice(0, 3).toUpperCase();
const STATUS: Record<string, string> = { R: "DNF", D: "DSQ", E: "DSQ", N: "NC", W: "DNS", F: "DNQ" };

function cell(r: JResult): SeasonCell {
  const classified = /^\d+$/.test(r.positionText);
  return {
    pos: Number(r.position) || null,
    text: classified ? r.positionText : (STATUS[r.positionText] ?? r.positionText),
    points: Number(r.points) || 0,
    grid: Number(r.grid) || null,
    status: r.status,
    laps: r.laps ? Number(r.laps) : null,
    fastestLap: r.FastestLap?.Time?.time ?? null,
    fastestOfAll: r.FastestLap?.rank === "1",
  };
}

const secs = (t?: string) => {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec((t ?? "").replace(/^\+/, ""));
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

function top(counts: Map<string, number>, teams: Map<string, string>): Leader | null {
  let best: Leader | null = null;
  for (const [who, value] of counts) if (!best || value > best.value) best = { value, who, team: teams.get(who) ?? who };
  return best && best.value > 0 ? best : null;
}

function statsFor(sets: { race: JRace; results: JResult[]; grid1?: JResult | null }[], names: Map<string, string>, roundsRun: number): SeasonStats {
  const teamOf = new Map<string, string>();
  const wins = new Map<string, number>();
  const winsT = new Map<string, number>();
  const pods = new Map<string, number>();
  const podsT = new Map<string, number>();
  const poles = new Map<string, number>();
  const polesT = new Map<string, number>();
  const finishes = new Map<string, number[]>();
  const gained = new Map<string, number>();
  let largest: Leader | null = null;
  let closest: Leader | null = null;
  let climb: Leader | null = null;
  const add = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
  const field = (results: JResult[]) => results.length || 20;

  for (const { race, results, grid1 } of sets) {
    const where = `R${race.round} · ${race.Circuit.Location.country === "USA" || race.Circuit.Location.country === "Spain" ? race.Circuit.Location.locality : race.Circuit.Location.country}`;
    for (const r of results) {
      const c = code(r.Driver);
      teamOf.set(c, r.Constructor.name);
      teamOf.set(r.Constructor.name, r.Constructor.name);
      const pos = Number(r.position);
      const classified = /^\d+$/.test(r.positionText);
      if (classified && pos === 1) {
        add(wins, c);
        add(winsT, r.Constructor.name);
      }
      if (classified && pos <= 3) {
        add(pods, c);
        add(podsT, r.Constructor.name);
      }
      if (pos) finishes.set(c, [...(finishes.get(c) ?? []), pos]);
      const grid = Number(r.grid) || field(results);
      if (classified) {
        add(gained, c, grid - pos);
        if (!climb || grid - pos > climb.value) climb = { value: grid - pos, who: c, team: r.Constructor.name, detail: `P${grid} → P${pos} · ${where}` };
      }
    }
    const pole = grid1 ?? results.find((r) => r.grid === "1");
    if (pole) {
      add(poles, code(pole.Driver));
      add(polesT, pole.Constructor.name);
    }
    const winner = results.find((r) => r.position === "1");
    const second = results.find((r) => r.position === "2");
    const margin = secs(second?.Time?.time);
    if (winner && margin !== null) {
      const l: Leader = { value: margin, who: code(winner.Driver), team: winner.Constructor.name, detail: where };
      if (!largest || margin > largest.value) largest = l;
      if (!closest || margin < closest.value) closest = l;
    }
  }

  let bestAverage: Leader | null = null;
  for (const [c, list] of finishes) {
    if (list.length < Math.max(1, Math.ceil(roundsRun * 0.6))) continue;
    const avg = Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
    if (!bestAverage || avg < bestAverage.value) bestAverage = { value: avg, who: c, team: teamOf.get(c) ?? "" };
  }
  const named = (l: Leader | null) => (l ? { ...l, code: l.who, who: names.get(l.who) ?? l.who } : null);
  return {
    wins: { driver: named(top(wins, teamOf)), team: top(winsT, teamOf) },
    podiums: { driver: named(top(pods, teamOf)), team: top(podsT, teamOf) },
    poles: { driver: named(top(poles, teamOf)), team: top(polesT, teamOf) },
    bestAverage: named(bestAverage),
    placesGained: named(top(gained, teamOf)),
    largestMargin: named(largest),
    closestMargin: named(closest),
    biggestClimb: named(climb),
  };
}

async function build(year: number): Promise<Season | null> {
  const [schedule, results, sprints, quali] = await Promise.all([pages(`${year}/races/`, 1), pages(`${year}/results/`), pages(`${year}/sprint/`, 2), pages(`${year}/qualifying/`)]);
  if (schedule.length === 0) return null;
  const byRound = (list: JRace[]) => new Map(list.map((r) => [Number(r.round), r]));
  const res = byRound(results);
  const spr = byRound(sprints);
  const qua = byRound(quali);
  // Rounds by country; where a country has two or more, by city.
  const seen = new Map<string, number>();
  for (const r of schedule) seen.set(r.Circuit.Location.country, (seen.get(r.Circuit.Location.country) ?? 0) + 1);
  const place = (r: JRace) => ((seen.get(r.Circuit.Location.country) ?? 0) > 1 ? r.Circuit.Location.locality : r.Circuit.Location.country);
  const rounds: SeasonRound[] = schedule.map((r) => ({
    round: Number(r.round),
    name: place(r),
    country: r.Circuit.Location.country,
    date: r.date,
    sprint: Boolean(r.Sprint) || spr.has(Number(r.round)),
    done: res.has(Number(r.round)),
  }));

  const drivers = new Map<string, SeasonDriver>();
  const names = new Map<string, string>();
  const n = rounds.length;
  const touch = (r: JResult) => {
    const c = code(r.Driver);
    names.set(c, r.Driver.familyName);
    let d = drivers.get(c);
    if (!d) {
      d = { code: c, name: r.Driver.familyName, team: r.Constructor.name, colour: "#888888", points: 0, gp: new Array(n).fill(null), sprint: new Array(n).fill(null), quali: new Array(n).fill(null), qualiTime: new Array(n).fill(null) };
      drivers.set(c, d);
    }
    d.team = r.Constructor.name; // the latest team (results come in round order)
    d.colour = teamColor(r.Constructor.name) ?? "#888888";
    return d;
  };
  rounds.forEach((round, i) => {
    for (const r of res.get(round.round)?.Results ?? []) {
      const d = touch(r);
      d.gp[i] = cell(r);
      d.points += Number(r.points) || 0;
    }
    for (const q of qua.get(round.round)?.QualifyingResults ?? []) {
      const d = drivers.get(code(q.Driver));
      if (!d) continue;
      d.quali[i] = Number(q.position) || null;
      d.qualiTime[i] = q.Q3 || q.Q2 || q.Q1 || null;
    }
    for (const r of spr.get(round.round)?.SprintResults ?? []) {
      const d = touch(r);
      d.sprint[i] = cell(r);
      d.points += Number(r.points) || 0;
    }
  });

  const raceSets = [...res.values()].map((race) => ({ race, results: race.Results ?? [], grid1: qua.get(Number(race.round))?.QualifyingResults?.find((q) => q.position === "1") ?? null }));
  const sprintSets = [...spr.values()].map((race) => ({ race, results: race.SprintResults ?? [] }));
  const run = rounds.filter((r) => r.done).length;
  return {
    year,
    rounds,
    drivers: [...drivers.values()].sort((a, b) => b.points - a.points),
    stats: {
      race: statsFor(raceSets, names, run),
      sprint: statsFor(sprintSets, names, sprintSets.length),
      combined: statsFor([...raceSets, ...sprintSets], names, run + sprintSets.length),
    },
    updated: new Date().toISOString(),
  };
}

export async function getSeason(year = new Date().getUTCFullYear()): Promise<Season | null> {
  const store = getStore();
  const k = `f1:season:v5:${year}`;
  const kept = await store.get<Season>(k).catch(() => null);
  if (kept) return kept;
  const built = await build(year);
  // A season with no results yet (January) falls back to last year's.
  if (!built) return null;
  if (built.drivers.length === 0) return year > 2020 ? getSeason(year - 1) : null;
  await store.set(k, built, { ttlSeconds: KEEP_SECONDS }).catch(() => {});
  return built;
}

// ---- lap benchmarks ---------------------------------------------------------

export interface Benchmark {
  label: string;
  time: string;
  who: string;
  team: string;
  year: number;
}

/** The season's Jolpica race for an F1 meeting name. */
async function raceOf(meeting: string, year: number): Promise<JRace | null> {
  const schedule = await pages(`${year}/races/`, 1);
  const want = meeting.toLowerCase();
  // F1 and Jolpica don't always name a meeting alike ("Bahrain Grand Prix" was
  // held at Sepang in 2026 and Jolpica calls it "… in Malaysia").
  return (
    schedule.find((r) => r.raceName.toLowerCase() === want) ??
    schedule.find((r) => r.raceName.toLowerCase().startsWith(want)) ??
    schedule.find((r) => want.includes(r.Circuit.Location.country.toLowerCase())) ??
    null
  );
}

// ---- a circuit's history -----------------------------------------------------------

export interface PastRace {
  year: number;
  winner: { name: string; code?: string; team: string; grid: number | null } | null;
  pole: { name: string; code?: string; team: string; time: string | null } | null;
  fastest: { name: string; code?: string; time: string } | null;
}

export interface CircuitHistory {
  circuit: string;
  locality: string;
  country: string;
  /** Grands Prix held here before this season, and the first. */
  races: number;
  firstYear: number | null;
  /** The latest five, newest first. */
  recent: PastRace[];
  /** Most wins here among everyone (all time). */
  mostWins: { name: string; wins: number } | null;
}

/** Who has won, started on pole and set the fastest lap here, kept a week. */
export async function circuitHistory(meeting: string, year = new Date().getUTCFullYear()): Promise<CircuitHistory | null> {
  const store = getStore();
  const k = `f1:circuit-history:v2:${year}:${meeting.toLowerCase().replace(/\W+/g, "-")}`;
  const kept = await store.get<CircuitHistory>(k).catch(() => null);
  if (kept) return kept;
  const race = await raceOf(meeting, year);
  if (!race) return null;
  const id = race.Circuit.circuitId;
  const [wins, poles, fastest] = await Promise.all([pages(`circuits/${id}/results/1/`, 2), pages(`circuits/${id}/qualifying/1/`, 1), pages(`circuits/${id}/fastest/1/results/`, 1)]);
  const before = (r: JRace) => Number(r.season) < year;
  const won = wins.filter(before);
  const by = (list: JRace[]) => new Map(list.filter(before).map((r) => [Number(r.season), r]));
  const poleBy = by(poles);
  const fastBy = by(fastest);
  const tally = new Map<string, number>();
  for (const r of won) {
    const w = r.Results?.[0];
    if (w) tally.set(`${w.Driver.givenName} ${w.Driver.familyName}`, (tally.get(`${w.Driver.givenName} ${w.Driver.familyName}`) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const recent: PastRace[] = won
    .slice(-5)
    .reverse()
    .map((r) => {
      const y = Number(r.season);
      const w = r.Results?.[0];
      const p = poleBy.get(y)?.QualifyingResults?.[0];
      const f = fastBy.get(y)?.Results?.[0];
      return {
        year: y,
        winner: w ? { name: w.Driver.familyName, code: w.Driver.code, team: w.Constructor.name, grid: Number(w.grid) || null } : null,
        pole: p ? { name: p.Driver.familyName, code: p.Driver.code, team: p.Constructor.name, time: p.Q3 || p.Q2 || p.Q1 || null } : null,
        fastest: f?.FastestLap?.Time?.time ? { name: f.Driver.familyName, code: f.Driver.code, time: f.FastestLap.Time.time } : null,
      };
    });
  const out: CircuitHistory = {
    circuit: (race.Circuit as { circuitName?: string }).circuitName ?? race.raceName,
    locality: race.Circuit.Location.locality,
    country: race.Circuit.Location.country,
    races: won.length,
    firstYear: won[0] ? Number(won[0].season) : null,
    recent,
    mostWins: top ? { name: top[0], wins: top[1] } : null,
  };
  await store.set(k, out, { ttlSeconds: 7 * 86_400 }).catch(() => {});
  return out;
}

/**
 * Reference laps for a meeting's session: last year's pole (qualifying and
 * practice) or fastest race lap (races and sprints), and the fastest race
 * lap at the circuit since 2022 — the current cars' era, so layouts and
 * machinery compare.
 */
export async function benchmarks(meeting: string, type: string, year = new Date().getUTCFullYear()): Promise<Benchmark[]> {
  const store = getStore();
  const k = `f1:bench:v3:${year}:${meeting.toLowerCase().replace(/\W+/g, "-")}:${type === "Race" ? "race" : "quali"}`;
  const kept = await store.get<Benchmark[]>(k).catch(() => null);
  if (kept) return kept;
  const race = await raceOf(meeting, year);
  if (!race) return [];
  const id = race.Circuit.circuitId;
  const out: Benchmark[] = [];
  const [prevQuali, fastest] = await Promise.all([
    type === "Race" ? Promise.resolve([] as JRace[]) : pages(`${year - 1}/circuits/${id}/qualifying/1/`, 1),
    pages(`circuits/${id}/fastest/1/results/`, 1),
  ]);
  if (type !== "Race") {
    const q = prevQuali[0]?.QualifyingResults?.[0];
    const t = q?.Q3 || q?.Q2 || q?.Q1;
    if (q && t) out.push({ label: `Pole, ${year - 1}`, time: t, who: q.Driver.familyName, team: q.Constructor.name, year: year - 1 });
  } else {
    const last = fastest.find((r) => Number(r.season) === year - 1)?.Results?.[0];
    if (last?.FastestLap?.Time?.time) out.push({ label: `Fastest lap, ${year - 1}`, time: last.FastestLap.Time.time, who: last.Driver.familyName, team: last.Constructor.name, year: year - 1 });
  }
  let best: Benchmark | null = null;
  for (const r of fastest) {
    const s = Number(r.season);
    const row = r.Results?.[0];
    const t = row?.FastestLap?.Time?.time;
    if (!row || !t || s < 2022 || s >= year) continue;
    if (!best || (secs(t) ?? 1e9) < (secs(best.time) ?? 1e9)) best = { label: "Fastest race lap since 2022", time: t, who: row.Driver.familyName, team: row.Constructor.name, year: s };
  }
  if (best) out.push(best);
  if (out.length) await store.set(k, out, { ttlSeconds: 7 * 86_400 }).catch(() => {});
  return out;
}
