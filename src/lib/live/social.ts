import { getStore } from "@/lib/server/store";
import { decodeEntities } from "./rss";
import { redditFeed, type RedditHit } from "./reddit";
import { isPolitical } from "./politics-filter";

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
}

const FRESH_MS = 10 * 60_000;
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

/** One RSSHub route as posts, kept 10 minutes (a failed read keeps the last good copy a day). */
async function rsshub(route: string, where: string): Promise<SocialPost[] | null> {
  const base = process.env.RSSHUB_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  const key = `social:x:v1:${route}`;
  const store = getStore();
  const kept = await store.get<{ at: number; posts: SocialPost[] }>(key).catch(() => null);
  if (kept && Date.now() - kept.at < FRESH_MS) return kept.posts;
  const access = process.env.RSSHUB_ACCESS_KEY?.trim();
  const url = `${base}${route}${route.includes("?") ? "&" : "?"}format=json${access ? `&key=${encodeURIComponent(access)}` : ""}`;
  try {
    // A sleeping host takes a while to wake; the kept copy covers the wait next time.
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const feed = (await res.json()) as JsonFeed;
    const posts: SocialPost[] = (feed.items ?? []).flatMap((it) => {
      const body = it.content_text ?? text(it.content_html ?? it.title ?? "");
      if (!it.url || !body) return [];
      const author = it.authors?.[0]?.name ?? null;
      return [{ id: `x-${it.id ?? it.url}`, source: "x" as const, where, author, title: body.slice(0, 280), text: "", url: it.url.replace("https://twitter.com/", "https://x.com/"), at: it.date_published ?? new Date().toISOString() }];
    });
    await store.set(key, { at: Date.now(), posts }, { ttlSeconds: 86_400 }).catch(() => {});
    return posts;
  } catch (err) {
    console.error(`[social] RSSHub ${route} failed:`, err);
    if (kept) await store.set(key, { at: Date.now() - FRESH_MS + 2 * 60_000, posts: kept.posts }, { ttlSeconds: 86_400 }).catch(() => {});
    return kept?.posts ?? null;
  }
}

/** An account's own posts: no replies, no reposts. */
const xUser = (handle: string) => rsshub(`/twitter/user/${handle}/excludeReplies=1&includeRts=0&count=20`, `@${handle}`);
/** X's search for a phrase. */
const xSearch = (q: string) => rsshub(`/twitter/keyword/${encodeURIComponent(q)}`, `“${q}”`);

// ---- Reddit, as a rolling archive -----------------------------------------------

