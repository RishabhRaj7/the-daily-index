// The paper's day follows the reader's clock, not the server's. Vercel runs
// in UTC, so without this the edition would roll over at 05:30 IST and the
// masthead date would be wrong for the first hours of every morning.

export const EDITION_TIME_ZONE = process.env.NEXT_PUBLIC_EDITION_TIME_ZONE ?? "Asia/Kolkata";

/** YYYY-MM-DD in the edition's time zone. */
export function editionDate(at: Date = new Date()): string {
  // en-CA formats as ISO-style YYYY-MM-DD.
  return at.toLocaleDateString("en-CA", { timeZone: EDITION_TIME_ZONE });
}

/** "Sunday, 27 September 2026" in the edition's time zone. */
export function editionDateLabel(at: Date = new Date()): string {
  return at.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: EDITION_TIME_ZONE,
  });
}

export function isEditionDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
