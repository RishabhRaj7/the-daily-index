import type { EditorsPick, ReaderInterests, WireBrief } from "@/lib/types";

// ---------------------------------------------------------------------------
// Editor's Picks — "you should see this".
//
// Replaces the old hand-written "X trending" list, which was not live and
// could mislead the reader. Every pick here is a real WireBrief already
// fetched for another section this edition. Nothing is invented: we only
// choose, rank and (optionally, later) let an LLM rephrase a one-liner that
// is constrained to the article's own title + snippet.
// ---------------------------------------------------------------------------

export interface PickPool {
  label: string;      // "World", "Markets", "F1", "Football", "Tennis", "Tech", "Cards"
  briefs: WireBrief[];
}

// Words that suggest a story is unusual, surprising or delightful rather than
// merely important — the "smart friend forwards you this" quality.
const CURIOSITY_SIGNALS: Array<[RegExp, number]> = [
  [/\bfirst[- ]ever\b|\bfor the first time\b/i, 3],
  [/\brecord\b|\ball-time\b|\bunprecedented\b/i, 2],
  [/\boldest\b|\byoungest\b|\blargest\b|\bsmallest\b|\bfastest\b|\bslowest\b/i, 2],
  [/\bsecret\b|\bhidden\b|\bmystery\b|\bmysterious\b|\bbizarre\b|\bstrange\b|\bunusual\b|\bweird\b/i, 3],
  [/\bwhy\b|\bhow\b/i, 1],
  [/\?\s*$/, 1],
  [/\bstudy\b|\bscientists\b|\bresearchers\b|\bdiscover/i, 2],
  [/\bquietly\b|\bsurprise\b|\bsurprising\b|\bunexpected\b|\bshock/i, 2],
  [/\bban\b|\bbanned\b|\boutlaw/i, 1],
  [/\b\d{2,}(,\d{3})*\b/, 1],                          // a concrete number
  [/\bcrore\b|\blakh\b|\b₹|\brupee/i, 1],                // India-specific money detail
  [/\bcomeback\b|\bupset\b|\bstunn/i, 2],
  [/\bapolog|\bu-turn\b|\breverses\b|\bbackflip/i, 2],
  [/\bAI\b|\bchatbot\b|\brobot/i, 1],
];

// Dull-signal words: press-release cadence, markets boilerplate, live blogs.
const DULL_SIGNALS: Array<[RegExp, number]> = [
  [/\blive\b.*\bupdates?\b|\blive blog\b|\bas it happened\b/i, 4],
  [/\bsensex\b.*\bpoints\b|\bnifty\b.*\bpoints\b/i, 2],
  [/\bopinion\b|\beditorial\b|\bcolumn\b/i, 1],
  [/\bhoroscope\b|\bastrolog/i, 5],
  [/\bsponsored\b|\bpartner content\b/i, 5],
  [/\bstock(s)? to (buy|watch)\b|\bmultibagger/i, 4],
  [/\bupper circuit\b|\blower circuit\b|\bGMP\b|\bgrey market\b/i, 4],
  [/\bshares? (jump|surge|hit|rally|plunge|slip|tank)/i, 2],
  [/\bFP[123]\b|\bpractice report\b|\bqualifying report\b/i, 1],
];

function tokensFor(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !["the", "and", "for", "fc", "club", "team", "bank", "card"].includes(t));
}

interface InterestTerm {
  label: string;
  tokens: string[];
  weight: number;
  personal: boolean;   // a *named* favourite, not just an active sport
  pools?: string[];    // restrict matching to these pools (e.g. a national team only in sports feeds)
}

function buildInterestTerms(interests: ReaderInterests, sports: string[]): InterestTerm[] {
  const terms: InterestTerm[] = [];
  const SPORT_POOLS = ["F1", "Football", "Tennis"];
  const push = (label: string, weight: number, personal = true, pools?: string[]) => {
    const clean = label.trim();
    if (!clean) return;
    const tokens = tokensFor(clean);
    if (tokens.length === 0) return;
    terms.push({ label: clean, tokens, weight, personal, pools });
  };
  interests.f1Drivers.forEach((d) => push(d, 6));
  push(interests.f1Team, 5);
  push(interests.footballClub, 6);
  push(interests.footballPlayer, 6);
  push(interests.nationalTeam, 4, true, SPORT_POOLS);
  push(interests.tennisPlayer, 6);
  push(interests.card, 6);
  push(interests.city, 4);
  interests.topics.forEach((t) => push(t, 3));
  if (sports.includes("f1")) push("Formula 1", 1, false, SPORT_POOLS);
  if (sports.includes("tennis")) push("Grand Slam", 1, false, SPORT_POOLS);
  return terms;
}

function matchInterest(text: string, terms: InterestTerm[], pool: string): InterestTerm | null {
  const lower = text.toLowerCase();
  let best: InterestTerm | null = null;
  for (const term of terms) {
    if (term.pools && !term.pools.includes(pool)) continue;
    // Require the most specific token (longest) to appear; for two-word names
    // like "Lando Norris" the surname is the discriminating token.
    const key = [...term.tokens].sort((a, b) => b.length - a.length)[0];
    if (!key) continue;
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower) && (!best || term.weight > best.weight)) best = term;
  }
  return best;
}

