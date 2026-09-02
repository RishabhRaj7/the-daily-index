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

export function pickHeroStory(edition: Edition): Story | undefined {
  const all = allStories(edition);
  const promoted = all.find((s) => s.promoted);
  if (promoted) return promoted;
  const eligible = all.filter((s) => bodyLength(s) >= MIN_HERO_BODY_CHARS);
  return [...eligible].sort((a, b) => b.significance - a.significance)[0];
}

export function formatIssue(volume: number, issue: number): string {
  return `Vol. ${volume}, No. ${issue}`;
}
