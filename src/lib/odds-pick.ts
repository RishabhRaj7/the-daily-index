import type { OddsMarket, OddsSubject, SectionKey } from "@/lib/types";

// What the paper prints from the prediction markets, for one reader.
// Pure, so it can run on the page with the reader's own follows (they live
// in the browser) against the shared list /api/odds returns.
//
// A market earns a place only if it is
//   1. about the reader: it names something they follow (or a rival), or it
//      sits in a subject they read;
//   2. backed by real money: $100k traded in all (lower floors where the
//      markets are small: F1, India, Valorant; $5k for a follow);
//   3. worth a look today: it names a follow, matches a story in today's
//      edition, moved 5+ points on a tight market, settles within a week,
//      or is among the day's busiest ($500k today).
// Then the page takes at most five for Straw Poll (two per subject, one
// for money, never two questions about the same thing) and one line per
// section, never the same market twice. A quiet day prints less; nothing is padded.

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
  subjects: Array<"money" | "world" | "india" | "tech">;
  /** Today's headlines, to tie a market to the news. */
  headlines: string[];
}

export interface OddsPick {
  market: OddsMarket;
  score: number;
  /** One short reason it's here: "You follow Verstappen", "▲ 9 pts today". */
  why: string;
  follow?: OddsFollow;
  headline?: string;
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
};

/** The section a subject's one line prints in. Valorant's odds live in Clutch. */
export const SUBJECT_SECTION: Partial<Record<OddsSubject, SectionKey>> = {
  f1: "paddock-notes",
  football: "sports",
  tennis: "sports",
  money: "ledger",
  tech: "circuit-board",
  india: "the-nation",
  world: "dateline",
};

const FLOOR: Partial<Record<OddsSubject, number>> = { f1: 20_000, india: 5_000, valorant: 5_000, tennis: 50_000 };
const DEFAULT_FLOOR = 100_000;
const FOLLOW_FLOOR = 5_000;
const BUSY_TODAY = 500_000;
const WEEK = 7 * 86_400_000;

const STOP = new Set(
  "will the and for with from that this what which who when where than more less over under after before into about their there have has had been being says said year years week today first last next new champion winner election".split(" "),
);
const words = (t: string) =>
  t
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
    if (f.subject !== m.subject && !(f.subject === "football" && m.subject === "world")) return false;
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
  const text = `${m.title} ${m.lead.name === "Yes" ? "" : m.lead.name}`;
  const mine = new Set(words(text).filter((w) => !GENERIC.has(w)));
  const myNames = names(text);
  if (myNames.size === 0) return undefined;
  return headlines.find((h) => {
    const shared = words(h).filter((w) => mine.has(w));
    return shared.length >= 2 && [...names(h)].some((n) => myNames.has(n));
  });
}

/** Two questions about the same thing ("Fed Decision in October?", "Fed decisions (Sep–Dec)"). */
function alike(a: OddsMarket, b: OddsMarket): boolean {
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
  return [...stems(b)].filter((w) => x.has(w)).length >= 2;
}

// Side questions that say little about what people think will happen.
const TRIVIA = /\b(\d(st|nd|rd|th) place|meet with|who will .* meet|visit|attend|how many|number of|most (kills|goals|points)|say|mention)\b/i;

const pts = (n: number) => `${n > 0 ? "▲" : "▼"} ${Math.abs(Math.round(n))} pts today`;
const isMatch = (m: OddsMarket) => /\bvs?\.?\s/i.test(m.title);
const rolling = (m: OddsMarket) => /\b(this week|week of|today|tonight)\b/i.test(m.title);

export function scoreOdds(markets: OddsMarket[], profile: OddsProfile, now = Date.now()): OddsPick[] {
  const sportOk = (s: OddsSubject) =>
    s === "f1" || s === "football" || s === "tennis" || s === "valorant" ? profile.sports.includes(s) : profile.subjects.includes(s as never);

  const picks: OddsPick[] = [];
  for (const m of markets) {
    const follow = followOf(m, profile.follows);
    if (!follow && !sportOk(m.subject)) continue;
    if (!follow && (isMatch(m) || rolling(m))) continue; // single matches and weekly charts: only for a follow
    if (!follow && TRIVIA.test(m.title)) continue;
    const floor = follow ? FOLLOW_FLOOR : (FLOOR[m.subject] ?? DEFAULT_FLOOR);
    if (Math.max(m.vol, m.vol24) < floor) continue;

    const headline = headlineOf(m, profile.headlines);
    // A move counts only where traders agree on the price (a tight spread).
    const move = m.lead.move != null && (m.spread == null || m.spread <= 4) && !m.ladder && m.vol24 >= 25_000 ? m.lead.move : 0;
    const closes = m.closes ? Date.parse(m.closes) : NaN;
    const soon = Number.isFinite(closes) && closes > now && closes - now < WEEK;
    const busy = m.vol24 >= BUSY_TODAY;
    const worth = !!follow || !!headline || Math.abs(move) >= 5 || soon || busy;
    if (!worth) continue;

    let score = Math.log10(Math.max(m.vol24, 1)) * 4 + Math.log10(Math.max(m.vol, 1)) * 2;
    if (follow) score += follow.rival ? 25 : 45;
    if (headline) score += 30;
    if (Math.abs(move) >= 4) score += Math.min(Math.abs(move), 25) * 2;
    if (m.lead.week != null && Math.abs(m.lead.week) >= 10) score += 6;
    if (soon) score += 10;
    // Money is wanted, but only now and then.
    if (m.subject === "money" && Math.abs(move) < 8 && !follow) score -= 12;

    const why = follow
      ? follow.rival
        ? `Your rival: ${follow.name}`
        : `You follow ${follow.name}`
      : headline
        ? "In today's news"
        : Math.abs(move) >= 5
          ? pts(move)
          : soon
            ? `Settles ${new Date(closes).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`
            : `$${compactMoney(m.vol24)} traded today`;
    picks.push({ market: m, score, why, follow, headline });
  }
  return picks.sort((a, b) => b.score - a.score);
}

export function compactMoney(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));
}

export interface OddsLayout {
  /** Straw Poll: a lead and up to four more. */
  poll: OddsPick[];
  /** One line at the foot of a section, when it has a market of its own. */
  lines: Partial<Record<SectionKey, OddsPick>>;
}

export function layoutOdds(picks: OddsPick[], hidden: SectionKey[] = []): OddsLayout {
  const poll: OddsPick[] = [];
  const per = new Map<OddsSubject, number>();
  for (const p of picks) {
    if (poll.length >= 5) break;
    const s = p.market.subject;
    if (s === "valorant") continue; // Clutch carries its own odds
    const n = per.get(s) ?? 0;
    if (n >= (s === "money" ? 1 : 2)) continue;
    if (poll.some((q) => alike(q.market, p.market))) continue;
    per.set(s, n + 1);
    poll.push(p);
  }
  // Each section's best market not already in Straw Poll — but only one that
  // clearly earns the space (a follow, today's news, or a real move).
  const used = new Set(poll.map((p) => p.market.id));
  const lines: OddsLayout["lines"] = {};
  for (const p of picks) {
    const key = SUBJECT_SECTION[p.market.subject];
    if (!key || lines[key] || used.has(p.market.id) || hidden.includes(key)) continue;
    if (poll.some((q) => alike(q.market, p.market))) continue;
    const strong = !!p.follow || !!p.headline || Math.abs(p.market.lead.move ?? 0) >= 8;
    if (!strong) continue;
    lines[key] = p;
    used.add(p.market.id);
  }
  return { poll, lines };
}
