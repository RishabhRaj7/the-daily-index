import type { SectionKey } from "./types";

// The paper's running order: after the front page, the sections fall into four
// groups, the way a morning goes. The news from far away to the reader's own
// street, their sport, their money, then what's coming and what people are saying.
// The groups order the page and name the menu; no title for them prints on the
// page, where each section's own header is enough. A section always belongs to
// its group; the reader's own order (Personalization.sectionOrder) still decides
// the rest: a group sits where its first section sits, and sections keep their
// order within it. So no saved order needs migrating, and moving Tech up in
// Settings brings Next up with it.

export type ChapterId = "news" | "sport" | "money" | "next";

export interface Chapter {
  id: ChapterId;
  /** One word: every form of the menu, and Settings' headings. */
  label: string;
  sections: SectionKey[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: "news",
    label: "News",
    sections: ["dateline", "the-nation", "two-cities", "sky-report"],
  },
  {
    id: "sport",
    label: "Sport",
    sections: ["paddock-notes", "clutch", "sports"],
  },
  {
    id: "money",
    label: "Money",
    sections: ["ledger", "market-pulse"],
  },
  {
    id: "next",
    label: "Next",
    sections: ["circuit-board", "straw-poll", "grapevine"],
  },
];

export interface PrintedChapter extends Chapter {
  /** The chapter's sections on the page today, in the reader's order. */
  printed: SectionKey[];
}

/**
 * The chapters for a reader's order. One with nothing of its own in `order`
 * (its sections hidden, say) keeps its usual place, since Next also carries
 * things that aren't sections: the caller decides whether
 * it prints at all.
 */
export function chaptersFor(order: SectionKey[]): PrintedChapter[] {
  const at = (key: SectionKey) => order.indexOf(key);
  const withPrinted: PrintedChapter[] = CHAPTERS.map((c) => ({
    ...c,
    printed: order.filter((key) => c.sections.includes(key)),
  }));
  const filled = withPrinted
    .filter((c) => c.printed.length > 0)
    .sort((a, b) => at(a.printed[0]) - at(b.printed[0]));
  // Back at its usual place among the others, whichever way they moved.
  withPrinted.forEach((c, i) => {
    if (c.printed.length === 0) filled.splice(Math.min(i, filled.length), 0, c);
  });
  return filled;
}

/** The reader's order, tidied so each chapter's sections sit together. */
export function groupedOrder(order: SectionKey[]): SectionKey[] {
  return chaptersFor(order).flatMap((c) => c.printed);
}

/** A section moved up or down within its chapter; the ends of a chapter stop it. */
export function moveWithinChapter(order: SectionKey[], key: SectionKey, dir: -1 | 1): SectionKey[] {
  const chapter = CHAPTERS.find((c) => c.sections.includes(key));
  const next = groupedOrder(order);
  const i = next.indexOf(key);
  const other = next[i + dir];
  if (!chapter || i < 0 || !other || !chapter.sections.includes(other)) return next;
  [next[i], next[i + dir]] = [other, key];
  return next;
}

/** A whole chapter moved past its neighbour. */
export function moveChapter(order: SectionKey[], id: ChapterId, dir: -1 | 1): SectionKey[] {
  const chapters = chaptersFor(order).filter((c) => c.printed.length > 0);
  const i = chapters.findIndex((c) => c.id === id);
  const other = chapters[i + dir];
  if (i < 0 || !other) return chapters.flatMap((c) => c.printed);
  [chapters[i], chapters[i + dir]] = [other, chapters[i]];
  return chapters.flatMap((c) => c.printed);
}
