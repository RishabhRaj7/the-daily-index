import type { MarketRegion } from "@/lib/types";

// When each market trades. Pure, so the server and the open page agree.
//
// Every index belongs to one exchange with its own hours (local time) and
// holidays. A region is open while any of its exchanges is; it reopens at
// the earliest next session among them. Lunch breaks (Tokyo, Hong Kong,
// Shanghai) count as open: prices simply hold still for an hour.
//
// Holidays arrive from the server (lib/live/market-holidays.ts) as local
// dates per exchange. Without them, weekends are still known and a holiday
// reads as a normal day.

export type Exchange = "NSE" | "NYSE" | "LSE" | "XETRA" | "EURONEXT" | "JPX" | "HKEX" | "SSE" | "KRX";

export const EXCHANGES: Record<Exchange, { tz: string; open: number; close: number; region: MarketRegion }> = {
  NSE: { tz: "Asia/Kolkata", open: 9 * 60 + 15, close: 15 * 60 + 30, region: "India" },
  NYSE: { tz: "America/New_York", open: 9 * 60 + 30, close: 16 * 60, region: "US" },
  LSE: { tz: "Europe/London", open: 8 * 60, close: 16 * 60 + 30, region: "Europe" },
  XETRA: { tz: "Europe/Berlin", open: 9 * 60, close: 17 * 60 + 30, region: "Europe" },
  EURONEXT: { tz: "Europe/Paris", open: 9 * 60, close: 17 * 60 + 30, region: "Europe" },
  JPX: { tz: "Asia/Tokyo", open: 9 * 60, close: 15 * 60 + 30, region: "Asia" },
  HKEX: { tz: "Asia/Hong_Kong", open: 9 * 60 + 30, close: 16 * 60, region: "Asia" },
  SSE: { tz: "Asia/Shanghai", open: 9 * 60 + 30, close: 15 * 60, region: "Asia" },
  KRX: { tz: "Asia/Seoul", open: 9 * 60, close: 15 * 60 + 30, region: "Asia" },
};

/** Which exchange sets each index's hours. */
export const INDEX_EXCHANGE: Record<string, Exchange> = {
  nifty50: "NSE",
  sensex: "NSE",
  niftybank: "NSE",
  niftyit: "NSE",
  sp500: "NYSE",
  dow: "NYSE",
  nasdaq: "NYSE",
  russell: "NYSE",
  ftse: "LSE",
  dax: "XETRA",
  cac: "EURONEXT",
  stoxx50: "XETRA",
  nikkei: "JPX",
  hangseng: "HKEX",
  shanghai: "SSE",
  kospi: "KRX",
};

/** Local dates ("2026-10-01") each exchange is shut, with the reason. */
export type HolidayMap = Partial<Record<Exchange, Record<string, string>>>;

export interface SessionState {
  open: boolean;
  /** When trading next starts; null while open. */
  nextOpen: number | null;
  /** Today's holiday, when that is why it is shut. */
  holiday?: string;
}

const PART_CACHE = new Map<string, Intl.DateTimeFormat>();
function local(tz: string, at: number): { date: string; weekday: string; minutes: number } {
  let f = PART_CACHE.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    PART_CACHE.set(tz, f);
  }
  const parts = f.formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

const tradingDay = (ex: Exchange, date: string, weekday: string, holidays: HolidayMap) =>
  weekday !== "Sat" && weekday !== "Sun" && !holidays[ex]?.[date];

export function exchangeState(ex: Exchange, at: number, holidays: HolidayMap = {}): SessionState {
  const { tz, open, close } = EXCHANGES[ex];
  const now = local(tz, at);
  const today = tradingDay(ex, now.date, now.weekday, holidays);
  if (today && now.minutes >= open && now.minutes < close) return { open: true, nextOpen: null };
  // Walk forward to the next trading day's opening minute. Stepping from the
  // current local minute keeps daylight-saving shifts right.
  let t = at + (today && now.minutes < open ? open - now.minutes : 24 * 60 - now.minutes + open) * 60_000;
  for (let i = 0; i < 20; i++) {
    const d = local(tz, t);
    if (tradingDay(ex, d.date, d.weekday, holidays)) {
      t += (open - d.minutes) * 60_000; // absorb any DST hour
      break;
    }
    t += 24 * 60 * 60_000;
  }
  return { open: false, nextOpen: Math.floor(t / 60_000) * 60_000, holiday: holidays[ex]?.[now.date] };
}

export function regionState(region: MarketRegion, at: number, holidays: HolidayMap = {}): SessionState {
  const states = (Object.keys(EXCHANGES) as Exchange[])
    .filter((ex) => EXCHANGES[ex].region === region)
    .map((ex) => exchangeState(ex, at, holidays));
  if (states.some((s) => s.open)) return { open: true, nextOpen: null };
  const next = Math.min(...states.map((s) => s.nextOpen ?? Infinity));
  // The holiday reason only when every exchange in the region shares it.
  const holiday = states.every((s) => s.holiday) ? states[0].holiday : undefined;
  return { open: false, nextOpen: Number.isFinite(next) ? next : null, holiday };
}

/** Whether an index's exchange is trading, or closed less than `graceMin`
 *  ago (so the closing print still arrives). */
export function indexLive(id: string, at: number, holidays: HolidayMap = {}, graceMin = 20): boolean {
  const ex = INDEX_EXCHANGE[id];
  if (!ex) return true;
  return exchangeState(ex, at, holidays).open || exchangeState(ex, at - graceMin * 60_000, holidays).open;
}

/** Commodities trade round the clock on weekdays (COMEX / ICE: Sunday 6 pm
 *  to Friday 5 pm New York). */
export function commoditiesLive(at: number): boolean {
  const ny = local("America/New_York", at);
  if (ny.weekday === "Sat") return false;
  if (ny.weekday === "Sun") return ny.minutes >= 18 * 60;
  if (ny.weekday === "Fri") return ny.minutes < 17 * 60 + 20;
  return true;
}

/** "19:00", "Thu 09:15" or "Mon 5 Oct 09:15" in the reader's own zone. */
export function reopenLabel(nextOpen: number, now: number): string {
  const d = new Date(nextOpen);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) return time;
  const days = (nextOpen - now) / 86_400_000;
  if (days < 6) return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}