function curiosityScore(text: string): number {
  let score = 0;
  for (const [re, w] of CURIOSITY_SIGNALS) if (re.test(text)) score += w;
  for (const [re, w] of DULL_SIGNALS) if (re.test(text)) score -= w;
  return score;
}

function recencyBonus(postedAgo: string): number {
  // WireBrief.postedAgo is a display string like "3h ago" / "yesterday".
  const m = /^(\d+)\s*h/i.exec(postedAgo);
  if (m) {
    const h = Number(m[1]);
    return h <= 3 ? 2 : h <= 8 ? 1 : 0;
  }
  if (/min/i.test(postedAgo) || /just/i.test(postedAgo)) return 2;
  return 0;
}

const POOL_WHY: Record<string, string[]> = {
  World: ["Buried on the world wire, but worth two minutes.", "Not front-page news. Should be."],
  Markets: ["A markets story with an actual plot.", "Numbers, but the interesting kind."],
  Tech: ["The tech story your group chat will find tomorrow.", "Filed under: didn't see that coming."],
  Cards: ["Small print that affects your wallet.", "Fine print, decoded."],
  F1: ["Paddock gossip with a source attached.", "Straight from the pit wall."],
  Football: ["From the touchline, not the transfer rumour mill.", "A football story with a twist."],
  Tennis: ["A baseline story, in both senses.", "From the courts."],
};

function whyFor(pool: string, matched: InterestTerm | null, curiosity: number): string {
  if (matched?.personal) return `Because you follow ${matched.label}.`;
  if (curiosity >= 5) return "Genuinely odd, genuinely real.";
  const options = POOL_WHY[pool] ?? ["Worth your time."];
  return options[curiosity % options.length];
}

export function buildEditorsPicks(
  pools: PickPool[],
  opts: {
    interests: ReaderInterests;
    sports: string[];
    excludeUrls: Set<string>;
    limit?: number;
  },
): EditorsPick[] {
  const limit = opts.limit ?? 5;
  const terms = buildInterestTerms(opts.interests, opts.sports);

  type Scored = { brief: WireBrief; pool: string; score: number; matched: InterestTerm | null; curiosity: number };
  const scored: Scored[] = [];
  const seenTitles = new Set<string>();

  for (const pool of pools) {
    pool.briefs.forEach((brief, idx) => {
      if (!brief.url || opts.excludeUrls.has(brief.url)) return;
      const key = brief.title.toLowerCase().replace(/\W+/g, " ").trim();
      if (seenTitles.has(key)) return;
      seenTitles.add(key);

      const text = `${brief.title} ${brief.summary ?? ""}`;
      const matched = matchInterest(text, terms, pool.label);
      const curiosity = curiosityScore(text);
      const score =
        (matched ? matched.weight + (matched.personal ? 4 : 0) : 0) +
        curiosity +
        recencyBonus(brief.postedAgo) +
        Math.max(0, 3 - idx * 0.5);      // feed position still carries some editorial judgement
      scored.push({ brief, pool: pool.label, score, matched, curiosity });
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Greedy selection with diversity: at most 2 per pool, at most 1 per domain,
  // and at least one non-personal "delight" pick so it never reads as a
  // pure interest filter.
  const picks: EditorsPick[] = [];
  const perPool = new Map<string, number>();
  const domains = new Set<string>();
  let personalCount = 0;

  const take = (s: Scored) => {
    picks.push({
      id: `pick-${picks.length}-${s.brief.id}`,
      title: s.brief.title,
      url: s.brief.url,
      domain: s.brief.domain,
      pool: s.pool,
      why: whyFor(s.pool, s.matched, s.curiosity),
      snippet: (s.brief.summary ?? "").slice(0, 400),
      personal: Boolean(s.matched?.personal),
      matchedInterest: s.matched?.personal ? s.matched.label : undefined,
      postedAgo: s.brief.postedAgo,
    });
    perPool.set(s.pool, (perPool.get(s.pool) ?? 0) + 1);
    domains.add(s.brief.domain);
    if (s.matched?.personal) personalCount++;
  };

  for (const s of scored) {
    if (picks.length >= limit) break;
    if ((perPool.get(s.pool) ?? 0) >= 2) continue;
    if (domains.has(s.brief.domain)) continue;
    // Reserve the last slot for a non-personal delight if we've only had personal ones.
    if (picks.length === limit - 1 && personalCount === picks.length && s.matched?.personal) continue;
    take(s);
  }
  // Second pass without the domain constraint if we're short.
  if (picks.length < limit) {
    for (const s of scored) {
      if (picks.length >= limit) break;
      if (picks.some((p) => p.url === s.brief.url)) continue;
      if ((perPool.get(s.pool) ?? 0) >= 2) continue;
      take(s);
    }
  }
  return picks;
}
