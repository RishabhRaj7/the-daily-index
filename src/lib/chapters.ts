import type { SectionKey } from "./types";

// The paper's storyboard: after the front page, six sections' worth of news and
// numbers read in five chapters, the way a morning goes. The news from far away
// to the reader's own street, the sport they follow, their money, what's coming,
// then a back page to finish on. A section always belongs to its chapter; the
// reader's own order (Personalization.sectionOrder) still decides the rest: a
// chapter sits where its first section sits, and sections keep their order
// within it. So no saved order needs migrating, and moving Tech up in Settings
// brings What's next up with it.

export type ChapterId = "news" | "sport" | "money" | "next" | "back";

export interface Chapter {
  id: ChapterId;
  /** One word: the phone's bar and the top bar. */
  label: string;
  /** As it prints at the head of the chapter. */
  name: string;
  /** The line beside the name. */
  line: string;
  sections: SectionKey[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: "news",
    label: "News",
    name: "The news",
    line: "From far away to your own street",
    sections: ["dateline", "the-nation", "two-cities", "sky-report"],
  },
  {
    id: "sport",
    label: "Sport",
    name: "Your sport",
    line: "The races and matches you follow",
    sections: ["paddock-notes", "clutch", "sports"],
  },
  {
    id: "money",
    label: "Money",
    name: "Your money",
    line: "What moved, then the numbers",
    sections: ["ledger", "market-pulse"],
  },
  {
    id: "next",
    label: "Next",
    name: "What's next",
    line: "What's being built, what traders expect, what's dated",
    sections: ["circuit-board", "straw-poll"],
  },
  {
    id: "back",
    label: "Back",
    name: "The back page",
    line: "Lighter reading to finish on",
    sections: ["grapevine"],
  },
];

export interface PrintedChapter extends Chapter {
  /** The chapter's sections on the page today, in the reader's order. */
  printed: SectionKey[];
}

/**
 * The chapters for a reader's order. One with nothing of its own in `order`
 * (its sections hidden, say) keeps its usual place, since What's next and the
 * back page also carry things that aren't sections: the caller decides whether
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
