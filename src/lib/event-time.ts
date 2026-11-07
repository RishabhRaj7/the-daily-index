// A scheduled event's time, always in IST and, where the event happens somewhere else,
// in its own local time too: "20:00 IST (11:30 São Paulo)". The local part names its day
// when that isn't IST's day: "01:30 IST (Sat 15:00 Austin)". Time zones, not fixed
// offsets, so daylight saving looks after itself.
// Valorant's data doesn't say where a match is played, so a league's matches take its
// home city and an international takes the city in its name. Nothing known, IST alone.

const IST = "Asia/Kolkata";

export interface EventPlace {
  /** IANA time zone. */
  zone: string;
  place: string;
}

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// In order: a city or circuit is checked before a country, because F1's "Bahrain Grand
// Prix" was held in Kuala Lumpur in 2026 and the USA has three races.
const F1_PLACES: Array<[RegExp, EventPlace]> = [
  [/\b(kuala lumpur|sepang|malaysia)\b/, { zone: "Asia/Kuala_Lumpur", place: "Kuala Lumpur" }],
  [/\b(melbourne|albert park|australian?)\b/, { zone: "Australia/Melbourne", place: "Melbourne" }],
  [/\b(shanghai|chinese|china)\b/, { zone: "Asia/Shanghai", place: "Shanghai" }],
  [/\b(suzuka|japanese|japan)\b/, { zone: "Asia/Tokyo", place: "Suzuka" }],
  [/\bmiami\b/, { zone: "America/New_York", place: "Miami" }],
  [/\blas vegas\b/, { zone: "America/Los_Angeles", place: "Las Vegas" }],
  [/\b(austin|americas|united states)\b/, { zone: "America/Chicago", place: "Austin" }],
  [/\b(montreal|canadian|canada)\b/, { zone: "America/Toronto", place: "Montreal" }],
  [/\b(monte carlo|monaco)\b/, { zone: "Europe/Monaco", place: "Monaco" }],
  [/\b(barcelona|catalunya)\b/, { zone: "Europe/Madrid", place: "Barcelona" }],
  [/\b(madrid|madring|spanish|spain)\b/, { zone: "Europe/Madrid", place: "Madrid" }],
  [/\b(spielberg|red bull ring|austrian?)\b/, { zone: "Europe/Vienna", place: "Spielberg" }],
  [/\b(silverstone|british|uk)\b/, { zone: "Europe/London", place: "Silverstone" }],
  [/\b(spa|belgian|belgium)\b/, { zone: "Europe/Brussels", place: "Spa" }],
  [/\b(budapest|hungar(y|ian|oring))\b/, { zone: "Europe/Budapest", place: "Budapest" }],
  [/\b(zandvoort|dutch|netherlands)\b/, { zone: "Europe/Amsterdam", place: "Zandvoort" }],
  [/\b(imola|emilia)\b/, { zone: "Europe/Rome", place: "Imola" }],
  [/\b(monza|italian|italy)\b/, { zone: "Europe/Rome", place: "Monza" }],
  [/\b(baku|azerbaijan)\b/, { zone: "Asia/Baku", place: "Baku" }],
  [/\b(singapore|marina bay)\b/, { zone: "Asia/Singapore", place: "Singapore" }],
  [/\bmexico\b/, { zone: "America/Mexico_City", place: "Mexico City" }],
  [/\b(sao paulo|interlagos|brazil(ian)?)\b/, { zone: "America/Sao_Paulo", place: "São Paulo" }],
  [/\b(lusail|qatar)\b/, { zone: "Asia/Qatar", place: "Lusail" }],
  [/\b(abu dhabi|yas|uae)\b/, { zone: "Asia/Dubai", place: "Abu Dhabi" }],
  [/\b(jeddah|saudi)\b/, { zone: "Asia/Riyadh", place: "Jeddah" }],
  [/\b(bahrain|sakhir)\b/, { zone: "Asia/Bahrain", place: "Sakhir" }],
];

/** Where a Grand Prix is, from any of its names (circuit or city first, then the race's). */
export function f1Place(...names: Array<string | null | undefined>): EventPlace | null {
  for (const name of names) {
    const text = plain(name ?? "");
    for (const [match, place] of F1_PLACES) if (match.test(text)) return place;
  }
  return null;
}

