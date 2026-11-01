import { getStore } from "@/lib/server/store";
import { decodeEntities } from "./rss";
import { popularFeed, redditFeed, worthReading, type RedditHit } from "./reddit";
import { noteCopy, socialCtx } from "./social-context";
import { F1_DRIVERS } from "@/lib/config/f1-drivers";
import { DEFAULT_X_ACCOUNTS, F1_DEFAULT_X, F1_OFFICIAL_X, F1_SUBREDDITS, F1_TEAM_X, IPO_SUBREDDITS, VAL_DEFAULT_X, VAL_SUBREDDITS, type FeedConfig } from "@/lib/feeds-shared";

export { DEFAULT_X_ACCOUNTS };

// What people are saying, from X and Reddit, as feeds:
//
//   X       through our own RSSHub on Render's free tier (RSSHUB_URL, guarded
//           by RSSHUB_ACCESS_KEY), which reads X as a logged-in burner account. Each account or
//           search is read at most every 10 minutes, shared by every reader,
//           so the burner stays far under X's limits.
//   Reddit  the public RSS feeds (lib/live/reddit.ts). A feed holds only the
//           newest 100 posts (half a day on the big Indian market subs), so
//           the IPO and Valorant feeds are kept here as a rolling archive —
//           every read adds what's new — and filtered on our side.
//
// Three uses: the Grapevine's "From your feeds" column (the reader's X
// accounts and searches), IPO chatter in the IPO sheet, and the transfer
// window in Clutch. Each ranks what it finds its own way (below).

export interface SocialPost {
  id: string;
  source: "x" | "reddit";
  /** "@handle" or "r/sub". */
  where: string;
  author: string | null;
  title: string;
  text: string;
  url: string;
  at: string;
  /** Why it ranked: "Paper Rex", "IPO". */
  tags?: string[];
}

export interface SocialAnswer {
  posts: SocialPost[];
  /** live: everything asked answered · partial: some did · unconfigured: no RSSHub for X · unavailable: nothing answered */
  status: "live" | "partial" | "unconfigured" | "unavailable";
  note: string | null;
  at: string;
  /** When the oldest copy in this answer was read, for "updated 3m ago". */
  asOf?: string | null;
  /** A feed has nothing yet and is waiting its turn (Reddit allows one read a minute): ask again shortly. */
  waiting?: boolean;
}

/** trends24 copies are fresh for five minutes (a reader's refresh: one). */
const FRESH_MS = 5 * 60_000;
/**
 * X is read through RSSHub as a logged-in burner account, so it is read
 * gently whatever the page asks: each account or search at most once every
 * ten minutes (a refresh button included; it gets the newest copy), and at
 * most X_PER_HOUR reads an hour across the whole site (deploy/rsshub/README.md).
 * Past that, lists show their last copies until the hour turns.
 */
const X_EVERY_MS = 10 * 60_000;
const X_PER_HOUR = 100;
async function xBudget(): Promise<boolean> {
  const used = await getStore().incr(`social:x:hour:${Math.floor(Date.now() / 3_600_000)}`, 3600).catch(() => 0);
  return used <= X_PER_HOUR;
}
/** RSSHub runs on one free instance: at most this many reads at once. */
const X_AT_ONCE = 4;
let xRunning = 0;
const xQueue: Array<() => void> = [];
async function xTurn<T>(fn: () => Promise<T>): Promise<T> {
  if (xRunning >= X_AT_ONCE) await new Promise<void>((go) => xQueue.push(go));
  xRunning++;
  try {
    return await fn();
  } finally {
    xRunning--;
    xQueue.shift()?.();
  }
}
const HOUR = 3_600_000;
const ageH = (iso: string) => Math.max(0, (Date.now() - Date.parse(iso)) / HOUR);
/** Half the weight every `half` hours. */
const decay = (iso: string, half: number) => Math.pow(0.5, ageH(iso) / half);

