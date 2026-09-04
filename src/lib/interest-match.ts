import type { ReaderInterests, WireBrief } from "./types";

// ---------------------------------------------------------------------------
// Interest matching — the reason preferences play a *major* role in the paper.
//
// The same ReaderInterests the server already reads from the cookie bridge
// are turned into matchers used to (a) float matching stories to the top of
// their section pools and (b) tag them with `personal` so the UI can print a
// "For you · <interest>" kicker explaining *why* they're prominent. The hero
// picker also boosts tagged stories. Nothing is filtered out — an unmatched
// story still prints, just lower down.
// ---------------------------------------------------------------------------

export interface InterestMatcher {
  label: string;      // display label, e.g. "Lando Norris"
  tokens: string[];   // matchable tokens (lowercased)
  weight: number;     // higher = more prominent
  pools?: string[];   // restrict to these pool labels; undefined = all pools
}

const SPORT_POOLS = ["F1", "Football", "Tennis"];

export function tokensFor(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length >= 3 &&
        !["the", "and", "for", "fc", "club", "team", "bank", "card"].includes(t),
    );
}

export function buildMatchers(interests: ReaderInterests): InterestMatcher[] {
  const out: InterestMatcher[] = [];
  const push = (label: string, weight: number, pools?: string[]) => {
    const clean = label.trim();
    if (!clean) return;
    const tokens = tokensFor(clean);
    if (tokens.length === 0) return;
    out.push({ label: clean, tokens, weight, pools });
  };
  interests.f1Drivers.forEach((d) => push(d, 7));
  push(interests.f1Team, 6, ["F1"]);
  push(interests.footballClub, 7, ["Football"]);
  push(interests.footballPlayer, 7, ["Football"]);
  push(interests.nationalTeam, 5, SPORT_POOLS);
  push(interests.tennisPlayer, 7, ["Tennis"]);
  interests.cards.forEach((c) => push(c, 7));
  push(interests.city, 5);
  interests.topics.forEach((t) => push(t, 6));
  return out;
}

/** Best matcher for a brief, or null. Matching is on the longest (most
 *  specific) token so "Lando Norris" keys on "norris", not "lando". */
export function matchBrief(
  brief: Pick<WireBrief, "title" | "summary">,
  matchers: InterestMatcher[],
  pool?: string,
): InterestMatcher | null {
  if (matchers.length === 0) return null;
  const text = `${brief.title} ${brief.summary ?? ""}`.toLowerCase();
  let best: InterestMatcher | null = null;
  for (const m of matchers) {
    if (pool && m.pools && !m.pools.includes(pool)) continue;
    const key = [...m.tokens].sort((a, b) => b.length - a.length)[0];
    if (!key) continue;
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(text) && (!best || m.weight > best.weight)) best = m;
  }
  return best;
}

/** Stable re-sort: matched briefs float first (by weight), everything else
 *  keeps its original relative order. */
export function rankBriefsByInterest<T extends Pick<WireBrief, "title" | "summary">>(
  briefs: T[],
  matchers: InterestMatcher[],
  pool?: string,
): T[] {
  if (matchers.length === 0) return briefs;
  return briefs
    .map((b, i) => ({ b, i, w: matchBrief(b, matchers, pool)?.weight ?? 0 }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((x) => x.b);
}
