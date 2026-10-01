import type { IpoEntry } from "@/lib/types";

// The mood of an IPO from its bidding: how many times over it is
// subscribed, read against how far into the bidding it is. Day one's
// figures are always small (big institutions bid on the last day), so the
// early days are judged against what a final day usually multiplies them
// to. The words are the paper's own, not advice.

export type IpoMoodLabel = "Cold" | "Lukewarm" | "Warm" | "Hot" | "Frenzy";

export interface IpoMood {
  label: IpoMoodLabel;
  color: string;
  /** 0–1 on a log scale (1× ≈ 0.15, 100× = 1), for a thermometer bar. */
  heat: number;
  times: number;
  /** "Day 2 of 3", "Final", or null once listed. */
  when: string | null;
  /** One plain line on what the number means. */
  line: string;
}

const COLOR: Record<IpoMoodLabel, string> = {
  Cold: "var(--mood-xfear)",
  Lukewarm: "var(--mood-fear)",
  Warm: "var(--mood-neutral)",
  Hot: "var(--mood-greed)",
  Frenzy: "var(--mood-xgreed)",
};

/** "5.07x" → 5.07 */
export function subscriptionTimes(s: string | null | undefined): number | null {
  const n = Number(String(s ?? "").replace(/[x×,\s]/gi, ""));
  return Number.isFinite(n) && n >= 0 && s ? n : null;
}

function biddingDay(ipo: Pick<IpoEntry, "open" | "close">, today: string): { day: number; of: number } | null {
  if (!ipo.open || !ipo.close) return null;
  const d = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  // Weekends don't bid; three working days is the norm.
  const span = Math.max(1, d(ipo.open, ipo.close) + 1 - (d(ipo.open, ipo.close) >= 4 ? 2 : 0));
  const of = Math.min(span, 5);
  const day = Math.min(of, Math.max(1, d(ipo.open, today) + 1 - (d(ipo.open, today) >= 4 ? 2 : 0)));
  return { day, of };
}

export function ipoMood(ipo: Pick<IpoEntry, "subscription" | "stage" | "open" | "close">, today: string, total?: number): IpoMood | null {
  const times = total ?? subscriptionTimes(ipo.subscription);
  if (times == null || ipo.stage === "upcoming") return null;
  const live = ipo.stage === "open";
  const bid = live ? biddingDay(ipo, today) : null;
  // How much a typical final day multiplies what's in by now.
  const left = bid ? bid.of - bid.day : 0;
  const projected = times * (left >= 2 ? 4 : left === 1 ? 2 : 1);
  const label: IpoMoodLabel = projected < 1 ? "Cold" : projected < 3 ? "Lukewarm" : projected < 15 ? "Warm" : projected < 50 ? "Hot" : "Frenzy";
  const heat = Math.min(1, Math.log10(times + 1) / 2);
  const when = bid ? (bid.day >= bid.of ? "Final day" : `Day ${bid.day} of ${bid.of}`) : ipo.stage === "listed" ? null : "Final";
  const x = `${times >= 10 ? Math.round(times) : times.toFixed(times >= 1 ? 1 : 2)}×`;
  const line = live
    ? times < 1
      ? `${x} so far: not all the shares are bid for yet.${left > 0 ? " Big institutions usually come in on the last day." : ""}`
      : `${x} so far: bids for ${x.replace("×", " times")} the shares on offer${left > 0 ? `, with ${left === 1 ? "a day" : `${left} days`} to go` : ""}.`
    : times < 1
      ? `Closed at ${x}: under-subscribed.`
      : `Closed at ${x}: ${projected >= 50 ? "a scramble, allotment will be a lottery" : projected >= 15 ? "strong demand" : projected >= 3 ? "steady demand" : "only just covered"}.`;
  return { label, color: COLOR[label], heat, times, when, line };
}

/** Who drove the demand, from the category split: "Institutions led (QIB 112×)". */
export function ipoDriver(categories: Array<{ category: string; times: number }>): string | null {
  const named = categories.filter((c) => !/total|employee|shareholder/i.test(c.category) && c.times > 0);
  if (named.length < 2) return null;
  const top = [...named].sort((a, b) => b.times - a.times)[0];
  const who = /qib|institution/i.test(top.category)
    ? "Big institutions led"
    : /nii|hni|non.?institutional/i.test(top.category)
      ? "Wealthy individuals (HNIs) led"
      : /retail|rii/i.test(top.category)
        ? "Retail investors led"
        : `${top.category} led`;
  return `${who}: ${top.category} ${top.times >= 10 ? Math.round(top.times) : top.times.toFixed(1)}×.`;
}
