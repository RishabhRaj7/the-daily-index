import type { ValMatch } from "@/lib/types";

// An event's shape, worked out from Riot's schedule (which lists matches
// with a stage name only — "Groups", "Swiss", "Playoffs", "Finals" — never
// a bracket position):
//
//   Groups  four-team double-elimination groups (Champions, EWC): the
//           teams that meet only each other, found as connected sets
//   Swiss   one table by record (Masters)
//   Bracket the playoffs on a known template, matched by count —
//           8-team double elimination (13 + the final: Champions, Masters),
//           4-team double elimination (5 + 1), 8-team single elimination
//           (6 + final and third place) — with each match placed by
//           following who advanced (a round's matches can be played in
//           any order on the day). Anything else falls back to rounds
//           by date.

export interface Slot {
  id: string;
  /** "Upper quarterfinal", "Grand final"… */
  label: string;
  match: ValMatch | null;
  /** Where the winner goes, drawn as a connector. */
  to?: string;
}

export interface BracketColumn {
  title: string;
  slots: Slot[];
}

export interface Bracket {
  kind: "double" | "single" | "rounds";
  upper: BracketColumn[];
  /** Lower bracket of a double elimination. */
  lower: BracketColumn[];
  /** Grand final (and third place in single elimination). */
  final: Slot[];
}

export interface GroupTable {
  name: string;
  rows: Array<{ code: string; name: string; image: string | null; w: number; l: number; maps: string; status: "through" | "out" | null }>;
  matches: ValMatch[];
}

const PLAYOFF = /playoff|bracket|knockout/i;
const FINAL = /final/i;
const GROUP = /group/i;
const SWISS = /swiss/i;

const winner = (m: ValMatch | null) => (m && m.state === "completed" ? m.teams.find((t) => t.outcome === "win")?.code : undefined);
const loser = (m: ValMatch | null) => (m && m.state === "completed" ? m.teams.find((t) => t.outcome === "loss")?.code : undefined);
const has = (m: ValMatch | null, code?: string) => !!m && !!code && m.teams.some((t) => t.code === code);

/** Put a pair of same-round matches in bracket order: the one that holds a team from `feeder` first. */
function order(pair: ValMatch[], first?: string[]): ValMatch[] {
  if (pair.length !== 2 || !first?.length) return pair;
  const [a, b] = pair;
  if (first.some((c) => has(b, c)) && !first.some((c) => has(a, c))) return [b, a];
  return pair;
}

function slot(id: string, label: string, match: ValMatch | null, to?: string): Slot {
  return { id, label, match, to };
}

/** 8-team double elimination: 13 playoff matches and the grand final. */
function double8(p: ValMatch[], finals: ValMatch[]): Bracket {
  let uqf = p.slice(0, 4);
  const lr1 = p.slice(4, 6);
  let usf = p.slice(6, 8);
  let lr2 = p.slice(8, 10);
  const [uf, lr3, lf] = [p[10] ?? null, p[11] ?? null, p[12] ?? null];
  // Upper quarterfinals in pairs that feed the same semifinal.
  if (usf.length === 2) {
    const feeds = (s: ValMatch) => uqf.filter((q) => has(s, winner(q)));
    const a = feeds(usf[0]);
    if (a.length === 2) uqf = [...a, ...uqf.filter((q) => !a.includes(q))];
    else if (a.length === 1) {
      // Only one known: keep its sibling by the remaining time order.
      const rest = uqf.filter((q) => q !== a[0]);
      const b = feeds(usf[1]);
      uqf = b.length ? [a[0], ...rest.filter((q) => !b.includes(q)), ...b] : [a[0], ...rest];
    }
  }
  usf = order(usf, uqf.slice(0, 2).map(winner).filter(Boolean) as string[]);
  // Lower round 2 under the lower round 1 match whose winner it holds.
  lr2 = order(lr2, [winner(lr1[0])].filter(Boolean) as string[]);
  const gf = finals[finals.length - 1] ?? null;
  return {
    kind: "double",
    upper: [
      { title: "Upper quarterfinals", slots: uqf.map((m, i) => slot(`uqf${i}`, "Upper quarterfinal", m, `usf${i >> 1}`)) },
      { title: "Upper semifinals", slots: usf.map((m, i) => slot(`usf${i}`, "Upper semifinal", m, "uf")) },
      { title: "Upper final", slots: [slot("uf", "Upper final", uf, "gf")] },
    ],
    lower: [
      { title: "Lower round 1", slots: lr1.map((m, i) => slot(`lr1${i}`, "Lower round 1", m, `lr2${i}`)) },
      { title: "Lower round 2", slots: lr2.map((m, i) => slot(`lr2${i}`, "Lower round 2", m, "lr3")) },
      { title: "Lower round 3", slots: [slot("lr3", "Lower round 3", lr3, "lf")] },
      { title: "Lower final", slots: [slot("lf", "Lower final", lf, "gf")] },
    ],
    final: [slot("gf", "Grand final", gf)],
  };
}

