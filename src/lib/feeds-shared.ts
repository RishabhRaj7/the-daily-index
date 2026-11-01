// The paper's default social feeds, shared by the browser (lib/feeds.ts, what
// a reader can edit) and the server (lib/live/social.ts, what it reads when a
// request names nothing).

export interface FeedConfig {
  /** X handles, without the @. */
  x: string[];
  /** X searches ("Nvidia earnings"). */
  searches: string[];
  /** Subreddits, without the r/. */
  subs: string[];
}

export const FEED_LIMITS = { x: 12, searches: 4, subs: 10 } as const;

const clean = (v: unknown, max: number) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))].slice(0, max) : [];

/** A saved feed as it should be (a synced copy may come from older code); undefined when there's none. */
export function normalizeFeed(v: unknown): FeedConfig | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  return { x: clean(o.x, FEED_LIMITS.x), searches: clean(o.searches, FEED_LIMITS.searches), subs: clean(o.subs, FEED_LIMITS.subs) };
}

/** The Grapevine's X accounts for a reader who hasn't named any: the wires and the paper's own desks. */
export const DEFAULT_X_ACCOUNTS = ["ANI", "PTI_News", "Reuters", "TechCrunch", "F1"];

/** F1 and the FIA, then three reporters who break paddock news (the reader's team goes after the first two). */
export const F1_DEFAULT_X = ["F1", "fia", "ChrisMedlandF1", "AdamCooperF1", "andrewbensonf1"];
export const F1_OFFICIAL_X = ["F1", "fia"];
export const F1_SUBREDDITS = ["formula1", "F1Technical"];
/** Team accounts, by the team names the paper uses (lib/config/f1-drivers.ts). */
export const F1_TEAM_X: Record<string, string> = {
  Mercedes: "MercedesAMGF1",
  Ferrari: "ScuderiaFerrari",
  McLaren: "McLarenF1",
  "Red Bull Racing": "redbullracing",
  "Aston Martin": "AstonMartinF1",
  Alpine: "AlpineF1Team",
  Williams: "WilliamsRacing",
  "Haas F1 Team": "HaasF1Team",
  "Racing Bulls": "visacashapprb",
};

/** Game updates, the scene's Polymarket prices, leaks, and Riot's own esports account. */
export const VAL_DEFAULT_X = ["ValorantUpdated", "PolymarketVAL", "VALORANTLeaksEN", "ValorantEsports"];
export const VAL_SUBREDDITS = ["ValorantCompetitive"];

/** Where Indian retail investors talk about issues; checked to exist and to allow IPO discussion. */
export const IPO_SUBREDDITS = ["IndianStockMarket", "StockMarketIndia", "IndiaInvestments", "IndianStreetBets"];
