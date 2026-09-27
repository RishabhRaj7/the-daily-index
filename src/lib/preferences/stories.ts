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
    deck: "",
    // A grouped section's bucket (a country, a company…) is printed as the
    // story's kicker. Sports buckets are layout-only.
    ...(article.group && !["f1", "football", "tennis"].includes(article.group)
      ? { kicker: article.group }
      : {}),
    dateline: article.source,
    readTimeMin: 1,
    lastUpdated: article.publishedAt || "recently",
    body: [article.summary],
    significance: Math.max(20, 75 - article.priority * 5),
    personal: article.matchedEntity,
    sourceUrl: article.url,
    sourceName: article.source,
    ...(article.why ? { why: article.why } : {}),
  };
}

/** Corpus pool → the icon keys the At a Glance panel already renders. */
const POOL_TO_BRIEF_LABEL: Record<string, string> = {
  World: "World",
  Markets: "Markets",
  F1: "F1",
  Football: "Football",
  Tennis: "Tennis",
  Tech: "Tech",
};

/** One "at a glance" bullet per digest section, derived deterministically
 *  from the digest itself — no extra model call. When /api/digest returned
 *  the AI-curated `atAGlance` picks (top 6 headlines across the whole
 *  corpus per the reader's preferences) those take precedence unchanged. */
export function deriveBriefFromDigest(
  result: { sections: Record<string, DigestArticle[]>; atAGlance?: AtAGlanceItem[] },
  prefs: { sections: DigestSection[] },
): { bullets: Array<{ section: string; text: string; url?: string; headline?: string }> } {
  if (result.atAGlance && result.atAGlance.length > 0) {
    return {
      bullets: result.atAGlance.slice(0, 6).map((item) => {
        let text = (item.summary || item.title).replace(/\s+/g, " ").trim();
        //const words = text.split(" ");
        //if (words.length > 20) text = words.slice(0, 20).join(" ") + "…";
        return { section: POOL_TO_BRIEF_LABEL[item.pool] ?? item.pool, text, url: item.url, headline: item.title };
      }),
    };
  }

  const bullets: Array<{ section: string; text: string; url?: string; headline?: string }> = [];
  for (const section of [...prefs.sections].sort((a, b) => a.order - b.order)) {
    const top = (result.sections[section.id] ?? [])[0];
    if (!top) continue;
    let text = top.summary.replace(/\s+/g, " ").trim();
    const words = text.split(" ");
    if (words.length > 20) text = words.slice(0, 20).join(" ") + "…";
    bullets.push({ section: section.label, text, url: top.url, headline: top.title });
  }
  return { bullets };
}