/** 4-team double elimination: two semifinals, upper final, lower rounds, grand final. */
function double4(p: ValMatch[], finals: ValMatch[]): Bracket {
  const usf = p.slice(0, 2);
  // The upper final holds both semifinal winners; the lower round both losers.
  let [uf, lr1] = [p[2] ?? null, p[3] ?? null];
  if (uf && lr1 && (has(uf, loser(usf[0])) || has(lr1, winner(usf[0])))) [uf, lr1] = [lr1, uf];
  const lf = p[4] ?? null;
  return {
    kind: "double",
    upper: [
      { title: "Upper semifinals", slots: usf.map((m, i) => slot(`usf${i}`, "Upper semifinal", m, "uf")) },
      { title: "Upper final", slots: [slot("uf", "Upper final", uf, "gf")] },
    ],
    lower: [
      { title: "Lower round 1", slots: [slot("lr1", "Lower round 1", lr1, "lf")] },
      { title: "Lower final", slots: [slot("lf", "Lower final", lf, "gf")] },
    ],
    final: [slot("gf", "Grand final", finals[finals.length - 1] ?? null)],
  };
}

/** 8-team single elimination: quarterfinals, semifinals, final (and third place). */
function single8(p: ValMatch[], finals: ValMatch[]): Bracket {
  let qf = p.slice(0, 4);
  let sf = p.slice(4, 6);
  if (sf.length === 2) {
    const a = qf.filter((q) => has(sf[0], winner(q)));
    if (a.length === 2) qf = [...a, ...qf.filter((q) => !a.includes(q))];
    sf = order(sf, qf.slice(0, 2).map(winner).filter(Boolean) as string[]);
  }
  // The final holds the semifinal winners; the other finals-day match is third place.
  const sfWinners = sf.map(winner).filter(Boolean) as string[];
  const final = finals.find((m) => sfWinners.some((c) => has(m, c))) ?? finals[finals.length - 1] ?? null;
  const third = finals.find((m) => m !== final) ?? null;
  return {
    kind: "single",
    upper: [
      { title: "Quarterfinals", slots: qf.map((m, i) => slot(`qf${i}`, "Quarterfinal", m, `sf${i >> 1}`)) },
      { title: "Semifinals", slots: sf.map((m, i) => slot(`sf${i}`, "Semifinal", m, "gf")) },
    ],
    lower: [],
    final: [slot("gf", "Final", final), ...(third ? [slot("third", "Third place", third)] : [])],
  };
}

/** Anything else: one column a day. */
function rounds(p: ValMatch[], finals: ValMatch[]): Bracket {
  const days = new Map<string, ValMatch[]>();
  for (const m of p) {
    const d = new Date(m.start).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
    days.set(d, [...(days.get(d) ?? []), m]);
  }
  return {
    kind: "rounds",
    upper: [...days].map(([d, list], c) => ({ title: d, slots: list.map((m, i) => slot(`d${c}-${i}`, d, m)) })),
    lower: [],
    final: finals.map((m, i) => slot(`f${i}`, "Final", m)),
  };
}

