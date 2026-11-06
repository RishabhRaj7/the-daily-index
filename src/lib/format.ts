import type { Edition, Story } from "./types";

export function totalReadTime(edition: Edition): number {
  const all: Story[] = Object.values(edition.sections).flat();
  return all.reduce((sum, s) => sum + s.readTimeMin, 0);
}

export function allStories(edition: Edition): Story[] {
  return Object.values(edition.sections).flatMap((stories) => stories ?? []);
}

// A promoted-wire story with a one-sentence RSS teaser shouldn't get the
// oversized drop-cap "Today's Lead" treatment — that's reserved for stories
// with enough real content to justify it. Gemini's own short paragraphs are
// the exception: they still outrank anyone's raw text.
const MIN_HERO_BODY_CHARS = 250;

function bodyLength(story: Story): number {
  return story.body.reduce((sum, p) => sum + p.length, 0);
}

// A story matching the reader's stated interests gets a strong boost toward
// the lead — preferences decide the front page, not just the margins. The
// body-length gate still applies, so a one-line teaser can never lead.
const PERSONAL_HERO_BOOST = 25;

export function pickHeroStory(
  edition: Edition,
  opts?: { preferPersonal?: boolean },
): Story | undefined {
  const preferPersonal = opts?.preferPersonal ?? true;
  // Local city news never leads the paper; it has its own section.
  const all = allStories(edition).filter((s) => s.section !== "two-cities");
  const promoted = all.find((s) => s.promoted);
  if (promoted) return promoted;
  const score = (s: Story) =>
    s.significance + (preferPersonal && s.personal ? PERSONAL_HERO_BOOST : 0);
  const best = (stories: Story[]) => [...stories].sort((a, b) => score(b) - score(a))[0];
  const long = (stories: Story[]) => stories.filter((s) => bodyLength(s) >= MIN_HERO_BODY_CHARS);
  // Who wrote it comes before how interesting it is: the lead is the one story
  // nobody misses, so it goes to Gemini's writing whenever any exists, then to
  // a story still waiting for it, and raw feed text only as a last resort.
  // (Absent `copy` is an edition from before stories said who wrote them.)
  const written = all.filter((s) => s.copy === "written" || s.copy === undefined);
  return (
    best(long(written)) ??
    best(written.filter((s) => bodyLength(s) > 0)) ??
    best(long(all.filter((s) => s.copy === "pending"))) ??
    best(long(all))
  );
}

export function formatIssue(volume: number, issue: number): string {
  return `Vol. ${volume}, No. ${issue}`;
}

// Words a full stop follows without ending a sentence.
const NOT_AN_END = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|No|Rs|vs|Inc|Ltd|Co|Gen|Lt|Col|Sgt|Capt|Sen|Rep|Gov|Hon|Mt|Ft|approx|etc|Jan|Feb|Mar|Apr|Aug|Sept|Sep|Oct|Nov|Dec)\.|\b[A-Z]\.|\b[A-Z]\.[A-Z]\.)$/;

/**
 * A paragraph's first whole sentence and the rest, for a story shown short on a
 * phone: it reads complete, with no "…" in the middle of a word. One too short
 * to say anything takes the next along; with no clean end, it's all "first".
 */
export function splitFirstSentence(text: string): [string, string] {
  const end = /[.!?]["”’)\]]*\s+(?=["“‘(\[]?[A-Z0-9₹$])/g;
  let m: RegExpExecArray | null;
  while ((m = end.exec(text))) {
    const upTo = text.slice(0, m.index + 1);
    if (upTo.length < 40 || NOT_AN_END.test(upTo)) continue;
    const cut = m.index + m[0].trimEnd().length;
    return [text.slice(0, cut), text.slice(cut).trim()];
  }
  return [text, ""];
}
