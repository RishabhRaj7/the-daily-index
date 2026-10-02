import type { FlowDay, RatesPanel } from "@/lib/types";
import { getStore } from "@/lib/server/store";
import { fomc, RBI_DECISIONS } from "./ahead";

// The rates row under Market Pulse's region tabs: the two policy rates that
// move Indian money, the world's benchmark yield, and which way foreign
// money went. Each part stands alone; one that fails is left out.
//
//   RBI repo      the RBI's own home page ("Policy Repo Rate : 5.25%")
//   Fed funds     the New York Fed's daily EFFR record (target range and
//                 when it last moved); FRED's series if that fails, and the
//                 last range kept if both do
//   US 10-year    Yahoo's ^TNX
//   FII / DII     NSE's daily cash-market figures; each day is kept, so the
//                 month's running total builds up from the days recorded

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function text(url: string, revalidate: number, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, next: { revalidate }, signal: AbortSignal.timeout(9000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const istDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

async function repo(): Promise<RatesPanel["repo"]> {
  const html = await text("https://www.rbi.org.in/", 21_600);
  const flat = html?.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const rate = Number(flat?.match(/Policy Repo Rate\s*:\s*([\d.]+)\s*%/i)?.[1]);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 20) return undefined;
  const today = istDate(new Date());
  const next = RBI_DECISIONS.find((d) => d >= today);
  return { rate, next: next ?? null };
}

/** The last value of a FRED series and the date it last changed. */
async function fredSeries(id: string): Promise<{ value: number; since: string; before: number | null } | null> {
  const csv = await text(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=2022-01-01`, 21_600);
  const rows = (csv ?? "")
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(","))
    .map(([d, v]) => ({ d, v: Number(v) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.d) && Number.isFinite(r.v));
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  let since = last.d;
  let i = rows.length - 2;
  for (; i >= 0 && rows[i].v === last.v; i--) since = rows[i].d;
  return { value: last.v, since, before: i >= 0 ? rows[i].v : null };
}

/** The target range and when it last moved, from the New York Fed's daily
 *  EFFR record (keyless, fast; each day carries the range in force). */
async function nyFed(): Promise<{ lower: number; upper: number; since: string; before: number | null } | null> {
  const end = istDate(new Date());
  const start = istDate(new Date(Date.now() - 400 * 86_400_000));
  const body = await text(`https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${start}&endDate=${end}`, 21_600);
  try {
    const rows = ((JSON.parse(body ?? "{}") as { refRates?: Array<{ effectiveDate: string; targetRateFrom: number; targetRateTo: number }> }).refRates ?? [])
      .filter((r) => Number.isFinite(r.targetRateFrom) && Number.isFinite(r.targetRateTo))
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    if (rows.length === 0) return null;
    const now = rows[0];
    let since = now.effectiveDate;
    let before: number | null = null;
    for (const r of rows) {
      if (r.targetRateTo !== now.targetRateTo || r.targetRateFrom !== now.targetRateFrom) {
        before = r.targetRateTo;
        break;
      }
      since = r.effectiveDate;
    }
    return { lower: now.targetRateFrom, upper: now.targetRateTo, since, before };
  } catch {
    return null;
  }
}

/** FRED's target series, as a second source (it is often slow to answer). */
async function fred(): Promise<{ lower: number; upper: number; since: string; before: number | null } | null> {
  const [lo, hi] = await Promise.all([fredSeries("DFEDTARL"), fredSeries("DFEDTARU")]);
  if (!lo || !hi) return null;
  // The range last moved when either end did.
  return { lower: lo.value, upper: hi.value, since: lo.since > hi.since ? lo.since : hi.since, before: hi.before };
}

const FED_KEY = "rates:fed:v1";

async function fed(): Promise<RatesPanel["fed"]> {
  const [range, meetings] = await Promise.all([
    nyFed().then((r) => r ?? fred()),
    fomc(istDate(new Date())).catch(() => []),
  ]);
  const store = getStore();
  // Both sources down: the last range read (it changes eight times a year at most).
  const got = range ?? (await store.get<NonNullable<Awaited<ReturnType<typeof nyFed>>>>(FED_KEY).catch(() => null));
  if (!got) return undefined;
  if (range) await store.set(FED_KEY, range, { ttlSeconds: 60 * 86_400 }).catch(() => {});
  const today = istDate(new Date());
  const next = meetings.map((m) => m.date).filter((d) => d >= today).sort()[0] ?? null;
  const move = got.before == null ? null : got.upper < got.before ? "cut" : got.upper > got.before ? "hike" : null;
  return { lower: got.lower, upper: got.upper, since: got.since, move, next };
}

async function us10y(): Promise<RatesPanel["us10y"]> {
  const body = await text("https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=5d&interval=1d", 900);
  try {
    const meta = (JSON.parse(body ?? "{}") as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }> } })
      .chart?.result?.[0]?.meta;
    const y = meta?.regularMarketPrice;
    const prev = meta?.previousClose ?? meta?.chartPreviousClose;
    if (typeof y !== "number" || y <= 0 || y > 20) return undefined;
    return { yield: Math.round(y * 100) / 100, change: typeof prev === "number" ? Math.round((y - prev) * 100) / 100 : null };
  } catch {
    return undefined;
  }
}

const MONTH = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" } as const;

async function flows(): Promise<RatesPanel["flows"]> {
  const body = await text("https://www.nseindia.com/api/fiidiiTradeReact", 1800, {
    Accept: "application/json",
    Referer: "https://www.nseindia.com/reports/fii-dii",
  });
  let rows: Array<{ category?: string; date?: string; buyValue?: string; sellValue?: string; netValue?: string }>;
  try {
    rows = JSON.parse(body ?? "[]");
    if (!Array.isArray(rows)) return undefined;
  } catch {
    return undefined;
  }
  const fiiRow = rows.find((r) => /fii|fpi/i.test(r.category ?? ""));
  const diiRow = rows.find((r) => /dii/i.test(r.category ?? ""));
  const m = (fiiRow?.date ?? diiRow?.date ?? "").match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!fiiRow || !diiRow || !m) return undefined;
  const date = `${m[3]}-${MONTH[m[2] as keyof typeof MONTH]}-${m[1]}`;
  const flow = (r: typeof fiiRow): FlowDay | null => {
    const buy = Number(r.buyValue);
    const sell = Number(r.sellValue);
    const net = Number(r.netValue);
    return Number.isFinite(net) ? { buy: Number.isFinite(buy) ? buy : 0, sell: Number.isFinite(sell) ? sell : 0, net } : null;
  };
  const fii = flow(fiiRow);
  const dii = flow(diiRow);
  if (!fii || !dii) return undefined;

  // Keep each trading day, then add up the month from what's kept.
  const store = getStore();
  await store.set(`fiidii:v1:${date}`, { fii: fii.net, dii: dii.net, fiiDay: fii, diiDay: dii }, { ttlSeconds: 45 * 86_400 }).catch(() => {});
  const month = date.slice(0, 7);
  const dates = Array.from({ length: 31 }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const kept = await store
    .getMany<{ fii: number; dii: number }>(dates.map((d) => `fiidii:v1:${d}`))
    .catch(() => new Map<string, { fii: number; dii: number }>());
  const days = dates.flatMap((d) => {
    const k = kept.get(`fiidii:v1:${d}`);
    return k ? [{ date: d, fii: k.fii, dii: k.dii }] : [];
  });
  return {
    date,
    fii,
    dii,
    month: days.length >= 2 ? { fii: days.reduce((s, d) => s + d.fii, 0), dii: days.reduce((s, d) => s + d.dii, 0), days: days.length } : null,
    days,
  };
}

export async function getRates(): Promise<RatesPanel> {
  const [r, f, y, fl] = await Promise.all([repo(), fed(), us10y(), flows()]);
  return { repo: r, fed: f, us10y: y, flows: fl, at: new Date().toISOString() };
}