/** The newest posts from these subreddits plus everything seen in the last `days`, newest first. */
async function rolling(name: string, subs: string[], days: number, cap = 800): Promise<RedditHit[] | null> {
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

function dedupe(posts: SocialPost[]): SocialPost[] {
  const seen = new Set<string>();
  return posts.filter((p) => {
    const k = p.url.replace(/[?#].*$/, "").toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
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

const answer = (posts: SocialPost[], asked: number, answered: number, note: string | null = null): SocialAnswer => ({
  posts,
  status: asked === 0 || answered === asked ? "live" : answered > 0 ? "partial" : "unavailable",
  note,
  at: new Date().toISOString(),
});

// ---- the Grapevine: the reader's X accounts and searches, and their subreddits --
//
// X: the last three days, newest first, one account at a time in turn so a
// prolific one can't fill the column, searches after the accounts.
// Reddit: the day's top posts across the reader's subreddits, each subreddit
// taking its turn. The two then alternate, X first, so "All" always shows
// both; up to `perSource` of each come back, so the reader's X / Reddit
// filter still has a full column to show.

export async function grapevineFeeds(handles: string[], searches: string[], subreddits: string[], perSource = 8): Promise<SocialAnswer> {
  const wantX = xConfigured() && handles.length + searches.length > 0;
  const [reddit, ...lists] = await Promise.all([
    subreddits.length ? redditFeed(subreddits, "top") : Promise.resolve(null),
    ...(wantX ? [...handles.map(xUser), ...searches.map(xSearch)] : []),
  ]);
  const recent = lists.map((l) => (l ?? []).filter((p) => ageH(p.at) <= 72 && !isPolitical(p.title)).sort((a, b) => b.at.localeCompare(a.at)));
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
// Where Indian retail investors talk about issues; checked to exist and to
// allow IPO discussion. One feed for all of them, kept a week.

export const IPO_SUBREDDITS = ["IndianStockMarket", "StockMarketIndia", "IndiaInvestments", "IndianStreetBets"];

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
export async function ipoChatter(name: string, limit = 10): Promise<SocialAnswer> {
  const { core, phrase, word } = namePatterns(name);
  const [reddit, x] = await Promise.all([rolling("ipo", IPO_SUBREDDITS, 7), xConfigured() ? xSearch(`"${core}" IPO`) : Promise.resolve(null)]);
  type Scored = { post: SocialPost; score: number };
  const scored: Scored[] = [];
  for (const h of reddit ?? []) {
    const inTitle = phrase.test(h.title) || (!!word && word.test(h.title) && IPO_WORDS.test(h.title));
    const inText = phrase.test(h.text) || (!!word && word.test(h.text) && IPO_WORDS.test(h.text));
    if (!inTitle && !inText) continue;
    const s = (inTitle ? 2 : 1) + (IPO_WORDS.test(`${h.title} ${h.text}`) ? 1 : 0);
    scored.push({ post: fromReddit(h), score: s * decay(h.createdAt, 24) });
  }
  for (const p of x ?? []) {
    if (!phrase.test(p.title) && !(word && word.test(p.title))) continue;
    scored.push({ post: p, score: (IPO_WORDS.test(p.title) ? 2.5 : 1.5) * decay(p.at, 24) });
  }
  const posts = topPerSource(scored, limit);
  const asked = 1 + (xConfigured() ? 1 : 0);
  const answered = (reddit ? 1 : 0) + (x ? 1 : 0);
  return answer(posts, asked, answered, xConfigured() ? null : "Reddit only — X needs RSSHub.");
}

// ---- Valorant: the transfer window ------------------------------------------------
//
// r/ValorantCompetitive kept ten days, plus the X accounts the reader follows
// for it. A post counts when its title reads like a move (signs, parts ways,
// benched, free agent, a rumour…), or its body says so plainly, and it isn't
// a match or discussion thread; one naming a team the reader follows ranks
// double. Fades by half every two days.

const MOVE = /\b(roster|transfer|sign(s|ed|ing)?|join(s|ed|ing)?|part(s|ed|ing)? ways|leav(e|es|ing)|bench(ed)?|inactive|free agents?|rumou?rs?|reportedly|sources|depart(s|ure)?|loan(ed)?|re-?sign(s|ed)?|extension|contract|trial(s|ing)?|stand-?in|head coach|announce[sd]?|welcome[sd]?|released?|retire[sd]?|retirement|step(s|ping)? down|lineup|line-up)\b/i;
/** Enough on its own in a post's body; anything else has to be in the title. */
const STRONG_MOVE = /\b(part(s|ed|ing)? ways|sign(s|ed|ing)|join(s|ed)|free agents?|transfer(s|red)?|rumou?rs?|reportedly|benched|released|departure)\b/i;
const MATCH_THREAD = /\b(vs\.?|post-match|match thread|discussion thread|megathread|pick'?em|predictions?|highlights?)\b/i;

export async function valorantMoves(teams: string[], handles: string[], limit = 10): Promise<SocialAnswer> {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const followed = teams.map((t) => ({ name: t, re: new RegExp(`\\b${esc(t)}\\b`, "i") }));
  const [reddit, ...xs] = await Promise.all([rolling("valcomp", ["ValorantCompetitive"], 10), ...(xConfigured() ? handles.map(xUser) : [])]);
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
  const asked = 1 + xs.length;
  const answered = (reddit ? 1 : 0) + xs.filter(Boolean).length;
  return answer(posts, asked, answered, xConfigured() || handles.length === 0 ? null : "Reddit only — X needs RSSHub.");
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
    reddit ? rolling("valcomp", ["ValorantCompetitive"], 10) : Promise.resolve(undefined),
    // A cold start takes most of a minute; the request alone wakes it.
    base ? fetch(`${base}/healthz${access ? `?key=${encodeURIComponent(access)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) }).then((r) => r.ok, () => false) : Promise.resolve(null),
  ]);
  return { ipo: ipo === undefined ? null : (ipo?.length ?? 0), valorant: val === undefined ? null : (val?.length ?? 0), rsshub: hub };
}
