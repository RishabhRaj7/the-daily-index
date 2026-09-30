import type { AheadEvent, WeekAhead } from "@/lib/types";
import { getIpoBoard } from "./ipos";
import { getF1Schedule } from "./f1";

// The Week Ahead: dated things coming in the next seven days, in IST, from
// sources that publish the dates themselves — never guessed.
//
//   RBI policy decisions    RBI's own MPC schedule (below, hand-kept: RBI
//                           publishes it once a year as a press release,
//                           not as a page a program can read)
//   Fed decisions           federalreserve.gov FOMC calendar
//   Market holidays         NSE's trading-holiday list
//   Public holidays         Google's Holidays in India calendar (public
//                           holidays only, not observances)
//   IPOs                    the IPO board (opens, closes, lists)
//   F1                      the next race weekend's sessions (OpenF1)
//
// A source that fails simply adds nothing.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DAYS = 7;

// RBI Monetary Policy Committee, 2026-27: the last day of each meeting is
// the decision, announced at 10:00 IST. From RBI's press release "Meeting
// Schedule of the Monetary Policy Committee for 2026-27" (as reported by
// CNBC-TV18 and Upstox). Add next year's when RBI publishes it (usually
// late March).
const RBI_DECISIONS = ["2026-04-08", "2026-06-05", "2026-08-05", "2026-10-07", "2026-12-04", "2027-02-05"];

const istDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const istTime = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A wall-clock time in a zone → the instant (DST-correct). */
function zoned(date: string, time: string, timeZone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const shown = new Date(guess.toLocaleString("en-US", { timeZone }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (shown.getTime() - utc.getTime()));
}

async function text(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, next: { revalidate: 43_200 }, signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function rbi(): AheadEvent[] {
  return RBI_DECISIONS.map((date) => ({
    date,
    time: "10:00",
    label: "RBI policy decision",
    kind: "policy" as const,
    url: "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx",
  }));
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// Each meeting row: <div class="fomc-meeting__month ..."><strong>October</strong>
// … <div class="fomc-meeting__date ...">27-28*</div>. The decision comes on
// the last day at 14:00 Washington time.
export function parseFomc(html: string, year: number): AheadEvent[] {
  const start = html.indexOf(`${year} FOMC Meetings`);
  if (start < 0) return [];
  const rest = html.slice(start);
  const end = rest.indexOf("FOMC Meetings", 20);
  const panel = end > 0 ? rest.slice(0, end) : rest;
  const out: AheadEvent[] = [];
  for (const m of panel.matchAll(/fomc-meeting__month[^>]*><strong>([A-Za-z/]+)<\/strong>[\s\S]{0,300}?fomc-meeting__date[^>]*>([\d\-*]+)</g)) {
    // A meeting across two months reads "Apr/May"; the decision is in the second.
    const monthName = m[1].split("/").pop()!.toLowerCase();
    const month = MONTHS.findIndex((x) => x.startsWith(monthName.slice(0, 3)));
    const lastDay = Number(m[2].replace("*", "").split("-").pop());
    if (month < 0 || !lastDay) continue;
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const at = zoned(date, "14:00", "America/New_York");
    out.push({ date: istDate(at), time: istTime(at), label: "US Fed rate decision", kind: "policy", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" });
  }
  return out;
}

async function fomc(today: string): Promise<AheadEvent[]> {
  const html = await text("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm");
  if (!html) return [];
  const year = Number(today.slice(0, 4));
  return [...parseFomc(html, year), ...parseFomc(html, year + 1)];
}

async function nseHolidays(): Promise<AheadEvent[]> {
  const body = await text("https://www.nseindia.com/api/holiday-master?type=trading", {
    Accept: "application/json",
    Referer: "https://www.nseindia.com/resources/exchange-communication-holidays",
  });
  if (!body) return [];
  try {
    const rows = (JSON.parse(body) as { CM?: Array<{ tradingDate?: string; description?: string }> }).CM ?? [];
    return rows.flatMap((r) => {
      const d = r.tradingDate ? new Date(`${r.tradingDate} 12:00 UTC`) : null;
      if (!d || Number.isNaN(d.getTime()) || !r.description) return [];
      return [{ date: d.toISOString().slice(0, 10), label: `Markets shut: ${r.description.replace(/\*+$/, "").trim()}`, kind: "markets" as const }];
    });
  } catch {
    return [];
  }
}

async function publicHolidays(): Promise<AheadEvent[]> {
  const ics = await text("https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics");
  if (!ics) return [];
  return ics
    .replace(/\r/g, "")
    .split("BEGIN:VEVENT")
    .flatMap((ev) => {
      const date = ev.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/);
      const summary = ev.match(/\nSUMMARY:([^\n]+)/)?.[1];
      if (!date || !summary || !/DESCRIPTION:Public holiday/.test(ev)) return [];
      return [{ date: `${date[1]}-${date[2]}-${date[3]}`, label: summary.replace(/\\,/g, ","), kind: "holiday" as const }];
    });
}

async function ipos(): Promise<AheadEvent[]> {
  const board = await getIpoBoard().catch(() => []);
  return board.flatMap((ipo) => {
    const short = ipo.name.replace(/\s+(Limited|Ltd\.?)$/i, "");
    const url = ipo.gmpUrl ?? undefined;
    return [
      ...(ipo.open ? [{ date: ipo.open, label: `IPOs open: ${short}`, kind: "ipo" as const, url }] : []),
      ...(ipo.close ? [{ date: ipo.close, label: `IPOs close: ${short}`, kind: "ipo" as const, url }] : []),
      ...(ipo.listing && !ipo.listingEstimated ? [{ date: ipo.listing, label: `Listing: ${short}`, kind: "ipo" as const, url }] : []),
    ];
  });
}

async function f1(): Promise<AheadEvent[]> {
  const schedule = await getF1Schedule().catch(() => null);
  const race = schedule?.nextRace;
  if (!race) return [];
  const gp = race.name.replace(/\s*Grand Prix$/i, " GP");
  return (race.sessions ?? [])
    .filter((s) => /^(Sprint|Qualifying|Race)$/i.test(s.name))
    .map((s) => {
      const at = new Date(s.start);
      return { date: istDate(at), time: istTime(at), label: `${gp}: ${s.name.toLowerCase() === "race" ? "race" : s.name}`, kind: "f1" as const };
    });
}

/**
 * A busy IPO day lists half a dozen issues: one line per action per day,
 * the names joined ("Listing: Moneyview, A-One Steels"). One issue keeps
 * its own link.
 */
function groupIpos(events: AheadEvent[]): AheadEvent[] {
  const out: AheadEvent[] = [];
  const byKey = new Map<string, AheadEvent & { names: string[] }>();
  for (const e of events) {
    if (e.kind !== "ipo") {
      out.push(e);
      continue;
    }
    const [action, name] = e.label.split(": ");
    const key = `${e.date}|${action}`;
    const hit = byKey.get(key);
    if (hit) {
      hit.names.push(name);
      delete hit.url;
      continue;
    }
    const entry = { ...e, names: [name] };
    byKey.set(key, entry);
    out.push(entry);
  }
  return out.map((e) => {
    if (!("names" in e)) return e;
    const { names, ...rest } = e as AheadEvent & { names: string[] };
    const action = rest.label.split(": ")[0];
    // "IPOs open: X" reads wrong for one; "X IPO opens" instead.
    const label =
      names.length > 1
        ? `${action}: ${names.join(", ")}`
        : action === "Listing"
          ? `${names[0]} lists`
          : `${names[0]} IPO ${action === "IPOs open" ? "opens" : "closes"}`;
    return { ...rest, label };
  });
}

/** Seven days from today (IST), grouped by day, plus the next policy dates beyond. */
export async function getWeekAhead(now = new Date()): Promise<WeekAhead> {
  const today = istDate(now);
  const last = addDays(today, DAYS - 1);
  const lists = await Promise.all([Promise.resolve(rbi()), fomc(today), nseHolidays(), publicHolidays(), ipos(), f1()]);
  const all = lists.flat();

  // One line per thing: a public holiday that shuts the market reads once,
  // as the market closure.
  const seen = new Set<string>();
  const events = groupIpos(all
    .filter((e) => e.date >= today && e.date <= last)
    .filter((e) => {
      const k = `${e.date}|${e.label.replace(/^Markets shut: /, "").toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .filter((e) => !(e.kind === "holiday" && all.some((x) => x.kind === "markets" && x.date === e.date)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "00:00").localeCompare(b.time ?? "00:00")));

  const later = all
    .filter((e) => e.kind === "policy" && e.date > last && e.date <= addDays(today, 45))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2);

  return { from: today, to: last, events, later, at: now.toISOString() };
}
