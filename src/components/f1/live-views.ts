"use client";

import { BroadcastIcon, ChartLineIcon, ChartLineUpIcon, ChatCenteredTextIcon, FlagIcon, GavelIcon, type Icon, TimerIcon, TireIcon, TrophyIcon } from "@phosphor-icons/react";
import { useMemo, useSyncExternalStore } from "react";

// The live centre's views and where the reader is among them. The address holds it
// ("#analysis/tyres"), so a view can be shared or reloaded, and the menu around the
// page (LiveNav) and the page itself (LiveCentre) both read it from there.

export type View = "live" | "analysis" | "feed" | "weekend" | "season";
export type Sub = "tyres" | "laps" | "pace" | "stewards";

export const VIEWS: { id: View; label: string; Glyph: Icon }[] = [
  { id: "live", label: "Live", Glyph: BroadcastIcon },
  { id: "analysis", label: "Analysis", Glyph: ChartLineIcon },
  { id: "feed", label: "Feed", Glyph: ChatCenteredTextIcon },
  { id: "weekend", label: "Weekend", Glyph: FlagIcon },
  { id: "season", label: "Season", Glyph: TrophyIcon },
];

export const SUBS: { id: Sub; label: string; Glyph: Icon }[] = [
  { id: "tyres", label: "Tyres", Glyph: TireIcon },
  { id: "laps", label: "Lap chart", Glyph: ChartLineUpIcon },
  { id: "pace", label: "Pace", Glyph: TimerIcon },
  { id: "stewards", label: "Stewards", Glyph: GavelIcon },
];

// Links into the page from before the views (the Pit wall card links #race-control).
const LEGACY: Record<string, string> = {
  timing: "live",
  track: "live",
  "race-control": "feed",
  radio: "feed",
  strategy: "analysis/tyres",
  story: "analysis/laps",
  title: "season",
  benchmarks: "analysis/pace",
};

function parse(hash: string): { view: View; sub: Sub } {
  const raw = hash.replace(/^#/, "");
  const [v, s] = (LEGACY[raw] ?? raw).split("/");
  return {
    view: VIEWS.some((x) => x.id === v) ? (v as View) : "live",
    sub: SUBS.some((x) => x.id === s) ? (s as Sub) : "tyres",
  };
}

export const viewHash = (view: View, sub: Sub = "tyres") => `#${view === "analysis" ? `analysis/${sub}` : view}`;

const CHANGED = "f1-view";

/** Go to a view: the address changes without a jump, and the page goes back to the top of the views if it's past them. */
export function goToView(view: View, sub?: Sub): void {
  const keep = sub ?? parse(location.hash).sub;
  history.replaceState(null, "", `${location.pathname}${location.search}${viewHash(view, keep)}`);
  window.dispatchEvent(new Event(CHANGED));
  const top = document.getElementById("views-top");
  if (top && top.getBoundingClientRect().top < 0) window.scrollTo({ top: top.getBoundingClientRect().top + window.scrollY - 72, behavior: "instant" });
}

function subscribe(changed: () => void) {
  for (const e of ["hashchange", "popstate", CHANGED]) window.addEventListener(e, changed);
  return () => {
    for (const e of ["hashchange", "popstate", CHANGED]) window.removeEventListener(e, changed);
  };
}

export function useLiveView(): { view: View; sub: Sub } {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => "");
  return useMemo(() => parse(hash), [hash]);
}