export const cleanHandle = (s: string) => s.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split(/[/?#]/)[0];
export const validHandle = (s: string) => /^[A-Za-z0-9_]{1,15}$/.test(s);

// ---- X, through RSSHub ----------------------------------------------------------

export const xConfigured = () => !!process.env.RSSHUB_URL?.trim();

interface JsonFeed {
  items?: Array<{ id?: string; url?: string; title?: string; content_html?: string; content_text?: string; date_published?: string; authors?: Array<{ name?: string }> }>;
}

const text = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** A post's words without the links and the repost/quote furniture X adds. */
function cleanPost(s: string): string {
  return s
    .replace(/^RT @\w+:\s*/i, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\bpic\.(twitter|x)\.com\/\S+/gi, "")
    .replace(/\s*[—–-]?\s*Quote\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Routes that failed lately, and when to try again (ms): a sleeping or broken RSSHub isn't asked on every read. */
const xBackoff = new Map<string, number>();

/** One RSSHub route as posts, fresh for five minutes (a refresh: one); a failed read keeps the last good copy three days. */
async function rsshub(route: string, where: string): Promise<SocialPost[] | null> {
  const base = process.env.RSSHUB_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  const key = `social:x:v1:${route}`;
  const store = getStore();
  const kept = await store.get<{ at: number; posts: SocialPost[] }>(key).catch(() => null);
  if ((kept && Date.now() - kept.at < X_EVERY_MS) || (xBackoff.get(route) ?? 0) > Date.now() || !(await xBudget())) {
    noteCopy(kept?.at, !kept);
    return kept?.posts ?? null;
  }
  return xTurn(() => readX(base, route, where, key, kept));
}

async function readX(base: string, route: string, where: string, key: string, kept: { at: number; posts: SocialPost[] } | null): Promise<SocialPost[] | null> {
  const store = getStore();
  const access = process.env.RSSHUB_ACCESS_KEY?.trim();
  const url = `${base}${route}${route.includes("?") ? "&" : "?"}format=json${access ? `&key=${encodeURIComponent(access)}` : ""}`;
  try {
    // A sleeping host takes a while to wake; the kept copy covers the wait next time.
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const feed = (await res.json()) as JsonFeed;
    const posts: SocialPost[] = (feed.items ?? []).flatMap((it) => {
      const body = cleanPost(it.content_text ?? text(it.content_html ?? it.title ?? ""));
      // A bare link, a lone emoji or a one-word reply says nothing on the page.
      if (!it.url || body.replace(/[^\p{L}\p{N}]/gu, "").length < 15) return [];
      const author = it.authors?.[0]?.name ?? null;
      return [{ id: `x-${it.id ?? it.url}`, source: "x" as const, where, author, title: body.slice(0, 280), text: "", url: it.url.replace("https://twitter.com/", "https://x.com/"), at: it.date_published ?? new Date().toISOString() }];
    });
    const at = Date.now();
    await store.set(key, { at, posts }, { ttlSeconds: 3 * 86_400 }).catch(() => {});
    xBackoff.delete(route);
    noteCopy(at);
    return posts;
  } catch (err) {
    console.error(`[social] RSSHub ${route} failed:`, err instanceof Error ? err.message : err);
    // Ask again in two minutes, not on every read.
    xBackoff.set(route, Date.now() + 2 * 60_000);
    noteCopy(kept?.at, !kept);
    return kept?.posts ?? null;
  }
}

/** An account's own posts: no replies, no reposts. */
const xUser = (handle: string) => rsshub(`/twitter/user/${handle}/excludeReplies=1&includeRts=0&count=20`, `@${handle}`);
/** X's search for a phrase. */
const xSearch = (q: string) => rsshub(`/twitter/keyword/${encodeURIComponent(q)}`, `“${q}”`);

// ---- Reddit, as a rolling archive -----------------------------------------------

/** A rolling archive's name: the paper's own for its default list, else one per set of subreddits. */
const rollName = (base: string, subs: string[], defaults: string[]) => {
  const list = [...new Set(subs.map((s) => s.toLowerCase()))].sort().join("+");
  return list === [...defaults.map((s) => s.toLowerCase())].sort().join("+") ? base : `${base}:${list}`;
};

/** The newest posts from these subreddits plus everything seen in the last `days`, newest first. */
async function rolling(name: string, subs: string[], days: number, cap = 800): Promise<RedditHit[] | null> {
  if (!subs.length) return null;
  const key = `social:reddit-roll:v1:${name}`;
  const store = getStore();
  const [fresh, kept] = await Promise.all([redditFeed(subs, "new"), store.get<RedditHit[]>(key).catch(() => null)]);
  if (!fresh && !kept) return null;
  const by = new Map<string, RedditHit>();
  for (const h of [...(kept ?? []), ...(fresh ?? [])]) by.set(h.id, h);
  const since = Date.now() - days * 24 * HOUR;
  const all = [...by.values()].filter((h) => Date.parse(h.createdAt) >= since).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, cap);
  if (fresh?.length) await store.set(key, all, { ttlSeconds: (days + 1) * 86_400 }).catch(() => {});
  return all;
}

const fromReddit = (h: RedditHit, tags?: string[]): SocialPost => ({
  id: `r-${h.id}`,
  source: "reddit",
  where: `r/${h.subreddit}`,
  author: h.author,
  title: h.title,
  text: h.text.slice(0, 220),
  url: h.url,
  at: h.createdAt,
  ...(tags?.length ? { tags } : {}),
});

/** One copy of each post: the same link, or the same words (a story two accounts posted alike). */
function dedupe(posts: SocialPost[]): SocialPost[] {
  const seen = new Set<string>();
  return posts.filter((p) => {
    const k = p.url.replace(/[?#].*$/, "").toLowerCase();
    const words = p.title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim().slice(0, 70);
    if (seen.has(k) || (words.length >= 30 && seen.has(words))) return false;
    seen.add(k);
    if (words.length >= 30) seen.add(words);
    return true;
  });
}

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const list of lists) if (list[i]) out.push(list[i]);
  return out;
}

/**
 * The best `limit` of each source, then all of them by score: "All" reads in
 * order of relevance, and the reader's X / Reddit filter always has a full
 * list of its own instead of what was left after the other source took the
 * top places.
 */
function topPerSource(scored: { post: SocialPost; score: number }[], limit: number): SocialPost[] {
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const kept = new Set(
    (["x", "reddit"] as const).flatMap((src) => dedupe(ranked.filter((s) => s.post.source === src).map((s) => s.post)).slice(0, limit)),
  );
  return ranked.map((s) => s.post).filter((p) => kept.delete(p));
}

const answer = (posts: SocialPost[], asked: number, answered: number, note: string | null = null): SocialAnswer => {
  const ctx = socialCtx();
  const oldest = ctx?.copies.length ? Math.min(...ctx.copies) : null;
  return {
    posts,
    status: asked === 0 || answered === asked ? "live" : answered > 0 ? "partial" : "unavailable",
    note: ctx?.waiting && !note ? "Some feeds are still waiting their turn with Reddit (one read a minute)." : note,
    at: new Date().toISOString(),
    asOf: oldest ? new Date(oldest).toISOString() : null,
    waiting: !!ctx?.waiting,
  };
};

// ---- the Grapevine: the reader's X accounts and searches, and their subreddits --
//
// X: the last three days, newest first, one account at a time in turn so a
// prolific one can't fill the column, searches after the accounts.
// Reddit: the day's top posts across the reader's subreddits, each subreddit
// taking its turn, without the subreddits' own housekeeping threads. The two
// then alternate, X first, so "All" always shows both; up to `perSource` of
// each come back: the page shows the first few and opens the rest in a sheet.

export async function grapevineFeeds(handles: string[], searches: string[], subreddits: string[], perSource = 20): Promise<SocialAnswer> {
  const wantX = xConfigured() && handles.length + searches.length > 0;
  const [reddit, ...lists] = await Promise.all([
    subreddits.length ? redditFeed(subreddits, "top") : Promise.resolve(null),
    ...(wantX ? [...handles.map(xUser), ...searches.map(xSearch)] : []),
  ]);
  const recent = lists.map((l) => (l ?? []).filter((p) => ageH(p.at) <= 72).sort((a, b) => b.at.localeCompare(a.at)));
  const x = dedupe(interleave(recent)).slice(0, perSource);
  const bySub = new Map<string, RedditHit[]>();
  for (const h of reddit ?? []) bySub.set(h.subreddit.toLowerCase(), [...(bySub.get(h.subreddit.toLowerCase()) ?? []), h]);
  const r = interleave([...bySub.values()]).slice(0, perSource).map((h) => fromReddit(h));
  const posts = dedupe(interleave([x, r]));
  const asked = (subreddits.length ? 1 : 0) + lists.length;
  const answered = (reddit ? 1 : 0) + lists.filter(Boolean).length;
  const note = !xConfigured() && handles.length + searches.length > 0 ? "X needs RSSHub; Reddit only for now." : null;
  return answer(posts, asked, answered, note);
}

// ---- IPO chatter ----------------------------------------------------------------
//
// Where Indian retail investors talk about issues (IPO_SUBREDDITS, or the
// reader's own list): one feed for all of them, kept a week. The reader's X
// accounts count too, when a post names the issue.

// Words too common to identify a company on their own.
const COMMON = new Set(["india", "indian", "bharat", "national", "global", "international", "new", "shree", "shri", "sri", "the", "first", "united", "bombay", "delhi", "mumbai", "smart", "super", "star", "royal", "classic", "modern", "prime", "premier", "capital", "finance", "industries", "industrial", "engineering", "infra", "power", "energy", "tech", "technologies", "solutions", "services", "systems", "products", "enterprises"]);
const IPO_WORDS = /\b(ipo|gmp|allot(ment|ted)?|listing|list(s|ed)? at|subscri(be|bed|ption)|apply|applied|anchor|rhp|drhp|price band|grey market)\b/i;

/** How a post would name the company: its first two words ("BLS Polymers"), and its first word alone when that is distinctive ("Vikran", not "Bombay"). */
function namePatterns(name: string): { core: string; phrase: RegExp; word: RegExp | null } {
  const words = name.replace(/\b(limited|ltd|pvt|private)\b\.?/gi, "").replace(/[^A-Za-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const core = words.slice(0, Math.min(2, words.length)).join(" ");
  const phrase = new RegExp(`\\b${esc(core)}\\b`, "i");
  const first = words[0] ?? "";
  const word = first.length >= 5 && !COMMON.has(first.toLowerCase()) ? new RegExp(`\\b${esc(first)}\\b`, "i") : null;
  return { core, phrase, word };
}

/**
 * What people are saying about one issue. Only posts that name it (its first
 * two words, or a distinctive first word next to an IPO word) count. Ranked by
 * how squarely they're about it — named in the title, an IPO word beside it,
 * an X post that matched the search — fading by half each day, so a fresh
 * allotment thread beats last week's RHP read.
 */
export async function ipoChatter(name: string, feed: Partial<FeedConfig> = {}, limit = 20): Promise<SocialAnswer> {
  const { core, phrase, word } = namePatterns(name);
  const subs = feed.subs ?? IPO_SUBREDDITS;
  const handles = feed.x ?? [];
  const [reddit, x, ...accounts] = await Promise.all([
    rolling(rollName("ipo", subs, IPO_SUBREDDITS), subs, 7),
    xConfigured() ? xSearch(`"${core}" IPO`) : Promise.resolve(null),
    ...(xConfigured() ? handles.map(xUser) : []),
  ]);
  type Scored = { post: SocialPost; score: number };
  const scored: Scored[] = [];
  for (const h of reddit ?? []) {
    const inTitle = phrase.test(h.title) || (!!word && word.test(h.title) && IPO_WORDS.test(h.title));
    const inText = phrase.test(h.text) || (!!word && word.test(h.text) && IPO_WORDS.test(h.text));
    if (!inTitle && !inText) continue;
    const s = (inTitle ? 2 : 1) + (IPO_WORDS.test(`${h.title} ${h.text}`) ? 1 : 0);
    scored.push({ post: fromReddit(h), score: s * decay(h.createdAt, 24) });
  }
  for (const p of [...(x ?? []), ...accounts.flatMap((l) => l ?? [])]) {
    if (!phrase.test(p.title) && !(word && word.test(p.title))) continue;
    scored.push({ post: p, score: (IPO_WORDS.test(p.title) ? 2.5 : 1.5) * decay(p.at, 24) });
  }
  const posts = topPerSource(scored, limit);
  const asked = (subs.length ? 1 : 0) + (xConfigured() ? 1 + accounts.length : 0);
  const answered = (reddit ? 1 : 0) + (x ? 1 : 0) + accounts.filter(Boolean).length;
  return answer(posts, asked, answered, xConfigured() ? null : "Reddit only — X needs RSSHub.");
}

// ---- Valorant: the transfer window ------------------------------------------------
//
// r/ValorantCompetitive (or the reader's subreddits) kept ten days, plus the
// X accounts and searches the reader follows for it. A post counts when its title reads like a move (signs, parts ways,
// benched, free agent, a rumour…), or its body says so plainly, and it isn't
// a match or discussion thread; one naming a team the reader follows ranks
// double. Fades by half every two days.

const MOVE = /\b(roster|transfer|sign(s|ed|ing)?|join(s|ed|ing)?|part(s|ed|ing)? ways|leav(e|es|ing)|bench(ed)?|inactive|free agents?|rumou?rs?|reportedly|sources|depart(s|ure)?|loan(ed)?|re-?sign(s|ed)?|extension|contract|trial(s|ing)?|stand-?in|head coach|announce[sd]?|welcome[sd]?|released?|retire[sd]?|retirement|step(s|ping)? down|lineup|line-up)\b/i;
/** Enough on its own in a post's body; anything else has to be in the title. */
const STRONG_MOVE = /\b(part(s|ed|ing)? ways|sign(s|ed|ing)|join(s|ed)|free agents?|transfer(s|red)?|rumou?rs?|reportedly|benched|released|departure)\b/i;
const MATCH_THREAD = /\b(vs\.?|post-match|match thread|discussion thread|megathread|pick'?em|predictions?|highlights?)\b/i;

export async function valorantMoves(teams: string[], feed: Partial<FeedConfig> = {}, limit = 20): Promise<SocialAnswer> {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const followed = teams.map((t) => ({ name: t, re: new RegExp(`\\b${esc(t)}\\b`, "i") }));
  const subs = feed.subs ?? VAL_SUBREDDITS;
  const handles = feed.x ?? VAL_DEFAULT_X;
  const searches = feed.searches ?? [];
  const [reddit, ...xs] = await Promise.all([
    rolling(rollName("valcomp", subs, VAL_SUBREDDITS), subs, 10),
    ...(xConfigured() ? [...handles.map(xUser), ...searches.map(xSearch)] : []),
  ]);
  type Scored = { post: SocialPost; score: number };
  const scored: Scored[] = [];
  const rank = (title: string, body: string, at: string, base: number, post: SocialPost) => {
    const all = `${title} ${body}`;
    if (!(MOVE.test(title) || STRONG_MOVE.test(body)) || MATCH_THREAD.test(title)) return;
    const hit = followed.filter((f) => f.re.test(all)).map((f) => f.name);
    scored.push({ post: { ...post, ...(hit.length ? { tags: hit } : {}) }, score: base * (hit.length ? 2 : 1) * decay(at, 48) });
  };
  for (const h of reddit ?? []) rank(h.title, h.text, h.createdAt, 1, fromReddit(h));
  // An account followed for this is already about it: it needs no move word to count, only not to be a match post.
  for (const list of xs) for (const p of list ?? []) {
    if (MATCH_THREAD.test(p.title)) continue;
    const hit = followed.filter((f) => f.re.test(p.title)).map((f) => f.name);
    scored.push({ post: { ...p, ...(hit.length ? { tags: hit } : {}) }, score: (MOVE.test(p.title) ? 1.5 : 0.6) * (hit.length ? 2 : 1) * decay(p.at, 48) });
  }
  const posts = topPerSource(scored, limit);
  const asked = (subs.length ? 1 : 0) + xs.length;
  const answered = (reddit ? 1 : 0) + xs.filter(Boolean).length;
  return answer(posts, asked, answered, xConfigured() || handles.length + searches.length === 0 ? null : "Reddit only — X needs RSSHub.");
}

// ---- F1: the paddock talking ------------------------------------------------------
//
// By default r/formula1 and r/F1Technical (the day's top posts, no race or
// discussion threads), and on X: F1 and the FIA, the reader's team, and three
// reporters who break paddock news; the reader can change all of it (Edit
// feeds). The last two days count; a post fades by half every 12 hours. A
// post naming the reader's drivers or team ranks double, and official
// accounts edge ahead of everything else at the same age.

export async function f1Chatter(driverCodes: string[], team: string, feed: Partial<FeedConfig> = {}, limit = 20): Promise<SocialAnswer> {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = driverCodes
    .map((c) => F1_DRIVERS.find((d) => d.nameAcronym.toLowerCase() === c.toLowerCase())?.lastName)
    .filter((n): n is string => Boolean(n));
  const teamWord = team.replace(/ (Racing|F1 Team)$/, "");
  const follows = [...names, ...(teamWord ? [teamWord] : [])].map((n) => ({ name: n, re: new RegExp(`\\b${esc(n)}\\b`, "i") }));
  const teamX = F1_TEAM_X[team];
  const handles = feed.x ?? [...F1_DEFAULT_X.slice(0, 2), ...(teamX ? [teamX] : []), ...F1_DEFAULT_X.slice(2)];
  const searches = feed.searches ?? [];
  const subs = feed.subs ?? F1_SUBREDDITS;
  const [reddit, ...xs] = await Promise.all([
    subs.length ? redditFeed(subs, "top") : Promise.resolve(null),
    ...(xConfigured() ? [...handles.map(xUser), ...searches.map(xSearch)] : []),
  ]);
  type Scored = { post: SocialPost; score: number };
  const scored: Scored[] = [];
  const tagged = (post: SocialPost, words: string) => {
    const hit = follows.filter((f) => f.re.test(words)).map((f) => f.name);
    return { post: hit.length ? { ...post, tags: hit } : post, boost: hit.length ? 2 : 1 };
  };
  for (const h of reddit ?? []) {
    if (ageH(h.createdAt) > 48) continue;
    const { post, boost } = tagged(fromReddit(h), `${h.title} ${h.text}`);
    // The feed's own order stands in for upvotes: the top of the day first.
    scored.push({ post, score: (1 - Math.min(h.rank, 80) / 160) * boost * decay(h.createdAt, 12) });
  }
  xs.forEach((list, i) => {
    const handle = handles[i] ?? "";
    const base = F1_OFFICIAL_X.some((h) => h.toLowerCase() === handle.toLowerCase()) ? 1.2 : handle === teamX ? 1.1 : 1;
    for (const p of list ?? []) {
      if (ageH(p.at) > 48) continue;
      const { post, boost } = tagged(p, p.title);
      scored.push({ post, score: base * boost * decay(p.at, 12) });
    }
  });
  const posts = topPerSource(scored, limit);
  const asked = (subs.length ? 1 : 0) + xs.length;
  const answered = (reddit ? 1 : 0) + xs.filter(Boolean).length;
  return answer(posts, asked, answered, xConfigured() ? null : "Reddit only — X needs RSSHub.");
}

// ---- trending on X and Reddit -------------------------------------------------------
//
// X: trends24.in's hourly copy of X's trending list (X's own trends need a paid
// API), for India and worldwide: the latest hour's list, each trend with how
// many of the last 24 hours it has been on it. Reddit: r/popular's hot list,
// for India and everywhere. Kept 10 minutes; a failed read keeps the last
// good copy for a day.

export interface XTrend {
  name: string;
  url: string;
  /** Posts about it, when trends24 has the count. */
  count: number | null;
  /** Hours of the last 24 it has been trending. */
  hours: number;
}

export interface SocialTrends {
  x: { india: XTrend[] | null; world: XTrend[] | null };
  reddit: { india: SocialPost[] | null; world: SocialPost[] | null };
  at: string;
  /** When the oldest list was read. */
  asOf?: string | null;
  /** A list has nothing yet and is waiting its turn: ask again shortly. */
  waiting?: boolean;
}

/**
 * getdaytrends.com, read when trends24 won't answer (it turns Vercel's servers
 * away): its current ranking, each trend's hours from the points on its
 * eight-hour chart (8 means at least that). Asked openly as the paper; its
 * robots.txt sets no restriction for this use.
 */
async function fromGetDayTrends(region: "india" | "world"): Promise<XTrend[]> {
  const res = await fetch(`https://getdaytrends.com/${region === "india" ? "india/" : ""}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; the-daily-index)" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
  const trends = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].flatMap((m) => {
    const raw = /<td class="main">\s*<a[^>]*>([^<]+)<\/a>/.exec(m[1])?.[1];
    if (!raw) return [];
    const lines = [...m[1].matchAll(/<polyline points="([^"]+)"\s*\/>/g)];
    const points = (lines.at(-1)?.[1] ?? "").trim().split(/\s+/).filter(Boolean).length;
    const name = decodeEntities(raw).trim();
    return [{ name, url: `https://x.com/search?q=${encodeURIComponent(name)}`, count: null, hours: Math.max(1, Math.min(8, points - 1)) }];
  });
  if (!trends.length) throw new Error("no trends in the page");
  return trends.slice(0, 30);
}

async function xTrends(region: "india" | "world"): Promise<XTrend[] | null> {
  const key = `social:x-trends:v1:${region}`;
  const store = getStore();
  const kept = await store.get<{ at: number; trends: XTrend[] }>(key).catch(() => null);
  if (kept && Date.now() - kept.at < (socialCtx()?.force ? 60_000 : FRESH_MS)) {
    noteCopy(kept.at);
    return kept.trends;
  }
  try {
    const res = await fetch(`https://trends24.in/${region === "india" ? "india/" : ""}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; the-daily-index)" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // One list per hour, the newest first.
    const lists = [...html.matchAll(/<ol class=["']?trend-card__list["']?>([\s\S]*?)<\/ol>/g)].map((m) =>
      [...m[1].matchAll(/<a href="([^"]+)"[^>]*class=["']?trend-link["']?[^>]*>([^<]+)<\/a>(?:<span class=["']?tweet-count["']? data-count="?(\d*)"?)?/g)].map((t) => ({
        href: t[1],
        name: decodeEntities(t[2]).trim(),
        count: t[3] ? Number(t[3]) : null,
      })),
    );
    if (!lists.length || !lists[0].length) throw new Error("no trends in the page");
    const seen = new Map<string, number>();
    for (const list of lists.slice(0, 24)) for (const name of new Set(list.map((t) => t.name.toLowerCase()))) seen.set(name, (seen.get(name) ?? 0) + 1);
    const trends: XTrend[] = lists[0].slice(0, 30).map((t) => ({
      name: t.name,
      url: `https://x.com/search?q=${encodeURIComponent(t.name)}`,
      count: t.count && Number.isFinite(t.count) ? t.count : null,
      hours: seen.get(t.name.toLowerCase()) ?? 1,
    }));
    await store.set(key, { at: Date.now(), trends }, { ttlSeconds: 86_400 }).catch(() => {});
    noteCopy(Date.now());
    return trends;
  } catch (err) {
    console.error(`[social] X trends (${region}) from trends24 failed:`, err instanceof Error ? err.message : err);
    try {
      const trends = await fromGetDayTrends(region);
      const at = Date.now();
      await store.set(key, { at, trends }, { ttlSeconds: 86_400 }).catch(() => {});
      noteCopy(at);
      return trends;
    } catch (err2) {
      console.error(`[social] X trends (${region}) from getdaytrends failed:`, err2 instanceof Error ? err2.message : err2);
    }
    if (kept) await store.set(key, { at: Date.now() - FRESH_MS + 2 * 60_000, trends: kept.trends }, { ttlSeconds: 86_400 }).catch(() => {});
    noteCopy(kept?.at);
    return kept?.trends ?? null;
  }
}

export async function socialTrends(): Promise<SocialTrends> {
  // Reddit's RSS turns a burst away (429), so its two lists are read one after the other.
  const reddit = popularFeed("IN").then(async (india) => [india, await popularFeed("GLOBAL")] as const);
  const [xIndia, xWorld, [rIndia, rWorld]] = await Promise.all([xTrends("india"), xTrends("world"), reddit]);
  const posts = (hits: RedditHit[] | null) => (hits ? hits.slice(0, 30).map((h) => fromReddit(h)) : null);
  const ctx = socialCtx();
  const oldest = ctx?.copies.length ? Math.min(...ctx.copies) : null;
  return {
    x: { india: xIndia, world: xWorld },
    reddit: { india: posts(rIndia), world: posts(rWorld) },
    at: new Date().toISOString(),
    asOf: oldest ? new Date(oldest).toISOString() : null,
    waiting: !!ctx?.waiting,
  };
}

/**
 * Keeps the feeds ready (the scheduled job, .github/workflows/feeds-warm.yml):
 * touches RSSHub every 10 minutes so its free Render service, which sleeps
 * after 15 idle minutes, never does; and every 30 tops up the rolling Reddit
 * archives too (`reddit`), so a quiet night leaves no gap.
 */
export async function warmSocial(reddit = true): Promise<{ ipo: number | null; valorant: number | null; rsshub: boolean | null }> {
  const base = process.env.RSSHUB_URL?.trim().replace(/\/+$/, "");
  const access = process.env.RSSHUB_ACCESS_KEY?.trim();
  const [ipo, val, hub] = await Promise.all([
    reddit ? rolling("ipo", IPO_SUBREDDITS, 7) : Promise.resolve(undefined),
    reddit ? rolling("valcomp", VAL_SUBREDDITS, 10) : Promise.resolve(undefined),
    // A cold start takes most of a minute; the request alone wakes it.
    base ? fetch(`${base}/healthz${access ? `?key=${encodeURIComponent(access)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) }).then((r) => r.ok, () => false) : Promise.resolve(null),
  ]);
  return { ipo: ipo === undefined ? null : (ipo?.length ?? 0), valorant: val === undefined ? null : (val?.length ?? 0), rsshub: hub };
}
