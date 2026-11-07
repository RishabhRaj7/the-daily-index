import type { Personalization } from "@/lib/types";
import type { DigestPreferences } from "./types";

/**
 * Carry the sports settings (kept with the page personalisation) into the
 * digest preferences the AI editor reads: favourite football and tennis
 * names become watched entities of the sports section.
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
  return {
    ...prefs,
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
