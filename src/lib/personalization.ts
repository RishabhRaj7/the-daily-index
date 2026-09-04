import type { Personalization, ReaderInterests } from "./types";
import { SECTION_ORDER } from "./sections";

const STORAGE_KEY = "daily-index:personalization";

export const DEFAULT_PERSONALIZATION: Personalization = {
  onboarded: false,
  homeCity: "Bengaluru",
  cardsFollowing: [],
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
    const parsed = JSON.parse(raw) as Partial<Personalization> & { cardFollowing?: string };
    const merged: Personalization = { ...DEFAULT_PERSONALIZATION, ...parsed };
    // Migration: the old single-card radio stored `cardFollowing: string`.
    if (!Array.isArray(merged.cardsFollowing)) {
      merged.cardsFollowing =
        typeof parsed.cardFollowing === "string" && parsed.cardFollowing ? [parsed.cardFollowing] : [];
    }
    return merged;
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
  // Interests cookie — read server-side so Editor's Picks can be weighted
  // toward what the reader actually follows. Names only; nothing sensitive.
  const interests: ReaderInterests = {
    city: data.homeCity ?? "",
    cards: data.cardsFollowing ?? [],
    f1Drivers: data.favoriteF1Drivers ?? [],
    f1Team: data.favoriteF1Team ?? "",
    footballClub: data.favoriteFootballClub ?? "",
    footballPlayer: data.favoriteFootballPlayer ?? "",
    nationalTeam: data.favoriteFootballNationalTeam ?? "",
    tennisPlayer: data.favoriteTennisPlayer ?? "",
    topics: data.topics ?? [],
  };
  const intVal = encodeURIComponent(JSON.stringify(interests));
  document.cookie = `daily-index:interests=${intVal};path=/;${maxAge};SameSite=Lax`;
}

export const EMPTY_INTERESTS: ReaderInterests = {
  city: "",
  cards: [],
  f1Drivers: [],
  f1Team: "",
  footballClub: "",
  footballPlayer: "",
  nationalTeam: "",
  tennisPlayer: "",
  topics: [],
};

/** Parses the interests cookie value written by savePersonalization(). */
export function parseInterestsCookie(value: string | undefined): ReaderInterests {
  if (!value) return EMPTY_INTERESTS;
  try {
    const p = JSON.parse(decodeURIComponent(value)) as Partial<ReaderInterests> & { card?: string };
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
    return {
      city: str(p.city),
      // Accept the legacy single `card` cookie until the reader next saves.
      cards: Array.isArray(p.cards) ? arr(p.cards) : p.card ? [str(p.card)] : [],
      f1Drivers: arr(p.f1Drivers),
      f1Team: str(p.f1Team),
      footballClub: str(p.footballClub),
      footballPlayer: str(p.footballPlayer),
      nationalTeam: str(p.nationalTeam),
      tennisPlayer: str(p.tennisPlayer),
      topics: arr(p.topics),
    };
  } catch {
    return EMPTY_INTERESTS;
  }
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
