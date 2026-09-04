import type { Edition, Story } from "./types";

export function totalReadTime(edition: Edition): number {
  const all: Story[] = Object.values(edition.sections).flat();
  return all.reduce((sum, s) => sum + s.readTimeMin, 0);
}

export function allStories(edition: Edition): Story[] {
  return Object.values(edition.sections).flat();
}

// A promoted-wire story with a one-sentence RSS teaser shouldn't get the
// oversized drop-cap "Today's Lead" treatment — that's reserved for stories
// with enough real content to justify it.
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
  const all = allStories(edition);
  const promoted = all.find((s) => s.promoted);
  if (promoted) return promoted;
  const eligible = all.filter((s) => bodyLength(s) >= MIN_HERO_BODY_CHARS);
  const score = (s: Story) =>
    s.significance + (preferPersonal && s.personal ? PERSONAL_HERO_BOOST : 0);
  return [...eligible].sort((a, b) => score(b) - score(a))[0];
}

export function formatIssue(volume: number, issue: number): string {
  return `Vol. ${volume}, No. ${issue}`;
}