export function playoffs(matches: ValMatch[]): Bracket | null {
  const sorted = [...matches].sort((a, b) => a.start.localeCompare(b.start));
  const p = sorted.filter((m) => PLAYOFF.test(m.stage));
  const finals = sorted.filter((m) => FINAL.test(m.stage) && !PLAYOFF.test(m.stage));
  if (p.length === 0 && finals.length === 0) return null;
  if (p.length === 13 && finals.length <= 1) return double8(p, finals);
  if (p.length === 5 && finals.length <= 1) return double4(p, finals);
  if (p.length === 6 && finals.length >= 1 && finals.length <= 2) return single8(p, finals);
  return rounds(p, finals);
}

/** Groups (connected sets of four) or a Swiss table, from the stage before the playoffs. */
export function groupStage(matches: ValMatch[]): { kind: "groups" | "swiss"; tables: GroupTable[] } | null {
  const stage = matches.filter((m) => GROUP.test(m.stage) || SWISS.test(m.stage));
  if (stage.length === 0) return null;
  const swiss = stage.some((m) => SWISS.test(m.stage));

  // Teams joined by having played (or being due to play) each other.
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const m of stage) for (const t of m.teams) if (t.code !== "TBD" && !parent.has(t.code)) parent.set(t.code, t.code);
  if (!swiss) {
    for (const m of stage) {
      const [a, b] = m.teams.map((t) => t.code);
      if (a !== "TBD" && b !== "TBD") parent.set(find(a), find(b));
    }
  }
  const sets = new Map<string, string[]>();
  for (const code of parent.keys()) {
    const root = swiss ? "all" : find(code);
    sets.set(root, [...(sets.get(root) ?? []), code]);
  }

  const table = (codes: string[], name: string): GroupTable => {
    const mine = stage.filter((m) => m.teams.some((t) => codes.includes(t.code)));
    const rows = codes.map((code) => {
      const played = mine.filter((m) => m.state === "completed" && has(m, code));
      const w = played.filter((m) => winner(m) === code).length;
      const l = played.length - w;
      const mapsFor = played.reduce((s, m) => s + (m.teams.find((t) => t.code === code)?.wins ?? 0), 0);
      const mapsAgainst = played.reduce((s, m) => s + (m.teams.find((t) => t.code !== code)?.wins ?? 0), 0);
      const t = mine.flatMap((m) => m.teams).find((x) => x.code === code)!;
      return {
        code,
        name: t.name,
        image: t.image,
        w,
        l,
        maps: `${mapsFor}–${mapsAgainst}`,
        status: (w >= 2 && !swiss) || (swiss && w >= 2) ? ("through" as const) : l >= 2 ? ("out" as const) : null,
      };
    });
    rows.sort((a, b) => b.w - a.w || a.l - b.l || a.name.localeCompare(b.name));
    return { name, rows, matches: mine.sort((a, b) => a.start.localeCompare(b.start)) };
  };

  const groups = [...sets.values()].filter((c) => c.length >= 2);
  // Groups named A, B, C… by when they first play.
  const first = (codes: string[]) => stage.filter((m) => m.teams.some((t) => codes.includes(t.code))).map((m) => m.start).sort()[0] ?? "";
  groups.sort((a, b) => first(a).localeCompare(first(b)));
  // One set bigger than a group of four is a Swiss-style stage, whatever Riot calls it.
  const asSwiss = swiss || (groups.length === 1 && groups[0].length > 4);
  // Group letters as the organisers give them (Polymarket's match titles
  // carry them: "… - VCT Champions Group C"), else by when each first plays.
  const given = groups.map((codes) => stage.find((m) => m.group && m.teams.some((t) => codes.includes(t.code)))?.group);
  const spare = "ABCDEFGH".split("").filter((l) => !given.includes(l));
  const letters = given.map((l) => l ?? spare.shift() ?? "?");
  return {
    kind: asSwiss ? "swiss" : "groups",
    tables: asSwiss
      ? [table(groups.flat(), "Swiss stage")]
      : groups.map((codes, i) => table(codes, `Group ${letters[i]}`)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
