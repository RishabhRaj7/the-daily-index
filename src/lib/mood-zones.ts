import type { MarketMood } from "@/lib/types";

// The fear ⇄ greed zones each mood reading is drawn with. A published index
// keeps its publisher's own cut-offs, so the lit zone always agrees with the
// word printed under it: Tickertape's MMI has four zones and no neutral,
// CNN's Fear & Greed five, and the paper's own reading five.

export interface MoodZone {
  from: number;
  to: number;
  label: string;
  color: string;
}

const XFEAR = "var(--mood-xfear)";
const FEAR = "var(--mood-fear)";
const NEUTRAL = "var(--mood-neutral)";
const GREED = "var(--mood-greed)";
const XGREED = "var(--mood-xgreed)";

const zones = (cuts: number[], labels: string[], colors: string[]): MoodZone[] =>
  labels.map((label, i) => ({ from: cuts[i], to: cuts[i + 1], label, color: colors[i] }));

const TICKERTAPE = zones([0, 30, 50, 70, 100], ["Extreme Fear", "Fear", "Greed", "Extreme Greed"], [XFEAR, FEAR, GREED, XGREED]);
const CNN = zones([0, 25, 45, 55, 75, 100], ["Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"], [XFEAR, FEAR, NEUTRAL, GREED, XGREED]);
const OURS = zones([0, 25, 40, 60, 75, 100], ["Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"], [XFEAR, FEAR, NEUTRAL, GREED, XGREED]);

export function moodZones(mood: Pick<MarketMood, "source">): MoodZone[] {
  const name = mood.source?.name ?? "";
  if (/tickertape/i.test(name)) return TICKERTAPE;
  if (/cnn/i.test(name)) return CNN;
  return OURS;
}

/** The zone the reading sits in: by its printed label first, else by score. */
export function moodZone(mood: Pick<MarketMood, "source" | "score" | "label">): MoodZone {
  const list = moodZones(mood);
  return (
    list.find((z) => z.label.toLowerCase() === mood.label.trim().toLowerCase()) ??
    list.find((z) => mood.score >= z.from && mood.score < z.to) ??
    list[list.length - 1]
  );
}
