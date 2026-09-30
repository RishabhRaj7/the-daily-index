import type { Exchange, HolidayMap } from "@/lib/market-hours";

// The days each exchange is shut, for the next few months, so the page
// knows a closed market from an open one and when it reopens.
//
//   NSE              the exchange's own holiday list (holiday-master)
//   NYSE             computed: the exchange's fixed rules (Good Friday,
//                    Thanksgiving, weekend holidays moved to Fri/Mon…)
//   LSE              GOV.UK's England and Wales bank holidays
//   XETRA, EURONEXT  computed: New Year, Good Friday, Easter Monday,
//                    1 May, Christmas Eve to Boxing Day, New Year's Eve
//   JPX, HKEX,       Google's public holiday calendars for Japan, Hong
//   SSE, KRX         Kong, China and South Korea, plus the exchanges' own
//                    year-end closures
//
// Each list is fetched at most twice a day; one that fails is simply
// missing, and that market then reads as open on its holiday.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const REVALIDATE = 43_200;

async function get(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, next: { revalidate: REVALIDATE }, signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const dow = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Western Easter Sunday (Anonymous Gregorian algorithm). */
function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

/** The nth (1-based; -1 = last) given weekday of a month. */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = dow(iso(y, m, 1));
    return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDate = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = dow(iso(y, m, lastDate));
  return iso(y, m, lastDate - ((last - weekday + 7) % 7));
}

/** A fixed-date US holiday on a weekend moves to Friday or Monday. */
const observed = (date: string) => (dow(date) === 6 ? shift(date, -1) : dow(date) === 0 ? shift(date, 1) : date);

function nyse(years: number[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const y of years) {
    const add = (d: string, why: string) => (out[d] = why);
    // New Year's Day on a Saturday is not moved back into December.
    if (dow(iso(y, 1, 1)) !== 6) add(observed(iso(y, 1, 1)), "New Year's Day");
    add(nthWeekday(y, 1, 1, 3), "Martin Luther King Jr. Day");
    add(nthWeekday(y, 2, 1, 3), "Presidents' Day");
    add(shift(easter(y), -2), "Good Friday");
    add(nthWeekday(y, 5, 1, -1), "Memorial Day");
    add(observed(iso(y, 6, 19)), "Juneteenth");
    add(observed(iso(y, 7, 4)), "Independence Day");
    add(nthWeekday(y, 9, 1, 1), "Labor Day");
    add(nthWeekday(y, 11, 4, 4), "Thanksgiving");
    add(observed(iso(y, 12, 25)), "Christmas");
  }
  return out;
}

function continental(years: number[], xetra: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const y of years) {
    out[iso(y, 1, 1)] = "New Year's Day";
    out[shift(easter(y), -2)] = "Good Friday";
    out[shift(easter(y), 1)] = "Easter Monday";
    out[iso(y, 5, 1)] = "Labour Day";
    if (xetra) out[iso(y, 12, 24)] = "Christmas Eve";
    out[iso(y, 12, 25)] = "Christmas";
    out[iso(y, 12, 26)] = "Boxing Day";
    if (xetra) out[iso(y, 12, 31)] = "New Year's Eve";
  }
  return out;
}

async function nse(): Promise<Record<string, string> | null> {
  const body = await get("https://www.nseindia.com/api/holiday-master?type=trading", {
    Accept: "application/json",
    Referer: "https://www.nseindia.com/resources/exchange-communication-holidays",
  });
  if (!body) return null;
  try {
    const rows = (JSON.parse(body) as { CM?: Array<{ tradingDate?: string; description?: string }> }).CM ?? [];
    const out: Record<string, string> = {};
    for (const r of rows) {
      const d = r.tradingDate ? new Date(`${r.tradingDate} 12:00 UTC`) : null;
      if (d && !Number.isNaN(d.getTime())) out[d.toISOString().slice(0, 10)] = (r.description ?? "Holiday").replace(/\*+$/, "").trim();
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function ukBankHolidays(): Promise<Record<string, string> | null> {
  const body = await get("https://www.gov.uk/bank-holidays.json");
  if (!body) return null;
  try {
    const events = (JSON.parse(body) as Record<string, { events?: Array<{ date: string; title: string }> }>)["england-and-wales"]?.events ?? [];
    return Object.fromEntries(events.map((e) => [e.date, e.title]));
  } catch {
    return null;
  }
}

async function googleHolidays(calendar: string): Promise<Record<string, string> | null> {
  const ics = await get(`https://calendar.google.com/calendar/ical/en.${calendar}%23holiday%40group.v.calendar.google.com/public/basic.ics`);
  if (!ics) return null;
  const out: Record<string, string> = {};
  for (const ev of ics.replace(/\r/g, "").split("BEGIN:VEVENT")) {
    const date = ev.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/);
    const summary = ev.match(/\nSUMMARY:([^\n]+)/)?.[1];
    // Public holidays only: observances (and China's weekend make-up
    // working days) keep the exchange open.
    if (!date || !summary || !/DESCRIPTION:Public holiday/.test(ev) || /working day|workday/i.test(summary)) continue;
    out[`${date[1]}-${date[2]}-${date[3]}`] = summary.replace(/\\,/g, ",");
  }
  return Object.keys(out).length ? out : null;
}

function yearEnd(years: number[], days: Array<[number, number]>, why: string): Record<string, string> {
  return Object.fromEntries(years.flatMap((y) => days.map(([m, d]) => [iso(m === 1 ? y + 1 : y, m, d), why])));
}

/** Holidays from 7 days ago to about 5 months ahead, per exchange. */
export async function getMarketHolidays(now = new Date()): Promise<HolidayMap> {
  const y = now.getUTCFullYear();
  const years = [y, y + 1];
  const [nseDays, uk, jp, hk, cn, kr] = await Promise.all([
    nse(),
    ukBankHolidays(),
    googleHolidays("japanese"),
    googleHolidays("hong_kong"),
    googleHolidays("china"),
    googleHolidays("south_korea"),
  ]);
  const all: HolidayMap = {
    NYSE: nyse(years),
    XETRA: continental(years, true),
    EURONEXT: continental(years, false),
    ...(nseDays ? { NSE: nseDays } : {}),
    ...(uk ? { LSE: uk } : {}),
    ...(jp ? { JPX: { ...jp, ...yearEnd([y - 1, y], [[12, 31], [1, 2], [1, 3]], "Year-end holiday") } } : {}),
    ...(hk ? { HKEX: hk } : {}),
    ...(cn ? { SSE: cn } : {}),
    ...(kr ? { KRX: { ...kr, ...yearEnd([y - 1, y], [[12, 31]], "Year-end closing") } } : {}),
  };
  const from = shift(now.toISOString().slice(0, 10), -7);
  const to = shift(now.toISOString().slice(0, 10), 150);
  const out: HolidayMap = {};
  for (const [ex, days] of Object.entries(all) as Array<[Exchange, Record<string, string>]>) {
    out[ex] = Object.fromEntries(Object.entries(days).filter(([d]) => d >= from && d <= to));
  }
  return out;
}
