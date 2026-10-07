import type { ValorantData, ValEvent, ValMatch, ValNews, ValSide, ValTeam, ValWinnerOdds } from "@/lib/types";
import { getStore } from "@/lib/server/store";

// Clutch: Valorant's major competitions, for the teams the reader follows.
//
//   Riot's esports API    schedule, results (maps won), group records and
//                         team logos for every VCT league. It is the
//                         backend of valorantesports.com: keyless apart
//                         from the site's own public key, undocumented, so
//                         everything here degrades to nothing if it moves.
//   VLR.gg RSS            the scene's news (VLR's robots.txt allows it).
//   Polymarket            match-winner and event-winner prices, read from
//                         its public API (the site itself needs a VPN in
//                         India; the API does not).
//
// Only the majors: Champions, Masters, the four VCT leagues (Americas,
// EMEA, Pacific, China; their Kickoff and Stages live inside them), the
// Esports World Cup and LOCK//IN. Challengers and Game Changers are left out.
//
// The year has seasons. While an international event runs the section
// follows it; while the leagues play it follows the reader's league; in
// the off-season it shrinks to the next date and the news.

const API = "https://esports-api.service.valorantesports.com/persisted/val";
const KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"; // valorantesports.com's public key
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DAY = 86_400_000;

export const MAJORS = /^(Champions|VALORANT Masters|VCT Americas|VCT EMEA|VCT Pacific|VCT CN|Esports World Cup|VCT LOCK\/\/IN)$/i;
const INTERNATIONAL = /^(Champions|VALORANT Masters|Esports World Cup|VCT LOCK\/\/IN)$/i;
const REGION: Record<string, string> = {
  "VCT Americas": "Americas",
  "VCT EMEA": "EMEA",
  "VCT Pacific": "Pacific",
  "VCT CN": "China",
};

export interface RiotLeague { id: string; slug: string; name: string; region: string; image: string }
export interface RiotTeam { name: string; code: string; image?: string; result?: { outcome?: string | null; gameWins?: number } | null; record?: { wins: number; losses: number } | null }
export interface RiotEvent {
  startTime: string;
  state: "unstarted" | "inProgress" | "completed";
  type: string;
  blockName?: string;
  league: { name: string; slug: string; region: string; image?: string };
  tournament?: { split?: { name?: string }; season?: { name?: string } };
  match?: { id: string; teams: RiotTeam[]; strategy?: { count?: number } };
}

export async function riot<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(`${API}/${path}${path.includes("?") ? "&" : "?"}hl=en-US&sport=val`, {
      headers: { "x-api-key": KEY, "User-Agent": UA },
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { data?: T }).data ?? null;
  } catch {
    return null;
  }
}

