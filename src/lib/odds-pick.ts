import type { OddsMarket, OddsSubject, SectionKey } from "@/lib/types";

// What the paper prints from the prediction markets, for one reader.
// Pure, so it can run on the page with the reader's own follows (they live
// in the browser) against the shared list /api/odds returns.
//
// A market earns a place only if it is
//   1. about the reader: on their watchlist or starred, names something
//      they follow (or a rival), or sits in a subject they read;
//   2. backed by real money: $100k traded in all (lower floors where the
//      markets are small: F1, India, Valorant; $5k for a follow or a watch);
//   3. worth a look: watched, followed, in today's news, moved on a tight
//      market, settling within a week, among the day's busiest, or one of
//      the big standing questions ($1M+ traded).
// Elections abroad need the money of a big one ($2M+) unless they're news.
// AI & tech and the world weigh most, then sport, then money and film.
//
// Where it prints:
//   Straw Poll      the day's action: the biggest mover as the lead, the
//                   next movers, and what's busiest
//   section strips  three or four standing questions at the foot of each
//                   section (World, Tech, F1, Sport, Money, Grapevine);
//                   the reader's watchlist first
//   under a story   one line when a market is about that story
// A market prints once on the page. Nothing is padded on a quiet day.

export interface OddsFollow {
  /** Name as the markets would print it ("Max Verstappen", "Real Madrid"). */
  name: string;
  subject: OddsSubject;
  rival?: boolean;
}

export interface OddsProfile {
  follows: OddsFollow[];
  /** Sports the reader follows: markets in others never print. */
  sports: Array<"f1" | "football" | "tennis" | "valorant">;
  /** Non-sport subjects the reader reads. */
  subjects: Array<"money" | "world" | "india" | "tech" | "culture">;
  /** Today's headlines, to tie a market to the news. */
  headlines: string[];
  /** Markets on the reader's watchlist or starred, by id. */
  watched?: Set<string>;
}

export interface OddsPick {
  market: OddsMarket;
  score: number;
  /** One short reason it's here: "On your watchlist", "▲ 9 pts today". */
  why: string;
  follow?: OddsFollow;
  headline?: string;
  watched?: boolean;
  /** The day's move that counted: 0 on a loose market, a date ladder or a quiet day's trade. */
  move: number;
}

export const SUBJECT_LABEL: Record<OddsSubject, string> = {
  f1: "F1",
  football: "Football",
  tennis: "Tennis",
  valorant: "Valorant",
  money: "Money",
  tech: "AI & tech",
  india: "India",
  world: "World",
  culture: "Film",
};

/** The section a subject's odds print in. Valorant's live in Clutch; India's only in Straw Poll. */
export const SUBJECT_SECTION: Partial<Record<OddsSubject, SectionKey>> = {
  f1: "paddock-notes",
  football: "sports",
  tennis: "sports",
  money: "ledger",
  tech: "circuit-board",
  world: "dateline",
  culture: "grapevine",
};

/** How many a section's strip holds: more where the reader's interest is. */
export const SECTION_QUOTA: Partial<Record<SectionKey, number>> = {
  "circuit-board": 4,
  dateline: 4,
  "paddock-notes": 3,
  sports: 3,
  ledger: 3,
  grapevine: 3,
};

/** The reader's order of interest: tech and the world, then sport, then money and film. */
const WEIGHT: Record<OddsSubject, number> = {
  tech: 1.3,
  world: 1.2,
  f1: 1.05,
  valorant: 1,
  football: 1,
  tennis: 1,
  money: 0.85,
  culture: 0.85,
  india: 0.75,
};

const FLOOR: Partial<Record<OddsSubject, number>> = { f1: 20_000, india: 5_000, valorant: 5_000, tennis: 50_000 };
const DEFAULT_FLOOR = 100_000;
const FOLLOW_FLOOR = 5_000;
const BUSY_TODAY = 500_000;
const STANDING = 1_000_000;
const BIG_ELECTION = 2_000_000;
const WEEK = 7 * 86_400_000;

