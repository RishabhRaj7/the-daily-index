import type { Personalization } from "@/lib/types";
import type { DigestPreferences } from "./types";

/**
 * Carry the sports settings (kept with the page personalisation) into the
 * digest preferences the AI editor reads: favourite football and tennis
 * names become watched entities of the sports section, and the rivals of the
 * sports the reader follows feed Schadenfreude.
 */
export function withSportsSettings(prefs: DigestPreferences, paper: Personalization): DigestPreferences {
  const favourites = [
    paper.favoriteFootballPlayer,
    paper.favoriteFootballClub,
    paper.favoriteFootballNationalTeam,
    paper.favoriteTennisPlayer,
  ]
    .map((v) => v.trim())
    .filter(Boolean);
  const rivals = [
    paper.sports.includes("f1") ? paper.hateWatchF1 : "",
    paper.sports.includes("football") ? paper.hateWatchFootball : "",
    paper.sports.includes("tennis") ? paper.hateWatchTennis : "",
  ]
    .map((v) => v.trim())
    .filter(Boolean);
  return {
    ...prefs,
    global: { ...prefs.global, rivals },
    sections:
      favourites.length === 0
        ? prefs.sections
        : prefs.sections.map((s) =>
            s.slot === "sports"
              ? { ...s, watchEntities: [...new Set([...(s.watchEntities ?? []), ...favourites])] }
              : s,
          ),
  };
}
