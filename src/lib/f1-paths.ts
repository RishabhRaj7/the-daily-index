// What an address on F1's archive may look like, for the routes that take one from
// the page. F1 writes them with the place's own letters ("São_Paulo"), so a check that
// only knows A to Z turns away that whole weekend's radio, past sessions and telemetry.

/** "2026/2026-11-08_São_Paulo_Grand_Prix/2026-11-06_Practice_1/" */
export const SESSION_PATH = /^\d{4}\/[\p{L}\p{M}\w-]+\/[\p{L}\p{M}\w-]+\/$/u;

/** A team radio clip on F1's server. */
export const RADIO_CLIP = /^https:\/\/livetiming\.formula1\.com\/static\/[\p{L}\p{M}\w/.-]+\/TeamRadio\/[\w.-]+\.mp3$/u;