const VAL_CITIES: Array<[RegExp, EventPlace]> = [
  // A league's home, checked first: "Pacific" and the like are in every name of theirs.
  [/\bamericas\b/, { zone: "America/Los_Angeles", place: "Los Angeles" }],
  [/\bemea\b/, { zone: "Europe/Berlin", place: "Berlin" }],
  [/\bpacific\b/, { zone: "Asia/Seoul", place: "Seoul" }],
  [/\b(china|cn)\b/, { zone: "Asia/Shanghai", place: "Shanghai" }],
  // Internationals, named for their host.
  [/\bshanghai\b/, { zone: "Asia/Shanghai", place: "Shanghai" }],
  [/\bseoul\b/, { zone: "Asia/Seoul", place: "Seoul" }],
  [/\btokyo\b/, { zone: "Asia/Tokyo", place: "Tokyo" }],
  [/\bbangkok\b/, { zone: "Asia/Bangkok", place: "Bangkok" }],
  [/\bparis\b/, { zone: "Europe/Paris", place: "Paris" }],
  [/\bberlin\b/, { zone: "Europe/Berlin", place: "Berlin" }],
  [/\blondon\b/, { zone: "Europe/London", place: "London" }],
  [/\bmadrid\b/, { zone: "Europe/Madrid", place: "Madrid" }],
  [/\bcopenhagen\b/, { zone: "Europe/Copenhagen", place: "Copenhagen" }],
  [/\breykjavik\b/, { zone: "Atlantic/Reykjavik", place: "Reykjavik" }],
  [/\bistanbul\b/, { zone: "Europe/Istanbul", place: "Istanbul" }],
  [/\btoronto\b/, { zone: "America/Toronto", place: "Toronto" }],
  [/\blos angeles\b/, { zone: "America/Los_Angeles", place: "Los Angeles" }],
  [/\bsantiago\b/, { zone: "America/Santiago", place: "Santiago" }],
  [/\bsao paulo\b/, { zone: "America/Sao_Paulo", place: "São Paulo" }],
];

/** Where a Valorant event is played, as far as its name says. */
export function valorantPlace(event: string | null | undefined): EventPlace | null {
  const text = plain(event ?? "");
  for (const [match, place] of VAL_CITIES) if (match.test(text)) return place;
  return null;
}

/** The US Federal Reserve announces from Washington. */
export const WASHINGTON: EventPlace = { zone: "America/New_York", place: "Washington" };

const clock = (at: Date, zone: string) => at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: zone });
const dayName = (at: Date, zone: string) => at.toLocaleDateString("en-GB", { weekday: "short", timeZone: zone });
const dayKey = (at: Date, zone: string) => at.toLocaleDateString("en-CA", { timeZone: zone });

/** "20:00" in IST. */
export const istClock = (at: Date | string | number) => clock(new Date(at), IST);

/** "11:30 São Paulo", with its day when that isn't IST's. Null at home, or when the place isn't known. */
export function localTime(at: Date | string | number, where: EventPlace | null | undefined): string | null {
  if (!where || where.zone === IST) return null;
  const d = new Date(at);
  const day = dayKey(d, where.zone) === dayKey(d, IST) ? "" : `${dayName(d, where.zone)} `;
  return `${day}${clock(d, where.zone)} ${where.place}`;
}

/** "20:00 IST (11:30 São Paulo)", or "20:00 IST". */
export function eventTime(at: Date | string | number, where?: EventPlace | null): string {
  const local = localTime(at, where);
  return `${istClock(at)} IST${local ? ` (${local})` : ""}`;
}

/** "Sun 8 Nov, 22:30 IST (14:00 São Paulo)". */
export function eventDateTime(at: Date | string | number, where?: EventPlace | null): string {
  const d = new Date(at);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: IST })}, ${eventTime(d, where)}`;
}

/** A date in IST, "Sun 8 Nov" by default, so a travelling reader's calendar agrees with the times. */
export function istDay(at: Date | string | number, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Date(at).toLocaleDateString("en-GB", { ...opts, timeZone: IST });
}
