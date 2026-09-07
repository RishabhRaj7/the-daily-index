// Converts digest articles into the paper's Story shape so the AI-selected
// content renders through the exact same components (and styling) as the
// wire-built stories it replaces.

import type { Story, SectionKey } from "@/lib/types";
import type { AtAGlanceItem, DigestArticle, DigestSection, NewsSlot } from "./types";

const SLOT_TO_KEY: Record<NewsSlot, SectionKey> = {
  dateline: "dateline",
  sports: "paddock-notes",
  "paddock-notes": "paddock-notes",
  "circuit-board": "circuit-board",
  ledger: "ledger",
  "plastic-points": "plastic-points",
};

export function digestArticleToStory(
  section: DigestSection,
  article: DigestArticle,
  index: number,
): Story {
  return {
    id: `digest-${section.id}-${index}`,
    section: section.slot ? SLOT_TO_KEY[section.slot] : "dateline",
    headline: article.title,
    // Grouped sections print their bucket as the italic deck line. F1 and
    // World & India already have section context, so they do not need a tag
    // per story.
    deck:
      article.group && article.group !== "f1" && section.slot !== "dateline"
        ? article.group
        : "",
    dateline: article.source,
    readTimeMin: 1,
    lastUpdated: article.publishedAt || "recently",
    body: [article.summary],
    significance: Math.max(20, 75 - article.priority * 5),
    personal: article.matchedEntity,
    sourceUrl: article.url,
    sourceName: article.source,
  };
}

/** Corpus pool → the icon keys the At a Glance panel already renders. */
const POOL_TO_BRIEF_LABEL: Record<string, string> = {
  World: "World",
  Markets: "Markets",
  F1: "Sports",
  Football: "Sports",
  Tennis: "Sports",
  Tech: "Tech",
  Cards: "Cards",
};

/** One "at a glance" bullet per digest section, derived deterministically
 *  from the digest itself — no extra model call. When /api/digest returned
 *  the AI-curated `atAGlance` picks (top 6 headlines across the whole
 *  corpus per the reader's preferences) those take precedence unchanged. */
export function deriveBriefFromDigest(
  result: { sections: Record<string, DigestArticle[]>; atAGlance?: AtAGlanceItem[] },
  prefs: { sections: DigestSection[] },
): { bullets: Array<{ section: string; text: string }> } {
  if (result.atAGlance && result.atAGlance.length > 0) {
    return {
      bullets: result.atAGlance.slice(0, 6).map((item) => {
        let text = (item.summary || item.title).replace(/\s+/g, " ").trim();
        //const words = text.split(" ");
        //if (words.length > 20) text = words.slice(0, 20).join(" ") + "…";
        return { section: POOL_TO_BRIEF_LABEL[item.pool] ?? item.pool, text };
      }),
    };
  }

  const bullets: Array<{ section: string; text: string }> = [];
  for (const section of [...prefs.sections].sort((a, b) => a.order - b.order)) {
    const top = (result.sections[section.id] ?? [])[0];
    if (!top) continue;
    let text = top.summary.replace(/\s+/g, " ").trim();
    const words = text.split(" ");
    if (words.length > 20) text = words.slice(0, 20).join(" ") + "…";
    bullets.push({ section: section.label, text });
  }
  return { bullets };
}
