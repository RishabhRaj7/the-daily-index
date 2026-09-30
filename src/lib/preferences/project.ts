// Maps a digest onto the paper's sections. Pure, so the server can render a
// ready edition straight into the first HTML (app/page.tsx) and the client
// can apply a later one (EditionView) with exactly the same result.

import type { Edition, Story } from "@/lib/types";
import type { DigestArticle, DigestPreferences, DigestResult, DigestSection, NewsSlot } from "./types";
import { digestArticleToStory } from "./stories";
import { isCitySection, sectionTarget } from "./prompt";

export interface DigestProjection {
  slotStories: Partial<Record<NewsSlot, Story[]>>;
  paddock: { f1: Story[]; football: Story[]; tennis: Story[] };
  /** Sections with no paper slot — printed after the standing sections. */
  standalone: Array<{ section: DigestSection; articles: DigestArticle[] }>;
  /** Schadenfreude: one story per rival who had a bad day. */
  rivals: Story[];
}

// Each section is picked with one spare (see sectionTarget); stories past
// the reader's count are marked so the page can hold them back.
function toStory(section: DigestSection, article: DigestArticle, i: number): Story {
  const story = digestArticleToStory(section, article, i);
  // City sections carry no spare (the lead never comes from them).
  if (isCitySection(section)) return story;
  return i >= sectionTarget(section) - 1 ? { ...story, reserve: true } : story;
}

export function projectDigest(result: DigestResult, prefs: DigestPreferences): DigestProjection {
  const slotStories: DigestProjection["slotStories"] = {};
  const paddock: DigestProjection["paddock"] = { f1: [], football: [], tennis: [] };
  const standalone: DigestProjection["standalone"] = [];

  for (const section of [...prefs.sections].sort((a, b) => a.order - b.order)) {
    const articles = result.sections[section.id] ?? [];
    if (articles.length === 0) continue;
    if (!section.slot) {
      standalone.push({ section, articles });
      continue;
    }
    if (section.slot === "paddock-notes") {
      articles.forEach((a, i) => {
        const sport = a.group === "football" || a.group === "tennis" ? a.group : "f1";
        paddock[sport].push(toStory(section, a, i));
      });
    } else if (section.slot === "sports") {
      articles.forEach((a, i) => {
        if (a.group === "football") paddock.football.push(toStory(section, a, i));
        if (a.group === "tennis") paddock.tennis.push(toStory(section, a, i));
      });
    } else {
      slotStories[section.slot] = [
        ...(slotStories[section.slot] ?? []),
        ...articles.map((a, i) => toStory(section, a, i)),
      ];
    }
  }
  const rivalSection: DigestSection = { id: "rivals", type: "topic", label: "Schadenfreude", order: 999, articleCount: 3, slot: "paddock-notes" };
  const rivals = (result.rivals ?? []).map((a, i) => ({
    ...digestArticleToStory(rivalSection, a, i),
    kicker: a.group,
  }));
  return { slotStories, paddock, standalone, rivals };
}

/** The edition's sections with the projection poured in; empty slots keep
 *  whatever they had (the raw wire stories). */
export function withProjection(
  sections: Edition["sections"],
  { slotStories, paddock }: DigestProjection,
): Edition["sections"] {
  const paddockAll = [...paddock.f1, ...paddock.football, ...paddock.tennis];
  return {
    ...sections,
    dateline: slotStories.dateline ?? sections.dateline,
    nation: slotStories["the-nation"] ?? sections.nation ?? [],
    twoCities: slotStories["two-cities"] ?? sections.twoCities ?? [],
    circuitBoard: slotStories["circuit-board"] ?? sections.circuitBoard,
    ledger: slotStories.ledger ?? sections.ledger,
    paddockNotes: paddockAll.length > 0 ? paddockAll : sections.paddockNotes,
  };
}
