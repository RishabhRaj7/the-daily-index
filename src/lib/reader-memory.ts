import type {
  EngagementRecord,
  IssueRecord,
  ReaderMemory,
  ReaderProfile,
  SectionKey,
  Story,
} from "./types";

// ---------------------------------------------------------------------------
// Reader memory — everything the paper "remembers" about its one reader.
//
// Strictly local: lives in localStorage, never sent to a server. Powers the
// reading streak, the personal archive ("The Morgue"), the personal On This
// Day, lightweight adaptive story ranking, the Editor's Desk note and the
// weekly recap. Can be wiped from Settings in one tap.
// ---------------------------------------------------------------------------

export const MEMORY_KEY = "daily-index:reader-memory";
const MAX_ISSUES = 400;
const MAX_ENGAGEMENTS = 600;

const EMPTY: ReaderMemory = {
  version: 1,
  firstOpened: null,
  visits: [],
  issues: [],
  engagements: [],
  sectionAffinity: {},
  sourceAffinity: {},
  tagAffinity: {},
};

export function todayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function loadMemory(): ReaderMemory {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(MEMORY_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<ReaderMemory>;
    return { ...EMPTY, ...parsed, version: 1 };
  } catch {
    return { ...EMPTY };
  }
}

function saveMemory(mem: ReaderMemory) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
    window.dispatchEvent(new CustomEvent("daily-index:memory"));
  } catch {
    /* quota or private mode — memory is a nicety, never a blocker */
  }
}

export function clearMemory() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MEMORY_KEY);
  window.dispatchEvent(new CustomEvent("daily-index:memory"));
}

/** Record that today's issue was opened. Idempotent per day. */
export function recordIssueOpened(input: {
  isoDate: string;
  issue: number;
  hero: Story | undefined;
}): ReaderMemory {
  const mem = loadMemory();
  const now = new Date().toISOString();
  if (!mem.firstOpened) mem.firstOpened = now;
  if (!mem.visits.includes(input.isoDate)) {
    mem.visits = [...mem.visits, input.isoDate].sort();
  }
  const existing = mem.issues.find((i) => i.isoDate === input.isoDate);
  if (!existing) {
    mem.issues = [
      ...mem.issues,
      {
        isoDate: input.isoDate,
        issue: input.issue,
        heroHeadline: input.hero?.headline ?? "",
        heroSection: input.hero?.section ?? "dateline",
        sectionsRead: [],
        openedAt: now,
      },
    ].slice(-MAX_ISSUES);
  } else if (!existing.heroHeadline && input.hero) {
    existing.heroHeadline = input.hero.headline;
    existing.heroSection = input.hero.section;
  }
  saveMemory(mem);
  return mem;
}

