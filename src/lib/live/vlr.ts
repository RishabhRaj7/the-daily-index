import type { ValMapStats, ValMatchStats, ValPlayerStats, ValStatLine } from "@/lib/types";
import { getStore } from "@/lib/server/store";

// A match's numbers, map by map: every player's rating, ACS, K/D/A, KAST,
// ADR, headshots and first kills (whole match, attack and defence), the
// agents they played, the score and how each round was won. Riot's API
// has none of it; VLR.gg's match pages do (its robots.txt allows them).
//
// Riot and VLR don't share match ids, so the VLR page is found by its
// address, which spells out both teams ("/753456/g2-esports-vs-paper-rex-
// valorant-champions-2026-winners-c"), from VLR's live-and-upcoming list,
// its recent results, and each team's own match list (the team found
// once through VLR's search); the candidate nearest in time wins.
//
// A finished match never changes, so its numbers are kept for good; a live
// one is re-read every minute. VLR is a web page, not an API: if its
// layout changes the parse comes back empty and the sheet says so.

const VLR = "https://www.vlr.gg";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function page(path: string, revalidate: number): Promise<string | null> {
  try {
    const res = await fetch(`${VLR}${path}`, { headers: { "User-Agent": UA }, next: { revalidate }, signal: AbortSignal.timeout(9000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// ---- finding the page ---------------------------------------------------------------------

/** "Paper Rex" → "paperrex"; "G2 Esports" → "g2" (the words every site drops or adds). */
const key = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(team|esports|e-sports|gaming|club|gc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

const inSlug = (slug: string, name: string) => {
  const k = key(name);
  return k.length >= 2 && slug.replace(/[^a-z0-9]/g, "").includes(k);
};

const links = (html: string | null) => [...new Set([...(html ?? "").matchAll(/href="(\/\d{4,}\/[a-z0-9-]+)"/g)].map((m) => m[1]))];

/** VLR's id for a team, found once through its search and kept. */
async function teamPath(name: string): Promise<string | null> {
  const store = getStore();
  const k = `vlr:team:v1:${key(name)}`;
  const kept = await store.get<string>(k).catch(() => null);
  if (kept) return kept;
  const html = await page(`/search/?q=${encodeURIComponent(name)}&type=teams`, 86_400);
  const id = html?.match(/\/search\/r\/team\/(\d+)\/idx/)?.[1];
  if (!id) return null;
  const path = `/team/matches/${id}/`;
  await store.set(k, path, { ttlSeconds: 180 * 86_400 }).catch(() => {});
  return path;
}

/** When a match page says it starts (VLR prints it in US Eastern time; a few hours either way is fine here). */
const startOf = (html: string) => {
  const ts = html.match(/class="moment-tz-convert" data-utc-ts="([\d-]+ [\d:]+)"/)?.[1];
  return ts ? Date.parse(`${ts.replace(" ", "T")}Z`) : NaN;
};

export async function findVlrMatch(a: string, b: string, start: string, live: boolean): Promise<string | null> {
  const store = getStore();
  const k = `vlr:map:v1:${key(a)}:${key(b)}:${start.slice(0, 13)}`;
  const kept = await store.get<string>(k).catch(() => null);
  if (kept) return kept;

  const [upcoming, results, teamA, teamB] = await Promise.all([
    page("/matches", 60),
    page("/matches/results", 300),
    teamPath(a).then((p) => (p ? page(p, live ? 120 : 3600) : null)),
    teamPath(b).then((p) => (p ? page(p, live ? 120 : 3600) : null)),
  ]);
  const candidates = [...links(upcoming), ...links(results), ...links(teamA), ...links(teamB)].filter(
    (href, i, all) => all.indexOf(href) === i && inSlug(href, a) && inSlug(href, b),
  );
  if (candidates.length === 0) return null;

  // The same pair can meet twice in an event: take the one nearest in time.
  const want = Date.parse(start);
  const dated = await Promise.all(candidates.slice(0, 5).map(async (href) => ({ href, at: startOf((await page(href, 300)) ?? "") })));
  const best = dated.filter((d) => Number.isFinite(d.at) && Math.abs(d.at - want) < 36 * 3_600_000).sort((x, y) => Math.abs(x.at - want) - Math.abs(y.at - want))[0];
  if (!best) return null;
  await store.set(k, best.href, { ttlSeconds: 365 * 86_400 }).catch(() => {});
  return best.href;
}

// ---- reading it ---------------------------------------------------------------------------

const text = (s: string | undefined) =>
  (s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const num = (s: string | undefined): number | null => {
  const n = Number((s ?? "").replace(/[%+]/g, "").trim());
  return (s ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

/** One stat cell's three values: both sides, attack, defence. */
function sides(cell: string): [string, string, string] {
  const v = (side: string) => text(cell.match(new RegExp(`<span class="side mod-${side}[^"]*"[^>]*>([\\s\\S]*?)</span>`))?.[1]);
  return [v("both"), v("t"), v("ct")];
}

const COLS = ["rating2", "acs", "kills", "deaths", "assists", "kd-diff", "kast", "adr", "hsp", "fb", "fd", "fk-diff"] as const;

function line(cells: Record<string, [string, string, string]>, i: 0 | 1 | 2): ValStatLine | null {
  const get = (c: (typeof COLS)[number]) => num(cells[c]?.[i]);
  if (get("kills") == null && get("acs") == null) return null;
  return {
    r: get("rating2"),
    acs: get("acs"),
    k: get("kills"),
    d: get("deaths"),
    a: get("assists"),
    kd: get("kd-diff"),
    kast: get("kast"),
    adr: get("adr"),
    hs: get("hsp"),
    fk: get("fb"),
    fd: get("fd"),
    fkd: get("fk-diff"),
  };
}

function players(table: string): ValPlayerStats[] {
  return table
    .split('<div class="ovw-row">')
    .slice(1)
    .flatMap((row) => {
      const name = text(row.match(/class="ovw-player-name[^"]*">([\s\S]*?)<\/div>/)?.[1]);
      if (!name) return [];
      const agents = [...row.matchAll(/class="stats-sq mod-agent[^"]*"><img[^>]*alt="([^"]+)"/g)].map((m) => m[1].toLowerCase().replace(/[^a-z0-9]/g, ""));
      const cells: Record<string, [string, string, string]> = {};
      for (const col of COLS) {
        const at = row.indexOf(`data-col="${col}"`);
        if (at < 0) continue;
        // The cell runs to the next column's marker.
        const rest = row.slice(at);
        const next = rest.slice(1).search(/data-col="/);
        cells[col] = sides(next > 0 ? rest.slice(0, next + 1) : rest);
      }
      const all = line(cells, 0);
      if (!all) return [];
      return [{ name, team: text(row.match(/class="ovw-player-tag[^"]*">([\s\S]*?)<\/div>/)?.[1]), agents, all, t: line(cells, 1), ct: line(cells, 2) }];
    });
}

const HOW: Record<string, ValMapStats["rounds"][number]["how"]> = { elim: "elim", defuse: "defuse", boom: "boom", time: "time" };

function game(block: string, id: string): Omit<ValMapStats, "teams"> & { tables: [ValPlayerStats[], ValPlayerStats[]] } {
  const tables = block.split('<div class="ovw-table">').slice(1);
  const header = block.slice(0, block.indexOf('<div class="ovw-table">') > 0 ? block.indexOf('<div class="ovw-table">') : 3000);
  const scores = [...header.matchAll(/<div class="score[^"]*"[^>]*>\s*(\d+)\s*<\/div>/g)].map((m) => Number(m[1]));
  const mapCell = header.match(/<div class="map">([\s\S]*?)<div class="map-duration/)?.[1] ?? "";
  const name = text(mapCell.replace(/<span class="picked[\s\S]*?<\/span>/, ""));
  const picked = mapCell.match(/class="picked mod-(\d)/)?.[1];
  const duration = text(header.match(/class="map-duration[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1]) || null;
  // One column per round (the score so far in its title), team one's square above team two's.
  const rounds = block.split('<div class="vlr-rounds-row-col" title=').slice(1).flatMap((col) => {
    const sq = [...col.matchAll(/<div class="rnd-sq([^"]*)">([\s\S]*?)<\/div>/g)].slice(0, 2);
    const w = sq.findIndex((s) => /mod-win/.test(s[1]));
    if (w < 0) return [];
    const icon = sq[w][2].match(/round\/(\w+)\./)?.[1] ?? "";
    return [{ winner: w as 0 | 1, side: (/mod-t\b/.test(sq[w][1]) ? "t" : "ct") as "t" | "ct", how: HOW[icon] ?? null }];
  });
  return {
    id,
    name: id === "all" ? "All maps" : name || "Map",
    score: id === "all" ? [null, null] : [scores[0] ?? null, scores[1] ?? null],
    pickedBy: picked === "1" ? 0 : picked === "2" ? 1 : null,
    duration,
    rounds,
    tables: [players(tables[0] ?? ""), players(tables[1] ?? "")],
  };
}

export function parseVlrMatch(html: string, url: string): Omit<ValMatchStats, "vods" | "fetchedAt"> | null {
  const teamNames = [...html.matchAll(/class="match-header-link-name mod-(\d)">\s*<div class="wf-title-med[^"]*">([\s\S]*?)<\/div>/g)].map((m) => text(m[2]));
  const note = text(html.match(/class="match-header-vs-note[^"]*">([\s\S]*?)<\/div>/)?.[1]).toLowerCase();
  const live = /\blive\b/.test(note);
  const parts = html.split(/<div class="vm-stats-game[^"]*" data-game-id="/).slice(1);
  if (parts.length === 0 || teamNames.length < 2) return null;
  const games = parts.map((p) => {
    const id = p.slice(0, p.indexOf('"'));
    return game(p, id);
  });
  // "All maps" first, then the maps in the order played.
  const order = [...html.matchAll(/class="vm-stats-gamesnav-item[^"]*" data-game-id="(\w+)" data-disabled="(\d)"/g)].filter((m) => m[2] === "0").map((m) => m[1]);
  const maps = games
    .filter((g) => g.id === "all" || g.tables[0].length > 0 || g.score[0] != null)
    .sort((x, y) => (order.indexOf(x.id) >>> 0) - (order.indexOf(y.id) >>> 0))
    .map(({ tables, ...g }) => ({ ...g, teams: tables }));
  return { url: `${VLR}${url}`, live, teams: [teamNames[0], teamNames[1]], maps };
}

/** The match's numbers in the caller's team order (a first). */
export async function getMatchStats(a: string, b: string, start: string, live: boolean): Promise<Omit<ValMatchStats, "vods" | "fetchedAt"> | null> {
  const href = await findVlrMatch(a, b, start, live);
  if (!href) return null;
  const html = await page(href, live ? 60 : 3600);
  const parsed = html ? parseVlrMatch(html, href) : null;
  if (!parsed) return null;
  // VLR may list the teams the other way round.
  if (key(parsed.teams[0]) === key(b) || (inSlug(parsed.teams[1], a) && !inSlug(parsed.teams[0], a))) {
    return {
      ...parsed,
      teams: [parsed.teams[1], parsed.teams[0]],
      maps: parsed.maps.map((m) => ({
        ...m,
        score: [m.score[1], m.score[0]],
        pickedBy: m.pickedBy == null ? null : m.pickedBy === 0 ? 1 : 0,
        rounds: m.rounds.map((r) => ({ ...r, winner: r.winner === 0 ? 1 : 0 })),
        teams: [m.teams[1], m.teams[0]],
      })),
    };
  }
  return parsed;
}