const STOP = new Set(
  "will the and for with from that this what which who when where than more less over under after before into about their there have has had been being says said year years week today first last next new champion winner election".split(" "),
);
const words = (t: string) =>
  t
    // Headlines say "GP", markets "Grand Prix".
    .replace(/\bGP\b/g, "Grand Prix")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function followOf(m: OddsMarket, follows: OddsFollow[]): OddsFollow | undefined {
  const text = ` ${m.title} ${m.outcomes.map((o) => o.name).join(" ")} `.toLowerCase();
  return follows.find((f) => {
    // A national side reaches into world markets only for football ones (a World Cup), not its country's election.
    const footballAbroad = f.subject === "football" && m.subject === "world" && /\b(world cup|fifa|copa|euro 20|nations league|qualif)/i.test(m.title);
    if (f.subject !== m.subject && !footballAbroad) return false;
    const name = f.name.toLowerCase().trim();
    if (name.length < 3) return false;
    // A full name, or a driver's / player's surname on its own.
    const parts = name.split(/\s+/);
    const tries = parts.length > 1 && f.subject !== "football" && f.subject !== "valorant" ? [name, parts[parts.length - 1]] : [name];
    return tries.some((t) => t.length >= 3 && new RegExp(`\\b${escape(t)}\\b`, "i").test(text));
  });
}

