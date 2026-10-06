import type { SectionKey } from "./types";

// The ultrawide "spread": sections sit two to a row, like facing pages of a
// broadsheet. Each has partners in order of preference, so a row reads as
// one subject: the world beside the country, F1 beside football (or
// Valorant when football is off the page), money beside the markets,
// Valorant beside the odds, the city beside its weather, tech beside the
// culture pages. The reader's own order decides which row comes first.
//
// A section left over at the end goes under the shorter side of the most
// lopsided row (by each section's usual height), so a tall F1 page has
// Valorant and the odds stacked beside it instead of a hole; failing that it
// keeps one column's width, centred.

const PREFERS: Record<SectionKey, SectionKey[]> = {
  dateline: ["the-nation", "two-cities"],
  "the-nation": ["dateline", "two-cities"],
  "two-cities": ["sky-report", "the-nation"],
  "sky-report": ["two-cities"],
  "paddock-notes": ["sports", "clutch"],
  sports: ["paddock-notes", "clutch"],
  clutch: ["straw-poll", "paddock-notes", "sports"],
  "straw-poll": ["clutch", "market-pulse", "ledger", "grapevine"],
  ledger: ["market-pulse", "straw-poll"],
  "market-pulse": ["ledger", "straw-poll"],
  "circuit-board": ["grapevine", "straw-poll"],
  grapevine: ["circuit-board", "straw-poll"],
};

// Usual printed height, in thousands of pixels at the spread's column width.
const HEIGHT: Record<SectionKey, number> = {
  dateline: 1.5,
  "the-nation": 1.9,
  "two-cities": 1.3,
  "sky-report": 1.7,
  "paddock-notes": 3.1,
  sports: 2,
  clutch: 0.7,
  "straw-poll": 1.3,
  ledger: 2.1,
  "market-pulse": 2.7,
  "circuit-board": 2,
  grapevine: 2.3,
};

/** One row of the spread: a column of sections on each side, or one alone. */
export type SpreadRow = { left: SectionKey[]; right: SectionKey[] } | { solo: SectionKey };

export function spreadRows(order: SectionKey[]): SpreadRow[] {
  const left = [...order];
  const pairs: SectionKey[][] = [];
  while (left.length > 0) {
    const a = left.shift()!;
    const prefs = (PREFERS[a] ?? []).filter((k) => left.includes(k));
    // A partner whose own first choice is this section, or is off the page;
    // failing that, any partner it likes (that one's pair is broken).
    const free = prefs.find((k) => {
      const first = PREFERS[k]?.[0];
      return first === a || !first || !left.includes(first);
    });
    const pick = free ?? prefs[0];
    if (pick) left.splice(left.indexOf(pick), 1);
    pairs.push(pick ? [a, pick] : [a]);
  }

  const rows: SpreadRow[] = pairs.map((p) => (p.length === 2 ? { left: [p[0]], right: [p[1]] } : { solo: p[0] }));
  const h = (keys: SectionKey[]) => keys.reduce((n, k) => n + (HEIGHT[k] ?? 1.5), 0);
  // Each leftover goes under the shorter side of the most lopsided row, when
  // it fits in the hole without making that side the taller by much.
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!("solo" in row)) continue;
    const size = HEIGHT[row.solo] ?? 1.5;
    let best = -1;
    let gap = 0;
    rows.forEach((r, j) => {
      if ("solo" in r) return;
      const g = Math.abs(h(r.left) - h(r.right));
      if (g > gap && g >= size * 0.6) {
        gap = g;
        best = j;
      }
    });
    if (best < 0) continue;
    const target = rows[best] as { left: SectionKey[]; right: SectionKey[] };
    (h(target.left) < h(target.right) ? target.left : target.right).push(row.solo);
    rows.splice(i, 1);
  }
  return rows;
}