/** Record that the reader expanded / clicked through a story. */
export function recordEngagement(story: Story, isoDate = todayIso()) {
  const mem = loadMemory();
  if (mem.engagements.some((e) => e.id === story.id && e.at.slice(0, 10) === isoDate)) return;
  const rec: EngagementRecord = {
    id: story.id,
    headline: story.headline,
    section: story.section,
    sourceName: story.sourceName,
    tags: story.tags ?? [],
    at: new Date().toISOString(),
  };
  mem.engagements = [...mem.engagements, rec].slice(-MAX_ENGAGEMENTS);
  mem.sectionAffinity[story.section] = (mem.sectionAffinity[story.section] ?? 0) + 1;
  if (story.sourceName) {
    mem.sourceAffinity[story.sourceName] = (mem.sourceAffinity[story.sourceName] ?? 0) + 1;
  }
  for (const tag of story.tags ?? []) {
    mem.tagAffinity[tag] = (mem.tagAffinity[tag] ?? 0) + 1;
  }
  const issue = mem.issues.find((i) => i.isoDate === isoDate);
  if (issue && !issue.sectionsRead.includes(story.section)) {
    issue.sectionsRead.push(story.section);
  }
  saveMemory(mem);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function computeStreak(visits: string[], today = todayIso()): { current: number; longest: number } {
  if (visits.length === 0) return { current: 0, longest: 0 };
  const sorted = [...visits].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) run++;
    else run = 1;
    longest = Math.max(longest, run);
  }
  // Current streak counts back from today (or yesterday, if today not yet opened).
  const last = sorted[sorted.length - 1];
  const gap = daysBetween(last, today);
  if (gap > 1) return { current: 0, longest };
  let current = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) current++;
    else break;
  }
  return { current, longest };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function buildProfile(mem: ReaderMemory, today = todayIso()): ReaderProfile {
  const { current, longest } = computeStreak(mem.visits, today);
  const topEntry = <T extends string>(rec: Partial<Record<T, number>>): T | null => {
    const entries = Object.entries(rec) as Array<[T, number]>;
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  };
  const topTags = Object.entries(mem.tagAffinity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([t]) => t);

  // Weekday habit: which weekday shows up most among visits (needs ≥ 6 visits).
  let weekdayHabit: string | null = null;
  if (mem.visits.length >= 6) {
    const counts = new Array<number>(7).fill(0);
    for (const v of mem.visits) counts[new Date(v + "T12:00:00").getDay()]++;
    const max = Math.max(...counts);
    const idx = counts.indexOf(max);
    if (max >= 3) weekdayHabit = WEEKDAYS[idx];
  }

  const weekAgo = Date.now() - 7 * 86_400_000;
  const engagementsThisWeek = mem.engagements.filter((e) => new Date(e.at).getTime() >= weekAgo).length;

  return {
    streak: current,
    longestStreak: longest,
    totalIssues: mem.visits.length,
    firstOpened: mem.firstOpened,
    lastOpened: mem.visits.length ? mem.visits[mem.visits.length - 1] : null,
    favouriteSection: topEntry<SectionKey>(mem.sectionAffinity),
    favouriteSource: topEntry<string>(mem.sourceAffinity),
    topTags,
    weekdayHabit,
    engagementsThisWeek,
  };
}

/** Personal "On This Day": what led your paper 7 days / 30 days / a year ago. */
export function personalOnThisDay(mem: ReaderMemory, today = todayIso()): Array<{ label: string; issue: IssueRecord }> {
  const out: Array<{ label: string; issue: IssueRecord }> = [];
  const lookups: Array<[number, string]> = [
    [7, "A week ago"],
    [30, "A month ago"],
    [365, "A year ago"],
  ];
  const t = new Date(today + "T12:00:00");
  for (const [days, label] of lookups) {
    const d = new Date(t.getTime() - days * 86_400_000);
    const iso = todayIso(d);
    const issue = mem.issues.find((i) => i.isoDate === iso && i.heroHeadline);
    if (issue) out.push({ label, issue });
  }
  return out;
}

/**
 * Lightweight adaptive ranking. Returns a *stable* re-sort of a section's
 * stories where sources/tags the reader has engaged with before get a gentle
 * nudge upward. Deliberately small: the editor still decides the page; the
 * reader's habits only break ties.
 */
export function rankForReader<T extends Story>(stories: T[], mem: ReaderMemory): T[] {
  const totalSource = Object.values(mem.sourceAffinity).reduce((a, b) => a + b, 0);
  const totalTag = Object.values(mem.tagAffinity).reduce((a, b) => a + b, 0);
  if (totalSource + totalTag < 3) return stories; // not enough signal — don't pretend

  const boost = (s: Story): number => {
    let b = 0;
    if (s.sourceName && mem.sourceAffinity[s.sourceName]) {
      b += Math.min(6, (mem.sourceAffinity[s.sourceName] / Math.max(1, totalSource)) * 20);
    }
    for (const tag of s.tags ?? []) {
      if (mem.tagAffinity[tag]) b += Math.min(4, (mem.tagAffinity[tag] / Math.max(1, totalTag)) * 15);
    }
    return b;
  };
  return stories
    .map((s, i) => ({ s, i, score: s.significance + boost(s) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.s);
}

/** Issues from the last seven days, for the weekly recap. */
export function lastSevenDays(mem: ReaderMemory, today = todayIso()): IssueRecord[] {
  const t = new Date(today + "T12:00:00").getTime();
  return mem.issues.filter((i) => {
    const d = new Date(i.isoDate + "T12:00:00").getTime();
    return t - d < 7 * 86_400_000 && t - d >= 0;
  });
}

export function engagementsSince(mem: ReaderMemory, days: number): EngagementRecord[] {
  const since = Date.now() - days * 86_400_000;
  return mem.engagements.filter((e) => new Date(e.at).getTime() >= since);
}
