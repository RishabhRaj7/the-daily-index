// Teammates, head to head, for the season so far: who out-qualified whom,
// who finished ahead, and the typical qualifying gap — from Jolpica's
// qualifying and race classifications (free, no key). The pairing is the
// team's two most frequent drivers, so a one-off substitute doesn't replace
// the regular teammate.

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

export interface TeammateH2H {
  team: string;
  a: { code: string; name: string };
  b: { code: string; name: string };
  rounds: number;
  /** Qualifying sessions each came out ahead in. */
  quali: [number, number];
  /** Races each finished ahead in (a retirement counts as behind). */
  race: [number, number];
  /** Median qualifying gap, a minus b, in seconds (negative: a was quicker). */
  gap: number | null;
}

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

export async function teammateH2H(team: string, year = new Date().getUTCFullYear()): Promise<TeammateH2H | null> {
  const want = teamOf(team);
  const [quali, races] = await Promise.all([all("qualifying", year), all("results", year)]);
  const mine = (rows: Row[] | undefined) => (rows ?? []).filter((r) => teamOf(r.Constructor.name) === want);

  // The regular pairing: the two drivers with the most race starts for the team.
  const count = new Map<string, { code: string; name: string; n: number }>();
  for (const r of races) {
    for (const row of mine(r.Results)) {
      const code = row.Driver.code ?? row.Driver.familyName.slice(0, 3).toUpperCase();
      const c = count.get(code) ?? { code, name: row.Driver.familyName, n: 0 };
      c.n++;
      count.set(code, c);
    }
  }
  const [a, b] = [...count.values()].sort((x, y) => y.n - x.n);
  if (!a || !b) return null;
  const codeOf = (row: Row) => row.Driver.code ?? row.Driver.familyName.slice(0, 3).toUpperCase();

  const q: [number, number] = [0, 0];
  const gaps: number[] = [];
  for (const r of quali) {
    const ra = mine(r.QualifyingResults).find((x) => codeOf(x) === a.code);
    const rb = mine(r.QualifyingResults).find((x) => codeOf(x) === b.code);
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

  const finished = (row: Row) => /^(Finished|\+\d+ Laps?|Lapped)$/.test(row.status ?? "");
  const rc: [number, number] = [0, 0];
  for (const r of races) {
    const ra = mine(r.Results).find((x) => codeOf(x) === a.code);
    const rb = mine(r.Results).find((x) => codeOf(x) === b.code);
    if (!ra || !rb) continue;
    const aAhead = finished(ra) && (!finished(rb) || Number(ra.position) < Number(rb.position));
    const bAhead = finished(rb) && (!finished(ra) || Number(rb.position) < Number(ra.position));
    if (aAhead) rc[0]++;
    else if (bAhead) rc[1]++;
  }

  gaps.sort((x, y) => x - y);
  return {
    team,
    a: { code: a.code, name: a.name },
    b: { code: b.code, name: b.name },
    rounds: Math.max(q[0] + q[1], rc[0] + rc[1]),
    quali: q,
    race: rc,
    gap: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] * 1000) / 1000 : null,
  };
}
