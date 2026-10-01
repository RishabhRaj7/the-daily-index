import type { ValMatch } from "@/lib/types";
import { getStore } from "@/lib/server/store";
import { MAJORS, riot, eventKey, eventName, side, type RiotEvent, type RiotLeague } from "./valorant";

// Clutch's memory: every finished match of the majors since 2024, for a
// team's history and two teams' head-to-head. Riot's schedule reads newest
// first, eighty matches a page, each page pointing to the one before; the
// past doesn't change, so the older pages sit in the data cache for a day
// and the compact result is kept in the store for twelve hours (refreshed
// after the response once it's older than that, like Straw Poll's odds).
//
// About 25 pages across the eight leagues; the first read takes a few
// seconds, every one after is instant.

const SINCE = "2024-01-01";
const MAX_PAGES = 8;
const KEY = "val:archive:v2";
const FRESH_MS = 12 * 3_600_000;

interface Archive {
  at: string;
  matches: ValMatch[];
}

interface Page {
  schedule: { events: RiotEvent[]; pages: { older: string | null; newer: string | null } };
}

async function leagueHistory(league: RiotLeague): Promise<ValMatch[]> {
  const out: ValMatch[] = [];
  let token: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page: Page | null = await riot<Page>(
      `getSchedule?leagueId=${league.id}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`,
      token ? 86_400 : 300,
    );
    if (!page) break;
    const events = page.schedule.events.filter((e) => e.type === "match" && e.match && e.state === "completed");
    for (const e of events) {
      out.push({
        id: e.match!.id,
        start: e.startTime,
        state: "completed",
        event: eventName(e),
        eventKey: eventKey(e),
        stage: e.blockName ?? "",
        bestOf: e.match!.strategy?.count ?? 3,
        teams: [side(e.match!.teams[0]), side(e.match!.teams[1])],
      });
    }
    const oldest = page.schedule.events[0]?.startTime ?? "";
    token = page.schedule.pages.older;
    if (!token || oldest < SINCE) break;
  }
  return out.filter((m) => m.start >= SINCE);
}

async function readArchive(): Promise<Archive> {
  const leagues = (await riot<{ leagues: RiotLeague[] }>("getLeagues", 86_400))?.leagues.filter((l) => MAJORS.test(l.name)) ?? [];
  const lists = await Promise.all(leagues.map((l) => leagueHistory(l).catch(() => [] as ValMatch[])));
  const seen = new Set<string>();
  const matches = lists
    .flat()
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .sort((a, b) => b.start.localeCompare(a.start));
  return { at: new Date().toISOString(), matches };
}

export async function getValArchive(later: (task: () => Promise<void>) => void = (t) => void t().catch(() => {})): Promise<ValMatch[]> {
  const store = getStore();
  const have = await store.get<Archive>(KEY).catch(() => null);
  if (have && Date.now() - Date.parse(have.at) < FRESH_MS) return have.matches;
  if (have) {
    later(async () => {
      if (!(await store.setIfAbsent(`${KEY}:lock`, 1, 120).catch(() => false))) return;
      try {
        const next = await readArchive();
        if (next.matches.length > 0) await store.set(KEY, next, { ttlSeconds: 7 * 86_400 }).catch(() => {});
      } finally {
        await store.del(`${KEY}:lock`).catch(() => {});
      }
    });
    return have.matches;
  }
  const next = await readArchive();
  if (next.matches.length > 0) await store.set(KEY, next, { ttlSeconds: 7 * 86_400 }).catch(() => {});
  return next.matches;
}

/** A team's finished matches since 2024, newest first. */
export async function teamHistory(code: string, later?: (task: () => Promise<void>) => void): Promise<ValMatch[]> {
  const all = await getValArchive(later);
  return all.filter((m) => m.teams.some((t) => t.code === code));
}
