// Official F1 imagery, straight from F1's own image server (the same files
// formula1.com and the F1 app use). The server resizes on request, so the
// paper asks for exactly the size it prints and never touches Vercel's image
// quota. Team logos come as square monochrome SVG glyphs (white; the light
// theme inverts them with .f1-logo in globals.css), cars as side-on renders,
// drivers as transparent portraits.

const SEASON = 2026;
const BASE = "https://media.formula1.com/image/upload";

// F1's folder name for each team, keyed by every name the feeds use.
const TEAM_SLUG: Record<string, string> = {
  mercedes: "mercedes",
  ferrari: "ferrari",
  mclaren: "mclaren",
  "red bull racing": "redbullracing",
  "red bull": "redbullracing",
  "racing bulls": "racingbulls",
  rb: "racingbulls",
  "rb f1 team": "racingbulls",
  alpine: "alpine",
  "alpine f1 team": "alpine",
  haas: "haasf1team",
  "haas f1 team": "haasf1team",
  audi: "audi",
  sauber: "audi",
  "kick sauber": "audi",
  williams: "williams",
  "aston martin": "astonmartin",
  cadillac: "cadillac",
  "cadillac f1 team": "cadillac",
};

export function teamSlug(team: string): string | null {
  return TEAM_SLUG[team.trim().toLowerCase()] ?? null;
}

/** A team's logo glyph (white SVG, square). */
export function teamLogo(team: string): string | null {
  const slug = teamSlug(team);
  return slug ? `${BASE}/c_fit,h_64/q_auto/common/f1/${SEASON}/${slug}/${SEASON}${slug}logowhite` : null;
}

/** The team's car, side on, facing right. */
export function teamCar(team: string, width = 640): string | null {
  const slug = teamSlug(team);
  return slug ? `${BASE}/c_fit,w_${width}/q_auto/f_auto/common/f1/${SEASON}/${slug}/${SEASON}${slug}carright` : null;
}

/**
 * A driver's portrait. The live feed's DriverList carries each driver's image
 * id ("common/f1/2026/mercedes/georus01/2026mercedesgeorus01right"); without
 * one, F1's reference id is enough to build it.
 */
export function driverPhoto(opts: { publicId?: string | null; team?: string; reference?: string | null }, width = 160): string | null {
  if (opts.publicId) return `${BASE}/c_fill,w_${width},h_${width},g_north/q_auto/f_auto/${opts.publicId}`;
  const slug = opts.team ? teamSlug(opts.team) : null;
  const ref = opts.reference?.toLowerCase();
  return slug && ref ? `${BASE}/c_fill,w_${width},h_${width},g_north/q_auto/f_auto/common/f1/${SEASON}/${slug}/${ref}/${SEASON}${slug}${ref}right` : null;
}

// F1's reference for each 2026 driver (from the live feed's DriverList),
// for portraits wherever the feed itself isn't in hand.
const REFERENCE: Record<string, string> = {
  NOR: "LANNOR01", PIA: "OSCPIA01", VER: "MAXVER01", HAD: "ISAHAD01", RUS: "GEORUS01", ANT: "ANDANT01",
  LEC: "CHALEC01", HAM: "LEWHAM01", ALO: "FERALO01", STR: "LANSTR01", ALB: "ALEALB01", SAI: "CARSAI01",
  HUL: "NICHUL01", BOR: "GABBOR01", LAW: "LIALAW01", LIN: "ARVLIN01", GAS: "PIEGAS01", COL: "FRACOL01",
  OCO: "ESTOCO01", BEA: "OLIBEA01", PER: "SERPER01", BOT: "VALBOT01",
};

/** A driver's portrait by timing code and team. */
export function driverPhotoByCode(code: string, team: string, width = 160): string | null {
  return driverPhoto({ team, reference: REFERENCE[code.toUpperCase()] ?? null }, width);
}
