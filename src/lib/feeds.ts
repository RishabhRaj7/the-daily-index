"use client";

import { useEffect, useState } from "react";
import type { Personalization } from "./types";
import { loadPersonalization, PERSONALIZATION_CHANGED_EVENT, savePersonalization } from "./personalization";
import { DEFAULT_X_ACCOUNTS, F1_TEAM_X, F1_DEFAULT_X, F1_SUBREDDITS, IPO_SUBREDDITS, normalizeFeed, VAL_DEFAULT_X, VAL_SUBREDDITS, type FeedConfig } from "./feeds-shared";

// The X accounts, X searches and subreddits each section reads: the paper's
// defaults until the reader edits them ("Edit feeds" beside each list), then
// theirs. Kept in personalization, one field per section, so sync carries
// each section's feeds on its own (an edit to the paddock on the phone and to
// the Grapevine on the laptop both stand).

export type { FeedConfig } from "./feeds-shared";
export { FEED_LIMITS, normalizeFeed } from "./feeds-shared";

export type FeedSection = "grapevine" | "paddock" | "clutch" | "ipo";

const FIELD = {
  grapevine: "feedsGrapevine",
  paddock: "feedsPaddock",
  clutch: "feedsClutch",
  ipo: "feedsIpo",
} as const satisfies Record<FeedSection, keyof Personalization>;

export const FEED_META: Record<FeedSection, { title: string; kicker: string; searches: boolean; hint: string; suggest: { x: string[]; subs: string[] } }> = {
  grapevine: {
    title: "Your feeds",
    kicker: "The Grapevine",
    searches: true,
    hint: "The newest posts from these accounts and searches (last three days), and the day's top posts in these subreddits.",
    suggest: { x: ["ANI", "PTI_News", "Reuters", "TechCrunch", "verge", "F1", "elonmusk", "sama"], subs: ["india", "IndiaInvestments", "personalfinanceindia", "technology", "formula1", "soccer", "tennis", "cricket"] },
  },
  paddock: {
    title: "Paddock feeds",
    kicker: "Paddock Notes",
    searches: true,
    hint: "The last two days from these accounts and searches, and the day's top posts in these subreddits. Posts naming your drivers or team come first.",
    suggest: { x: ["F1", "fia", "ChrisMedlandF1", "AdamCooperF1", "andrewbensonf1", "ScarbsTech"], subs: ["formula1", "F1Technical", "formuladank", "F1FeederSeries"] },
  },
  clutch: {
    title: "Transfer window feeds",
    kicker: "Clutch · Valorant",
    searches: true,
    hint: "Roster talk from these subreddits (kept ten days), plus these accounts and searches. Posts naming your teams rank first.",
    suggest: { x: ["ValorantEsports"], subs: ["ValorantCompetitive", "VALORANT"] },
  },
  ipo: {
    title: "IPO chatter feeds",
    kicker: "IPO watch",
    searches: false,
    hint: "Where the paper looks for talk about each issue (kept a week): posts must name the company. An X search for the company runs on its own.",
    suggest: { x: [], subs: ["IndianStockMarket", "StockMarketIndia", "IndiaInvestments", "IndianStreetBets", "DalalStreetTalks"] },
  },
};

/** What a section reads before the reader has edited it (the older settings still count). */
export function defaultFeed(section: FeedSection, p: Personalization): FeedConfig {
  switch (section) {
    case "grapevine": {
      const fromSports = p.sports.map((s) => (s === "f1" ? "formula1" : s === "football" ? "soccer" : "tennis"));
      return {
        x: p.xAccounts?.length ? p.xAccounts : DEFAULT_X_ACCOUNTS,
        searches: p.xSearches ?? [],
        subs: p.subreddits.length ? p.subreddits : [...fromSports, "personalfinanceindia", "technology"],
      };
    }
    case "paddock": {
      const team = F1_TEAM_X[p.favoriteF1Team];
      return { x: [...F1_DEFAULT_X.slice(0, 2), ...(team ? [team] : []), ...F1_DEFAULT_X.slice(2)], searches: [], subs: F1_SUBREDDITS };
    }
    case "clutch":
      return { x: p.valorantX?.length ? p.valorantX : VAL_DEFAULT_X, searches: [], subs: VAL_SUBREDDITS };
    case "ipo":
      return { x: [], searches: [], subs: IPO_SUBREDDITS };
  }
}

export function feedFor(section: FeedSection, p: Personalization): { config: FeedConfig; custom: boolean } {
  const saved = p[FIELD[section]];
  return saved ? { config: saved, custom: true } : { config: defaultFeed(section, p), custom: false };
}

/** Saves a section's feeds; null goes back to the defaults. */
export function saveFeed(section: FeedSection, config: FeedConfig | null) {
  const p = loadPersonalization();
  const next = { ...p } as Personalization;
  if (config) next[FIELD[section]] = normalizeFeed(config);
  else delete next[FIELD[section]];
  savePersonalization(next);
}

/** One line on what a feed reads: "@F1, @fia & 4 more on X · r/formula1, r/F1Technical". */
export function describeFeed(c: FeedConfig): string {
  const few = (xs: string[], pre: string) => (xs.length ? xs.slice(0, 2).map((x) => `${pre}${x}`).join(", ") + (xs.length > 2 ? ` & ${xs.length - 2} more` : "") : "");
  const x = [few(c.x, "@"), c.searches.length ? `${c.searches.length} search${c.searches.length > 1 ? "es" : ""}` : ""].filter(Boolean).join(", ");
  return [x && `${x} on X`, few(c.subs, "r/")].filter(Boolean).join(" · ") || "Nothing chosen yet";
}

/** The query string /api/social reads a feed from. */
export function feedQuery(c: FeedConfig): string {
  return `x=${encodeURIComponent(c.x.join(","))}&q=${encodeURIComponent(c.searches.join("|"))}&r=${encodeURIComponent(c.subs.join(","))}`;
}

/** A section's feeds, following edits made here, in another tab, or by sync. Null until mounted. */
export function useFeed(section: FeedSection): { config: FeedConfig; custom: boolean } | null {
  const [state, setState] = useState<{ config: FeedConfig; custom: boolean } | null>(null);
  useEffect(() => {
    const read = () =>
      setState((was) => {
        const now = feedFor(section, loadPersonalization());
        return was && JSON.stringify(was) === JSON.stringify(now) ? was : now;
      });
    read();
    window.addEventListener(PERSONALIZATION_CHANGED_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PERSONALIZATION_CHANGED_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [section]);
  return state;
}
