// Every call to Jolpica (the Ergast successor: free, no key) goes through here, one
// at a time. It allows about 4 requests a second and refuses the rest with a 429, so
// calls are spaced out, and a refusal waits and asks again. A call that still fails
// throws, and never reads as "no data": a page of results quietly dropped once made
// whole rounds vanish from the season's totals, and a circuit's poles from its
// history for the week that answer was kept.

const API = "https://api.jolpi.ca/ergast/f1";
const GAP_MS = 300;
const TRIES = 4;
const PAGE = 100;

export class JolpicaUnavailable extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let nextSlot = 0;
async function turn(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP_MS;
  if (at > now) await sleep(at - now);
}

/** One answer from Jolpica, or JolpicaUnavailable. */
export async function jolpicaGet<T>(path: string, init: RequestInit = {}): Promise<T> {
  let why = "";
  for (let attempt = 0; attempt < TRIES; attempt++) {
    await turn();
    try {
      const res = await fetch(`${API}/${path}`, init);
      if (res.ok) return (await res.json()) as T;
      why = `${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
      const asked = Number(res.headers.get("retry-after"));
      await sleep(asked > 0 ? asked * 1000 : 1500 * 2 ** attempt);
    } catch (err) {
      why = err instanceof Error ? err.message : "failed";
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw new JolpicaUnavailable(`jolpica ${path}: ${why}`);
}

interface Paged<R> {
  MRData: { total?: string; RaceTable: { Races: R[] } };
}

/** Every page of a list, in turn, stopping at its end. All of it, or JolpicaUnavailable. */
export async function jolpicaRaces<R>(path: string, revalidate: number): Promise<R[]> {
  const races: R[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await jolpicaGet<Paged<R>>(`${path}?limit=${PAGE}&offset=${offset}`, { next: { revalidate } });
    races.push(...page.MRData.RaceTable.Races);
    if (offset + PAGE >= Number(page.MRData.total ?? 0)) return races;
  }
}
