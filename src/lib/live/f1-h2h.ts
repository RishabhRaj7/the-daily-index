// Two drivers, head to head, for the season so far: who out-qualified whom,
// who finished ahead, and the typical qualifying gap — from Jolpica's
// qualifying and race classifications (free, no key). Teammates by default
// (the team's two most frequent drivers, so a one-off substitute doesn't
// replace the regular teammate), or any two drivers the reader follows.

const API = "https://api.jolpi.ca/ergast/f1";

interface Row {
  number: string;
  position: string;
  status?: string;
  Driver: { code?: string; familyName: string };
  Constructor: { name: string };
  Q1?: string;
  Q2?: string;
  Q3?: string;
}
interface Race {
  round: string;
  QualifyingResults?: Row[];
  Results?: Row[];
}

export interface HeadToHead {
  /** The team, when the two are teammates. */
  team: string | null;
  a: { code: string; name: string; team: string };
  b: { code: string; name: string; team: string };
  rounds: number;
  /** Qualifying sessions each came out ahead in. */
  quali: [number, number];
  /** Races each finished ahead in (a retirement counts as behind). */
  race: [number, number];
  /** Median qualifying gap, a minus b, in seconds (negative: a was quicker). */
  gap: number | null;
}
/** @deprecated the old name */
export type TeammateH2H = HeadToHead;

const secs = (t?: string) => {
  const m = /^(\d+):(\d+\.\d+)$/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

async function all(kind: "qualifying" | "results", year: number): Promise<Race[]> {
  const pages = await Promise.all(
    [0, 100, 200, 300, 400, 500].map(async (offset) => {
      try {
        const res = await fetch(`${API}/${year}/${kind}/?limit=100&offset=${offset}`, { next: { revalidate: 6 * 3600 } });
        if (!res.ok) return [] as Race[];
        return ((await res.json()) as { MRData: { RaceTable: { Races: Race[] } } }).MRData.RaceTable.Races;
      } catch {
        return [] as Race[];
      }
    }),
  );
  // A round can straddle two pages; join its rows back up.
  const byRound = new Map<string, Race>();
  for (const r of pages.flat()) {
    const had = byRound.get(r.round);
    byRound.set(r.round, had ? { ...had, QualifyingResults: [...(had.QualifyingResults ?? []), ...(r.QualifyingResults ?? [])], Results: [...(had.Results ?? []), ...(r.Results ?? [])] } : r);
  }
  return [...byRound.values()];
}

const teamOf = (name: string) => name.toLowerCase().replace(/\s+f1 team$/, "").replace(/^red bull$/, "red bull racing");
const codeOf = (row: Row) => row.Driver.code ?? row.Driver.familyName.slice(0, 3).toUpperCase();
const finished = (row: Row) => /^(Finished|\+\d+ Laps?|Lapped)$/.test(row.status ?? "");

function compare(quali: Race[], races: Race[], a: string, b: string): Omit<HeadToHead, "team" | "a" | "b"> {
  const q: [number, number] = [0, 0];
  const gaps: number[] = [];
  for (const r of quali) {
    const ra = r.QualifyingResults?.find((x) => codeOf(x) === a);
    const rb = r.QualifyingResults?.find((x) => codeOf(x) === b);
    if (!ra || !rb) continue;
    if (Number(ra.position) < Number(rb.position)) q[0]++;
    else q[1]++;
    // The gap in the deepest part both took part in.
    for (const part of ["Q3", "Q2", "Q1"] as const) {
      const ta = secs(ra[part]);
      const tb = secs(rb[part]);
      if (ta !== null && tb !== null) {
        gaps.push(ta - tb);
        break;
      }
    }
  }
  const rc: [number, number] = [0, 0];
  for (const r of races) {
    const ra = r.Results?.find((x) => codeOf(x) === a);
    const rb = r.Results?.find((x) => codeOf(x) === b);
    if (!ra || !rb) continue;
    if (finished(ra) && (!finished(rb) || Number(ra.position) < Number(rb.position))) rc[0]++;
    else if (finished(rb) && (!finished(ra) || Number(rb.position) < Number(ra.position))) rc[1]++;
  }
  gaps.sort((x, y) => x - y);
  return {
    rounds: Math.max(q[0] + q[1], rc[0] + rc[1]),
    quali: q,
    race: rc,
    gap: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] * 1000) / 1000 : null,
  };
}

function who(races: Race[], code: string): { code: string; name: string; team: string } | null {
  for (const r of [...races].reverse()) {
    const row = r.Results?.find((x) => codeOf(x) === code);
    if (row) return { code, name: row.Driver.familyName, team: row.Constructor.name };
  }
  return null;
}

/** A team's regular pairing, head to head. */
export async function teammateH2H(team: string, year = new Date().getUTCFullYear()): Promise<HeadToHead | null> {
  const want = teamOf(team);
  const [quali, races] = await Promise.all([all("qualifying", year), all("results", year)]);
  const count = new Map<string, number>();
  for (const r of races) for (const row of r.Results ?? []) if (teamOf(row.Constructor.name) === want) count.set(codeOf(row), (count.get(codeOf(row)) ?? 0) + 1);
  const [a, b] = [...count.entries()].sort((x, y) => y[1] - x[1]).map(([c]) => c);
  const da = a ? who(races, a) : null;
  const db = b ? who(races, b) : null;
  if (!da || !db) return null;
  return { team, a: da, b: db, ...compare(quali, races, a, b) };
}

/** Any two drivers, head to head (by timing code). */
export async function driversH2H(a: string, b: string, year = new Date().getUTCFullYear()): Promise<HeadToHead | null> {
  const [quali, races] = await Promise.all([all("qualifying", year), all("results", year)]);
  const da = who(races, a.toUpperCase());
  const db = who(races, b.toUpperCase());
  if (!da || !db || da.code === db.code) return null;
  return { team: teamOf(da.team) === teamOf(db.team) ? da.team : null, a: da, b: db, ...compare(quali, races, da.code, db.code) };
}