// Words too common in both headlines and market titles to tie them.
const GENERIC = new Set(
  "prime minister president presidential government party parliament election elections vote votes poll polls leader leaders decision decisions rate rates bank central federal reserve market markets price prices stock stocks deal talks war trade world india indian china chinese america american united states people minister's".split(" "),
);
/** Capitalised words that aren't generic: the names a story is about. */
const names = (t: string) =>
  new Set(
    (t.match(/\b[A-Z][A-Za-z'’.-]{2,}\b/g) ?? [])
      .map((w) => w.toLowerCase().replace(/['’.]s?$/, ""))
      .filter((w) => w.length >= 3 && !GENERIC.has(w) && !STOP.has(w)),
  );

/** A headline about the same thing: at least one name in common and one
 *  more word ("Antonelli" + "championship"), generic words not counting. */
function headlineOf(m: OddsMarket, headlines: string[]): string | undefined {
  const text = `${m.title} ${m.lead.name === "Yes" || m.hit ? "" : m.lead.name}`;
  const mine = new Set(words(text).filter((w) => !GENERIC.has(w)));
  const myNames = names(text);
  if (myNames.size === 0) return undefined;
  return headlines.find((h) => {
    const shared = words(h).filter((w) => mine.has(w));
    return shared.length >= 2 && [...names(h)].some((n) => myNames.has(n));
  });
}

/** Two questions about the same thing ("Fed Decision in October?", "Fed decisions (Sep–Dec)"). */
export function alike(a: OddsMarket, b: OddsMarket): boolean {
  const stems = (m: OddsMarket) =>
    new Set(
      m.title
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w))
        .map((w) => w.slice(0, 5)),
    );
  const x = stems(a);
  const y = stems(b);
  // Two shared words, or all of a short title's: "F1 Drivers' Champion" has
  // only "drivers" once the common words go, and is still the same question
  // as Kalshi's "F1 Drivers Champion (2026)" (the constructors' title isn't).
  const need = Math.min(2, x.size, y.size);
  return need > 0 && [...y].filter((w) => x.has(w)).length >= need;
}

// Side questions that say little about what people think will happen.
const TRIVIA = /\b(\d(st|nd|rd|th) place|meet with|who will .* meet|visit|attend|how many|number of|most (kills|goals|points)|say|mention)\b/i;
const ELECTION = /\b(election|elections|president|presidential|prime minister|parliament|chancellor|mayor|seats)\b/i;
const US_NATIONAL = /\b(us|u\.s\.|united states|senate|house|congress|trump|2028)\b/i;

const pts = (n: number) => `${n > 0 ? "▲" : "▼"} ${Math.abs(Math.round(n))} pts today`;
const isMatch = (m: OddsMarket) => /\bvs?\.?\s/i.test(m.title);
const rolling = (m: OddsMarket) => /\b(this week|week of|today|tonight)\b/i.test(m.title);

export function scoreOdds(markets: OddsMarket[], profile: OddsProfile, now = Date.now()): OddsPick[] {
  const sportOk = (s: OddsSubject) =>
    s === "f1" || s === "football" || s === "tennis" || s === "valorant" ? profile.sports.includes(s) : profile.subjects.includes(s as never);
  const watchedIds = profile.watched ?? new Set<string>();

  const picks: OddsPick[] = [];
  for (const m of markets) {
    const watched = watchedIds.has(m.id);
    const follow = followOf(m, profile.follows);
    if (!watched && !follow && !sportOk(m.subject)) continue;
    if (!watched && !follow && (isMatch(m) || rolling(m))) continue; // single matches and weekly charts: only for a follow
    if (!watched && !follow && TRIVIA.test(m.title)) continue;
    const floor = watched || follow ? FOLLOW_FLOOR : (FLOOR[m.subject] ?? DEFAULT_FLOOR);
    if (Math.max(m.vol, m.vol24) < floor) continue;

    const headline = headlineOf(m, profile.headlines);
    // An election abroad earns a place by its size or by being news.
    if (!watched && !follow && !headline && m.subject === "world" && ELECTION.test(m.title) && !US_NATIONAL.test(m.title) && m.vol < BIG_ELECTION) continue;
    // A move counts only where traders agree on the price (a tight spread).
    const move = m.lead.move != null && (m.spread == null || m.spread <= 4) && !m.ladder && !m.hit && m.vol24 >= 25_000 ? m.lead.move : 0;
    const closes = m.closes ? Date.parse(m.closes) : NaN;
    const soon = Number.isFinite(closes) && closes > now && closes - now < WEEK;
    const busy = m.vol24 >= BUSY_TODAY;
    const standing = m.vol >= STANDING && !rolling(m);
    const worth = watched || !!follow || !!headline || Math.abs(move) >= 5 || soon || busy || standing;
    if (!worth) continue;

    let score = Math.log10(Math.max(m.vol24, 1)) * 4 + Math.log10(Math.max(m.vol, 1)) * 2;
    if (watched) score += 60;
    if (follow) score += follow.rival ? 25 : 45;
    if (headline) score += 30;
    if (Math.abs(move) >= 4) score += Math.min(Math.abs(move), 25) * 2;
    if (m.lead.week != null && Math.abs(m.lead.week) >= 10) score += 6;
    if (soon) score += 10;
    score *= WEIGHT[m.subject];

    const why = watched
      ? "On your watchlist"
      : follow
        ? follow.rival
          ? `Your rival: ${follow.name}`
          : `You follow ${follow.name}`
        : headline
          ? "In today's news"
          : Math.abs(move) >= 5
            ? pts(move)
            : soon
              ? `Settles ${new Date(closes).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`
              : busy
                ? `$${compactMoney(m.vol24)} traded today`
                : `$${compactMoney(m.vol)} riding on it`;
    picks.push({ market: m, score, why, follow, headline, watched, move });
  }
  return picks.sort((a, b) => b.score - a.score);
}

export function compactMoney(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));
}

export interface OddsLayout {
  /** Straw Poll: the day's biggest mover, the next movers, and the busiest. */
  poll: { lead: OddsPick | null; movers: OddsPick[]; busiest: OddsPick[] };
  /** Three or four standing questions at the foot of each section. */
  sections: Partial<Record<SectionKey, OddsPick[]>>;
}

/**
 * Markets tied to a story in today's edition, keyed by that headline: they
 * print under the story itself ("Markets: 64% …"). Three at most, the
 * strongest first, one per story.
 */
export function storyOdds(picks: OddsPick[], limit = 3): Map<string, OddsPick> {
  const out = new Map<string, OddsPick>();
  for (const p of picks) {
    if (out.size >= limit) break;
    if (!p.headline || out.has(p.headline) || p.market.subject === "valorant") continue;
    out.set(p.headline, p);
  }
  return out;
}

export function layoutOdds(picks: OddsPick[], hidden: SectionKey[] = [], underStories: Set<string> = new Set()): OddsLayout {
  const used = new Set<string>(underStories);
  const placed: OddsMarket[] = [];
  const free = (p: OddsPick) => !used.has(p.market.id) && !placed.some((m) => alike(m, p.market));
  const take = (p: OddsPick) => {
    used.add(p.market.id);
    placed.push(p.market);
    return p;
  };
  const eligible = picks.filter((p) => p.market.subject !== "valorant"); // Clutch carries its own

  // Sections first, so each keeps its standing questions (watchlist first).
  const sections: OddsLayout["sections"] = {};
  for (const [key, quota] of Object.entries(SECTION_QUOTA) as Array<[SectionKey, number]>) {
    if (hidden.includes(key)) continue;
    const mine = eligible
      .filter((p) => SUBJECT_SECTION[p.market.subject] === key)
      .sort((a, b) => Number(!!b.watched) - Number(!!a.watched) || b.score - a.score);
    const list: OddsPick[] = [];
    for (const p of mine) {
      if (list.length >= quota) break;
      if (!free(p)) continue;
      list.push(take(p));
    }
    if (list.length) sections[key] = list;
  }

  // Straw Poll: the day's action among what's left, from any subject.
  const moving = eligible
    .filter((p) => Math.abs(p.move) >= 4)
    .sort((a, b) => Math.abs(b.move) * WEIGHT[b.market.subject] - Math.abs(a.move) * WEIGHT[a.market.subject]);
  // No big move today: the week's biggest swing on a tight market, so the
  // lead chart has a story to tell; failing that, the strongest question.
  const weekly = eligible
    .filter((p) => !p.market.ladder && !p.market.hit && Math.abs(p.market.lead.week ?? 0) >= 6 && (p.market.spread == null || p.market.spread <= 4) && p.market.vol24 >= 25_000)
    .sort((a, b) => Math.abs(b.market.lead.week ?? 0) * WEIGHT[b.market.subject] - Math.abs(a.market.lead.week ?? 0) * WEIGHT[a.market.subject]);
  const lead = moving.find(free) ?? weekly.find(free) ?? eligible.find(free) ?? null;
  if (lead) take(lead);
  const movers: OddsPick[] = [];
  for (const p of moving) {
    if (movers.length >= 4) break;
    if (free(p)) movers.push(take(p));
  }
  // Where the money is: one per subject and one election at most, so four
  // presidential races can't fill the row.
  const busiest: OddsPick[] = [];
  for (const p of [...eligible].sort((a, b) => b.market.vol24 * WEIGHT[b.market.subject] - a.market.vol24 * WEIGHT[a.market.subject])) {
    if (busiest.length >= 4) break;
    if (p.market.vol24 < 50_000 || !free(p)) continue;
    if (busiest.some((q) => q.market.subject === p.market.subject && !(p.market.subject === "world" && !ELECTION.test(p.market.title) && ELECTION.test(q.market.title)))) continue;
    busiest.push(take(p));
  }
  return { poll: { lead, movers, busiest }, sections };
}

/**
 * The market on the next policy decision, for Market Pulse's rates row:
 * the Fed's meeting or the RBI's, due within a few days of the date given.
 */
export function policyMarket(markets: OddsMarket[], bank: "fed" | "rbi", decision: string | null): OddsMarket | undefined {
  if (!decision) return undefined;
  const due = Date.parse(`${decision}T12:00:00Z`);
  const re = bank === "fed" ? /\b(fed|fomc|federal reserve)\b.*\b(decision|rates?)\b/i : /\b(rbi|reserve bank of india)\b.*\b(decision|rates?|repo)\b/i;
  // One meeting's decision, not a year's path ("Fed decisions (Sep–Dec)",
  // "How many cuts in 2026?").
  const path = /\b(decisions|sep-dec|how many|by end of)\b/i;
  return markets
    .filter((m) => re.test(m.title) && !path.test(m.title))
    .filter((m) => !m.closes || Math.abs(Date.parse(m.closes) - due) < 5 * 86_400_000)
    .sort((a, b) => b.vol24 - a.vol24)[0];
}

/** A price ladder's level in dollars: "↑ $150k" → 150000. */
export function ladderLevel(name: string): number {
  const n = Number(name.replace(/[^\d.]/g, ""));
  return n * (/T$/.test(name) ? 1e12 : /B$/.test(name) ? 1e9 : /M$/.test(name) ? 1e6 : /k$/i.test(name) ? 1e3 : 1);
}

/**
 * A price ladder read as one line: the highest level up traders give even
 * odds or better, and the likeliest fall ("62% it reaches $130k · 24% it
 * falls to $80k").
 */
export function ladderLine(m: OddsMarket): string | null {
  if (!m.hit) return null;
  const ups = m.outcomes.filter((o) => o.name.startsWith("↑")).map((o) => ({ ...o, v: ladderLevel(o.name) })).sort((a, b) => a.v - b.v);
  const downs = m.outcomes.filter((o) => o.name.startsWith("↓")).map((o) => ({ ...o, v: ladderLevel(o.name) })).sort((a, b) => b.v - a.v);
  const fmt = (v: number) =>
    `$${v >= 1e12 ? `${+(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${+(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : v}`;
  const up = [...ups].reverse().find((o) => o.prob >= 50) ?? ups[0];
  const down = downs.find((o) => o.prob >= 15) ?? downs[0];
  const parts = [];
  if (up) parts.push(`${Math.round(up.prob)}% it reaches ${fmt(up.v)}`);
  if (down) parts.push(`${Math.round(down.prob)}% it falls to ${fmt(down.v)}`);
  return parts.length ? parts.join(" · ") : null;
}
