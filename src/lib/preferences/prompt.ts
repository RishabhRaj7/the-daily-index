// Builds the single prompt that turns "every article we fetched today" +
// "the reader's preferences JSON" into a preference-driven digest.

import type { CorpusArticle, DigestPreferences, DigestSection } from "./types";

function describeSection(section: DigestSection): string {
  const shared: string[] = [];
  if (section.watchEntities && section.watchEntities.length > 0) {
    shared.push(
      `watchEntities (prioritise articles mentioning any of these): ${section.watchEntities.join(", ")}`,
    );
  }
  if (section.preferredSources && section.preferredSources.length > 0) {
    shared.push(`preferredSources ( favour these sources when quality ties): ${section.preferredSources.join(", ")}`);
  }
  if (section.excludeKeywords && section.excludeKeywords.length > 0) {
    shared.push(`excludeKeywords (never select articles matching these): ${section.excludeKeywords.join(", ")}`);
  }
  if (section.prompt && section.prompt.trim()) {
    shared.push(`extra guidance: ${section.prompt.trim()}`);
  }
  const sharedBlock = shared.length > 0 ? `\n    ${shared.join("\n    ")}` : "";

  if (section.type === "grouped") {
    return `- id "${section.id}" — GROUPED section "${section.label}"
  rule: pick up to ${section.articleCountPerGroup} article(s) for EACH of these ${section.groupBy} groups: ${section.groups.join(", ")}.
  Every returned article for this section MUST carry "group" set to exactly one of those group names. Skip a group entirely if nothing relevant qualifies.${sharedBlock}`;
  }
  if (section.type === "custom") {
    return `- id "${section.id}" — CUSTOM section "${section.label}"
  rule: follow this instruction literally and return at most ${section.articleCount} articles: ${section.instruction}${sharedBlock}`;
  }
  return `- id "${section.id}" — TOPIC section "${section.label}"
  rule: pick the ${section.articleCount} best-fit articles for this topic, best first.${sharedBlock}`;
}

/**
 * The model replies with corpus *indices* (never URLs or titles), so the
 * server can rehydrate real article metadata and guarantee every link in the
 * digest actually exists in today's fetch.
 */
export function buildDigestPrompt(
  prefs: DigestPreferences,
  corpus: CorpusArticle[],
): string {
  const g = prefs.global;
  const paddockIds = prefs.sections
    .filter((s) => s.slot === "paddock-notes" || s.slot === "sports")
    .map((s) => `"${s.id}"`);

  const paddockRule =
    paddockIds.length > 0
      ? `\n- Sections ${paddockIds.join(", ")} feed the paper's sports pages: for them, "group" MUST be exactly one of "f1", "football", "tennis" — whichever sport the article covers.`
      : "";

  return `You are the editor of "The Daily Index", a one-reader news digest. You receive every article our feeds fetched today (the CORPUS) plus the reader's PREFERENCES. Your job: select and summarise articles strictly according to the preferences, then return JSON.

GLOBAL RULES (apply to every section):
- Tone: ${g.tone || "plain, no fluff"}
- Watch topics: prioritise articles mentioning any of these across the whole digest: ${g.watchTopics.length > 0 ? g.watchTopics.join(", ") : "(none)"}
- Never select an article whose title or text matches any global exclude keyword: ${g.excludeKeywords.length > 0 ? g.excludeKeywords.join(", ") : "(none)"}
- Max article age: ${g.maxAgeHours} hours. Articles older than that (see "age") must not be selected.
- Summaries: about ${g.summaryLengthWords} words, 4–5 complete sentences, fact-first, in the tone above. Stand alone without the title. Never invent facts, quotes or numbers that are not in the article text.

SECTION RULES:
${prefs.sections.map(describeSection).join("\n")}

GENERIC RULES FOR ALL SECTION TYPES:
- Select ONLY from the CORPUS below. An article may appear in at most ONE section — assign each article where it fits the reader best.
- If fewer articles qualify than a section asks for, return fewer. Never pad a section with weak or off-topic articles.
- Order each section's array by importance to THIS reader (priority 1 = most important).${paddockRule}
- "watchEntities" outrank general stories: an average article about a watched entity beats a great article the reader didn't ask for.

CORPUS (${corpus.length} articles). "i" is the index you must reference; "pool" is the wire it came from; "age" is hours since publication:
${corpus
  .map(
    (a) =>
      `[i=${a.i}] (pool=${a.pool}, source=${a.source}, age=${a.ageHours !== null ? `${Math.round(a.ageHours)}h` : "unknown"}) ${a.title}\n${a.text}`,
  )
  .join("\n\n")}

Return ONLY a JSON object — no markdown fences, no commentary — with exactly this shape:
{
  "sections": {
    "<sectionId>": [
      { "i": <corpus index>, "summary": "<your summary>", "priority": 1, "group": "<only where a rule above requires it>" }
    ]
  }
}
Include every section id listed above (use [] when nothing qualifies). Use only section ids and corpus indices that exist.`;
}