export const https = (url?: string | null) => (url ? url.replace(/^http:\/\//, "https://") : null);

/** "Champions Shanghai", "VCT Pacific Stage 2 2026"… from the league and split. */
export function eventName(e: RiotEvent): string {
  const split = e.tournament?.split?.name ?? "";
  const season = e.tournament?.season?.name ?? "";
  const year = season.match(/20\d\d/)?.[0] ?? "";
  const name = e.league.name === "VALORANT Masters" ? "Masters" : e.league.name === "VCT CN" ? "VCT China" : e.league.name;
  // An international named for its city ("Champions Paris", "Masters
  // Toronto") is the whole name; anything else keeps its league and year
  // ("VCT Pacific Stage 2 2026"), since a league's splits repeat each year.
  if (/^(champions|masters) [A-Z]/i.test(split) && !/_/.test(split)) return split;
  if (/esports world cup/i.test(name)) return `Esports World Cup ${year}`.trim();
  // Splits are sometimes readable ("Stage 2"), sometimes slugs ("pacific_split_2").
  const own = new Set(name.toLowerCase().split(/\s+/).concat(e.league.region.toLowerCase(), "cn", "emea"));
  const pretty = split
    .replace(/_/g, " ")
    .replace(/\b(vct|valorant)\b/gi, "")
    .replace(/\b20\d\d\b/, "")
    .split(/\s+/)
    .filter((w) => w && !own.has(w.toLowerCase()))
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return [name, pretty, year].filter(Boolean).join(" ");
}

export function eventKey(e: RiotEvent): string {
  return `${e.league.slug}:${e.tournament?.season?.name ?? ""}:${e.tournament?.split?.name ?? ""}`;
}

export function side(t: RiotTeam): ValSide {
  return {
    code: t.code,
    name: t.name,
    image: https(t.image),
    wins: typeof t.result?.gameWins === "number" ? t.result.gameWins : null,
    outcome: t.result?.outcome === "win" || t.result?.outcome === "loss" ? t.result.outcome : undefined,
    record: t.record ? `${t.record.wins}–${t.record.losses}` : undefined,
  };
}

// ---- Polymarket ----------------------------------------------------------------

interface PmMarket { question?: string; groupItemTitle?: string; outcomes?: string; outcomePrices?: string; sportsMarketType?: string; closed?: boolean; volume?: string }
interface PmEvent { title: string; slug: string; startTime?: string; volume?: number; markets?: PmMarket[] }

const arr = (v?: string): string[] => {
  try {
    const a = JSON.parse(v ?? "[]");
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
};
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(team|esports|gaming|e-sports|club)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
const sameTeam = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

// The search answers with ~4 MB (every market's full text), past the data
// cache's 2 MB, so the few fields used are kept in the store for five minutes.
const PM_KEY = "val:pm:v1";

async function polymarketValorant(): Promise<PmEvent[]> {
  const store = getStore();
  const kept = await store.get<{ at: number; events: PmEvent[] }>(PM_KEY).catch(() => null);
  if (kept && Date.now() - kept.at < 5 * 60_000) return kept.events;
  try {
    const res = await fetch("https://gamma-api.polymarket.com/public-search?q=valorant&events_status=active&limit_per_type=40", {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return kept?.events ?? [];
    const events = (((await res.json()) as { events?: PmEvent[] }).events ?? []).map((e) => ({
      title: e.title,
      slug: e.slug,
      startTime: e.startTime,
      volume: e.volume,
      markets: (e.markets ?? []).map(({ groupItemTitle, outcomes, outcomePrices, sportsMarketType, closed }) => ({ groupItemTitle, outcomes, outcomePrices, sportsMarketType, closed })),
    }));
    await store.set(PM_KEY, { at: Date.now(), events }, { ttlSeconds: 3600 }).catch(() => {});
    return events;
  } catch {
    return kept?.events ?? [];
  }
}

/** Match-winner prices for a scheduled match (Polymarket files one event per match). */
function matchOdds(m: ValMatch, pm: PmEvent[]): ValMatch["odds"] {
  const [a, b] = m.teams;
  if (!a || !b || a.code === "TBD" || b.code === "TBD") return undefined;
  for (const e of pm) {
    if (!/^valorant:/i.test(e.title)) continue;
    if (e.startTime && Math.abs(Date.parse(e.startTime) - Date.parse(m.start)) > 12 * 3_600_000) continue;
    const winner = (e.markets ?? []).find((x) => x.sportsMarketType === "moneyline" && !x.closed);
    if (!winner) continue;
    const names = arr(winner.outcomes);
    const prices = arr(winner.outcomePrices).map(Number);
    const ia = names.findIndex((n) => sameTeam(n, a.name));
    const ib = names.findIndex((n) => sameTeam(n, b.name));
    if (ia < 0 || ib < 0 || ia === ib) continue;
    return {
      a: Math.round(prices[ia] * 100),
      b: Math.round(prices[ib] * 100),
      volume: Math.round(e.volume ?? 0),
      url: `https://polymarket.com/event/${e.slug}`,
    };
  }
  return undefined;
}

/** "Valorant: TYLOO vs Team Liquid (BO3) - VCT Champions Group C" → "C", for the match of those two teams. */
function groupOf(m: ValMatch, pm: PmEvent[]): string | undefined {
  const [a, b] = m.teams;
  const e = pm.find((x) => /^valorant:/i.test(x.title) && sameTeam(x.title, a.name) && sameTeam(x.title, b.name) && /\bgroup [a-d]\b/i.test(x.title));
  return e?.title.match(/\bgroup ([a-d])\b/i)?.[1].toUpperCase();
}

/**
 * Matches Polymarket has priced that Riot hasn't scheduled yet (Riot fills
 * a playoff slot only once the draw is made): a followed team's next match
 * can show up here first.
 */
function marketOnlyMatches(pm: PmEvent[], scheduled: ValMatch[], teams: ValTeam[], event: ValEvent | undefined): ValMatch[] {
  const out: ValMatch[] = [];
  for (const e of pm) {
    const t = e.title.match(/^valorant:\s*(.+?)\s+vs\.?\s+(.+?)\s*\((bo\d)\)/i);
    if (!t || !e.startTime || Date.parse(e.startTime) < Date.now() - 3 * 3_600_000) continue;
    const ta = teams.find((x) => sameTeam(t[1], x.name));
    const tb = teams.find((x) => sameTeam(t[2], x.name));
    if (!ta || !tb) continue;
    const known = scheduled.some(
      (m) => m.teams.some((s) => s.code === ta.code) && m.teams.some((s) => s.code === tb.code) && Math.abs(Date.parse(m.start) - Date.parse(e.startTime!)) < 12 * 3_600_000,
    );
    if (known) continue;
    const blank = (x: ValTeam): ValSide => ({ code: x.code, name: x.name, image: x.image, wins: null });
    const m: ValMatch = {
      id: `pm:${e.slug}`,
      start: e.startTime,
      state: "unstarted",
      event: event?.name ?? "VCT",
      eventKey: event?.key ?? "",
      stage: e.title.match(/\b(playoffs|group [a-d]|final[s]?|upper|lower)[^)]*$/i)?.[0] ?? "",
      bestOf: Number(t[3].slice(2)) || 3,
      teams: [blank(ta), blank(tb)],
      fromMarket: true,
    };
    out.push({ ...m, odds: matchOdds(m, pm) });
  }
  return out;
}

/** "VALORANT Champions 2026: Winner": the field's leaders. */
function winnerOdds(event: ValEvent, pm: PmEvent[]): ValWinnerOdds | undefined {
  const year = event.name.match(/20\d\d/)?.[0] ?? String(new Date(event.end).getUTCFullYear());
  const kind = /champions/i.test(event.name) ? "champions" : /masters/i.test(event.name) ? "masters" : /world cup/i.test(event.name) ? "world cup" : null;
  if (!kind) return undefined;
  const e = pm.find((x) => new RegExp(`${kind}.*${year}.*winner|winner.*${kind}`, "i").test(x.title));
  if (!e) return undefined;
  const field = (e.markets ?? [])
    // Placeholder rows ("Team A", "Other") wait for a name and a price.
    .filter((x) => !x.closed && x.groupItemTitle && !/^(team [a-z]|other|tbd)$/i.test(x.groupItemTitle))
    .map((x) => ({ name: x.groupItemTitle!, prob: Math.round(Number(arr(x.outcomePrices)[0]) * 1000) / 10 }))
    .filter((x) => Number.isFinite(x.prob) && x.prob >= 0.5)
    .sort((x, y) => y.prob - x.prob);
  if (field.length === 0) return undefined;
  return { title: e.title, url: `https://polymarket.com/event/${e.slug}`, volume: Math.round(e.volume ?? 0), field };
}

// ---- VLR news --------------------------------------------------------------------

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function vlrNews(): Promise<ValNews[]> {
  try {
    const res = await fetch("https://www.vlr.gg/rss", {
      headers: { "User-Agent": UA, Accept: "application/rss+xml" },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return xml
      .split("<item>")
      .slice(1)
      .flatMap((item) => {
        const pick = (tag: string) => decode(item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
        const title = pick("title");
        const url = pick("link");
        // VLR dates its items "Wed, 30 Sep 2026 19:56:08 IST".
        const at = Date.parse(pick("pubDate").replace(/\bIST$/, "+0530"));
        if (!title || !url) return [];
        return [{ title, url, summary: pick("description"), publishedAt: Number.isNaN(at) ? null : new Date(at).toISOString() }];
      });
  } catch {
    return [];
  }
}

// ---- the whole picture ----------------------------------------------------------------

export async function getValorant(now = Date.now()): Promise<ValorantData | null> {
  const leagues = (await riot<{ leagues: RiotLeague[] }>("getLeagues", 86_400))?.leagues.filter((l) => MAJORS.test(l.name)) ?? [];
  if (leagues.length === 0) return null;

  // Each league's newest page: its latest event and anything scheduled.
  // During an event the schedule changes by the hour; results by the minute.
  const [pages, pm, news] = await Promise.all([
    Promise.all(leagues.map((l) => riot<{ schedule: { events: RiotEvent[] } }>(`getSchedule?leagueId=${l.id}`, 60))),
    polymarketValorant(),
    vlrNews(),
  ]);
  const raw = pages.flatMap((p) => p?.schedule.events ?? []).filter((e) => e.type === "match" && e.match);

  // Events: one per league, season and split, dated by its first and last match.
  const byEvent = new Map<string, RiotEvent[]>();
  for (const e of raw) byEvent.set(eventKey(e), [...(byEvent.get(eventKey(e)) ?? []), e]);
  const events: ValEvent[] = [...byEvent.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const live = sorted.find((e) => e.state === "inProgress");
    const next = sorted.find((e) => e.state === "unstarted");
    const done = [...sorted].reverse().find((e) => e.state === "completed");
    return {
      key,
      name: eventName(first),
      league: first.league.name,
      region: REGION[first.league.name] ?? "International",
      international: INTERNATIONAL.test(first.league.name),
      logo: https(first.league.image),
      start: first.startTime,
      end: last.startTime,
      stage: (live ?? next ?? done ?? last).blockName ?? "",
      finished: !next && !live,
    };
  });

  // What counts as now: an event from the day before its first match to
  // two days after its last.
  const running = events.filter((e) => Date.parse(e.start) - DAY <= now && now <= Date.parse(e.end) + 2 * DAY);
  const phase: ValorantData["phase"] = running.some((e) => e.international) ? "event" : running.length > 0 ? "league" : "off";
  const nextEvent = events
    .filter((e) => Date.parse(e.start) > now)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const lastEvent = events
    .filter((e) => Date.parse(e.end) <= now)
    .sort((a, b) => b.end.localeCompare(a.end))[0];

  // Matches: everything of the running events, and each league's last
  // month and next month so a followed team always has a last and a next.
  const eventOf = new Map(events.map((e) => [e.key, e]));
  const matches: ValMatch[] = raw
    .filter((e) => Math.abs(Date.parse(e.startTime) - now) <= 45 * DAY || running.some((r) => r.key === eventKey(e)))
    .map((e) => {
      const m: ValMatch = {
        id: e.match!.id,
        start: e.startTime,
        state: e.state,
        event: eventOf.get(eventKey(e))?.name ?? e.league.name,
        eventKey: eventKey(e),
        stage: e.blockName ?? "",
        bestOf: e.match!.strategy?.count ?? 3,
        teams: [side(e.match!.teams[0]), side(e.match!.teams[1])],
      };
      const group = /group/i.test(m.stage) ? groupOf(m, pm) : undefined;
      return { ...m, ...(m.state === "completed" ? {} : { odds: matchOdds(m, pm) }), ...(group ? { group } : {}) };
    })
    .sort((a, b) => a.start.localeCompare(b.start));

  // The picker's list: every team in this year's majors, by league.
  const year = new Date(now).getUTCFullYear();
  const teams = new Map<string, ValTeam>();
  for (const e of raw) {
    if (!(e.tournament?.season?.name ?? "").includes(String(year)) && !(e.tournament?.season?.name ?? "").includes(String(year - 1))) continue;
    for (const t of e.match!.teams) {
      if (!t.code || t.code === "TBD" || /^tbd$/i.test(t.name)) continue;
      const region = REGION[e.league.name];
      const had = teams.get(t.code);
      if (!had || (!had.region && region)) teams.set(t.code, { code: t.code, name: t.name, image: https(t.image), region: region ?? had?.region });
    }
  }

  const featured = running.find((e) => e.international) ?? running[0] ?? null;
  const teamList = [...teams.values()];
  matches.push(...marketOnlyMatches(pm, matches, teamList, featured ?? undefined));
  matches.sort((a, b) => a.start.localeCompare(b.start));
  return {
    phase,
    events: running,
    featured: featured ? { ...featured, odds: winnerOdds(featured, pm) } : null,
    nextEvent: nextEvent ?? null,
    lastEvent: lastEvent ?? null,
    matches,
    teams: teamList.sort((a, b) => (a.region ?? "~").localeCompare(b.region ?? "~") || a.name.localeCompare(b.name)),
    news: news.slice(0, 20),
    fetchedAt: new Date(now).toISOString(),
  };
}
