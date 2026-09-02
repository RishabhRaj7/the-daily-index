import type { Personalization } from "./types";
import { SECTION_ORDER } from "./sections";

const STORAGE_KEY = "daily-index:personalization";

export const DEFAULT_PERSONALIZATION: Personalization = {
  onboarded: false,
  homeCity: "Bengaluru",
  cardFollowing: "",
  sports: ["f1"],
  favoriteF1Team: "",
  favoriteF1Drivers: [],
  favoriteFootballPlayer: "",
  favoriteFootballClub: "",
  favoriteFootballNationalTeam: "",
  favoriteTennisPlayer: "",
  hateWatchF1: "",
  hateWatchFootball: "",
  hateWatchTennis: "",
  topics: [],
  subreddits: [],
  sectionOrder: SECTION_ORDER,
};

export function loadPersonalization(): Personalization {
  if (typeof window === "undefined") return DEFAULT_PERSONALIZATION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PERSONALIZATION;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PERSONALIZATION, ...parsed };
  } catch {
    return DEFAULT_PERSONALIZATION;
  }
}

export function savePersonalization(data: Personalization) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const maxAge = `max-age=${60 * 60 * 24 * 365}`;
  // Subreddits cookie — read server-side to fetch the right Reddit feeds.
  const subVal = encodeURIComponent(JSON.stringify(data.subreddits ?? []));
  document.cookie = `daily-index:subreddits=${subVal};path=/;${maxAge};SameSite=Lax`;
  // Sports cookie — read server-side to fetch the right sports news feeds.
  const sportsVal = encodeURIComponent(JSON.stringify(data.sports ?? ["f1"]));
  document.cookie = `daily-index:sports=${sportsVal};path=/;${maxAge};SameSite=Lax`;
  // Hate-watch cookie — read server-side to filter negative sports news.
  const hwVal = encodeURIComponent(JSON.stringify({
    f1: data.hateWatchF1 ?? "",
    football: data.hateWatchFootball ?? "",
    tennis: data.hateWatchTennis ?? "",
  }));
  document.cookie = `daily-index:hate-watch=${hwVal};path=/;${maxAge};SameSite=Lax`;
}

export const F1_TEAM_COLORS: Record<string, string> = {
  McLaren: "#FF8000",
  Ferrari: "#E8002D",
  "Red Bull": "#3671C6",
  Mercedes: "#27F4D2",
  "Aston Martin": "#229971",
  Alpine: "#00A1E8",
  Williams: "#64C4FF",
  RB: "#6692FF",
  "Kick Sauber": "#52E252",
  Audi: "#BB0A30",
  Cadillac: "#0B2942",
  Haas: "#B6BABD",
};

export const F1_TEAM_ABBREV: Record<string, string> = {
  McLaren: "MCL",
  Ferrari: "SF",
  "Red Bull": "RBR",
  Mercedes: "AMG",
  "Aston Martin": "AMF",
  Alpine: "ALP",
  Williams: "WIL",
  RB: "RB",
  "Kick Sauber": "SAU",
  Audi: "ADU",
  Cadillac: "CAD",
  Haas: "HAS",
};

// Live standings report constructor names like "Alpine F1 Team" or
// "RB F1 Team" — normalize before looking up a color.
export function teamColor(teamName: string): string | undefined {
  const normalized = teamName.replace(/\s*F1 Team$/i, "").trim();
  return F1_TEAM_COLORS[normalized];
}

// Returns team abbreviation for badge display.
export function teamAbbrev(teamName: string): string {
  const normalized = teamName.replace(/\s*F1 Team$/i, "").trim();
  return F1_TEAM_ABBREV[normalized] ?? normalized.slice(0, 3).toUpperCase();
}

// Perceived luminance check — returns true if the hex color is light enough
// to warrant dark text overlaid on it.
export function isLightTeamColor(hex: string): boolean {
  if (!hex.startsWith("#") || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}
