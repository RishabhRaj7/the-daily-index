import type { OddsRecordSummary } from "@/lib/types";
import { getStore } from "@/lib/server/store";
import { DAY_KEY, type DaySnap } from "./odds";

// Straw Poll's track record: how often the markets' favourite a week before
// a question settled turned out right. Andaaza shows what markets think;
// this says how far to trust them.
//
// Two sources, one verdict each question:
//   the paper's own   each day the odds reader keeps every market's
//                     favourite (odds.ts snapshot); once a question has
//                     settled, its favourite seven days before is judged
//   the past month    so the record doesn't start empty, the month's
//                     settled Polymarket questions in the reader's subjects
//                     (economy, geopolitics, AI, F1, elections…) are
//                     judged from Polymarket's own price history: each
//                     contender's price seven days before the end
// A question already judged is never fetched again. The morning cron runs
// it; the first visit with no record runs it once in the background.

const RECORD_KEY = "odds:record:v2";
const WINDOW_DAYS = 30;
const LEAD_DAYS = 7;
const PER_RUN = 40;
const PM = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

interface Verdict {
  id: string;
  title: string;
  favourite: string;
  chance: number;
  winner: string;
  called: boolean;
  settled: string;
}
export interface OddsRecord {
  updated: string;
  verdicts: Verdict[];
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const canon = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const same = (a: string, b: string) => {
  const x = canon(a);
  const y = canon(b);
  return x === y || (x.length > 4 && y.length > 4 && (x.includes(y) || y.includes(x)));
};
const parse = (v?: string) => {
  try {
    const a = JSON.parse(v ?? "[]");
    return Array.isArray(a) ? (a as string[]) : [];
  } catch {
    return [];
  }
};

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** Who won a settled question, as the exchange names it; null if not settled yet. */
export async function winnerOf(id: string): Promise<string | null> {
  if (id.startsWith("pm:")) {
    const events = await json<Array<{ closed?: boolean; markets?: Array<{ groupItemTitle?: string; outcomes?: string; outcomePrices?: string }> }>>(
      `${PM}/events?slug=${encodeURIComponent(id.slice(3))}`,
    );
    const e = events?.[0];
    if (!e?.closed || !e.markets?.length) return null;
    if (e.markets.length === 1) {
      const names = parse(e.markets[0].outcomes);
      const prices = parse(e.markets[0].outcomePrices).map(Number);
      const i = prices.findIndex((p) => p >= 0.99);
      return i >= 0 ? names[i] : null;
    }
    const won = e.markets.find((m) => Number(parse(m.outcomePrices)[0]) >= 0.99);
    return won?.groupItemTitle ?? null;
  }
  if (id.startsWith("ks:")) {
    const body = await json<{ markets?: Array<{ result?: string; yes_sub_title?: string; status?: string }> }>(
      `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(id.slice(3))}`,
    );
    const markets = body?.markets ?? [];
    if (markets.length === 0 || markets.some((m) => !m.result)) return null;
    if (markets.length === 1) return markets[0].result === "yes" ? "Yes" : "No";
    return markets.find((m) => m.result === "yes")?.yes_sub_title ?? null;
  }
  return null;
}

// ---- the past month, from Polymarket's history ------------------------------------------

// The reader's subjects, as Polymarket tags them.
const PAST_TAGS = ["economy", "geopolitics", "ai", "tech", "f1", "global-elections", "middle-east", "ukraine", "soccer"];
// Side bets and noise, as in the odds reader.
const SKIP = /\b(pole|podium|fastest lap|safety car|red flag|say|mention|tweet|attend|meet with|up or down|temperature|women|wta|nwsl|wsl|map \d|o\/u|over\/under|exact score|turnout|seats in)\b|\bvs\.?\b/i;

const DATED = /^(by |before )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}/i;

interface PastMarket { groupItemTitle?: string; outcomes?: string; outcomePrices?: string; clobTokenIds?: string; volume?: string; closedTime?: string }
interface PastEvent { slug: string; title: string; endDate?: string; volume?: number; closed?: boolean; markets?: PastMarket[] }

/** A token's price at a moment, from the CLOB's hourly history around it. */
async function priceAt(token: string, at: number): Promise<number | null> {
  const t = Math.floor(at / 1000);
  const body = await json<{ history?: Array<{ t: number; p: number }> }>(`${CLOB}/prices-history?market=${token}&startTs=${t - 6 * 3600}&endTs=${t + 6 * 3600}&fidelity=60`);
  const h = body?.history ?? [];
  if (h.length === 0) return null;
  return h.reduce((best, x) => (Math.abs(x.t - t) < Math.abs(best.t - t) ? x : best)).p;
}

async function judgePast(e: PastEvent): Promise<Verdict | null> {
  const markets = (e.markets ?? []).filter((m) => parse(m.clobTokenIds).length > 0);
  if (!e.closed || markets.length === 0 || !e.endDate) return null;
  const ended = Math.min(Date.parse(e.endDate), ...markets.map((m) => (m.closedTime ? Date.parse(m.closedTime.replace(" ", "T").replace(/\+00$/, "Z")) : Infinity)));
  if (!Number.isFinite(ended)) return null;
  const at = ended - LEAD_DAYS * 86_400_000;

  if (markets.length === 1) {
    const m = markets[0];
    const names = parse(m.outcomes);
    const final = parse(m.outcomePrices).map(Number);
    const w = final.findIndex((p) => p >= 0.99);
    const p = await priceAt(parse(m.clobTokenIds)[0], at);
    if (w < 0 || p == null) return null;
    const fav = p >= 0.5 ? 0 : 1;
    return {
      id: `pm:${e.slug}`,
      title: e.title.slice(0, 90),
      favourite: names[fav] ?? (fav === 0 ? "Yes" : "No"),
      chance: Math.round((fav === 0 ? p : 1 - p) * 1000) / 10,
      winner: names[w] ?? "",
      called: fav === w,
      settled: day(ended),
    };
  }
  // Several contenders, exactly one of whom wins. A deadline ladder ("…by
  // 31 Aug / 15 Sep / 30 Sep?") can come true on several rungs at once,
  // so it has no single favourite to judge.
  const winners = markets.filter((m) => Number(parse(m.outcomePrices)[0]) >= 0.99);
  if (winners.length !== 1 || /\bby\b\s*(\.\.\.|…|_+)?\??$/i.test(e.title) || markets.some((m) => DATED.test(m.groupItemTitle ?? ""))) return null;
  const won = winners[0];
  // The busiest six, priced a week out; the favourite is the dearest.
  const top = markets.sort((a, b) => Number(b.volume ?? 0) - Number(a.volume ?? 0)).slice(0, 6);
  const prices = await Promise.all(top.map((m) => priceAt(parse(m.clobTokenIds)[0], at)));
  let best = -1;
  prices.forEach((p, i) => {
    if (p != null && (best < 0 || p > (prices[best] ?? 0))) best = i;
  });
  if (best < 0 || (prices[best] ?? 0) < 0.2) return null;
  const favourite = top[best].groupItemTitle ?? "";
  return {
    id: `pm:${e.slug}`,
    title: e.title.slice(0, 90),
    favourite,
    chance: Math.round((prices[best] ?? 0) * 1000) / 10,
    winner: won.groupItemTitle ?? "",
    called: top[best] === won,
    settled: day(ended),
  };
}

async function pastMonth(now: number, judged: Set<string>): Promise<Verdict[]> {
  const min = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  const max = new Date(now).toISOString();
  const pages = await Promise.all(
    PAST_TAGS.map((tag) =>
      json<PastEvent[]>(`${PM}/events?tag_slug=${tag}&closed=true&order=volume&ascending=false&limit=8&end_date_min=${min}&end_date_max=${max}`),
    ),
  );
  const seen = new Set<string>();
  const events = pages
    .flat()
    .filter((e): e is PastEvent => !!e?.slug && !judged.has(`pm:${e.slug}`) && !SKIP.test(e.title) && (e.volume ?? 0) >= 100_000)
    .filter((e) => !seen.has(e.slug) && seen.add(e.slug))
    .slice(0, 45);
  const verdicts = await inBatches(events, 6, (e) => judgePast(e).catch(() => null));
  return verdicts.filter((v): v is Verdict => v !== null);
}

// ---- the record ---------------------------------------------------------------------

/** Judge the questions that settled since the last run. */
export async function updateOddsRecord(now = Date.now()): Promise<OddsRecord> {
  const store = getStore();
  const record = (await store.get<OddsRecord>(RECORD_KEY).catch(() => null)) ?? { updated: "", verdicts: [] };
  const judged = new Set(record.verdicts.map((v) => v.id));
  const days = Array.from({ length: WINDOW_DAYS + LEAD_DAYS }, (_, i) => day(now - i * 86_400_000));
  const snaps = await store.getMany<Record<string, DaySnap>>(days.map(DAY_KEY)).catch(() => new Map<string, Record<string, DaySnap>>());

  // The paper's own: questions due in the window, with the favourite a week before.
  const due = new Map<string, { snap: DaySnap; settled: string }>();
  for (const d of days) {
    for (const [id, s] of Object.entries(snaps.get(DAY_KEY(d)) ?? {})) {
      if (judged.has(id) || due.has(id) || !s.c) continue;
      const closes = Date.parse(s.c);
      if (!(closes < now && closes > now - WINDOW_DAYS * 86_400_000)) continue;
      const weekBefore = day(closes - LEAD_DAYS * 86_400_000);
      const then = snaps.get(DAY_KEY(weekBefore))?.[id];
      if (then) due.set(id, { snap: then, settled: day(closes) });
    }
  }
  const verdicts: Verdict[] = [];
  for (const [id, { snap, settled }] of [...due].slice(0, PER_RUN)) {
    const winner = await winnerOf(id);
    if (!winner) continue;
    // A yes/no question: the favourite is "Yes" above 50%, else "No".
    const favourite = snap.n === "Yes" ? (snap.p >= 50 ? "Yes" : "No") : snap.n;
    verdicts.push({ id, title: snap.t, favourite, chance: snap.n === "Yes" && snap.p < 50 ? 100 - snap.p : snap.p, winner, called: same(favourite, winner), settled });
    judged.add(id);
  }
  // The past month from Polymarket, for whatever the paper didn't see itself.
  verdicts.push(...(await pastMonth(now, judged).catch(() => [])));

  const cutoff = day(now - 90 * 86_400_000);
  const next: OddsRecord = {
    updated: new Date(now).toISOString(),
    verdicts: [...verdicts, ...record.verdicts]
      .filter((v) => v.settled >= cutoff)
      .sort((a, b) => b.settled.localeCompare(a.settled))
      .slice(0, 400),
  };
  await store.set(RECORD_KEY, next, { ttlSeconds: 120 * 86_400 }).catch(() => {});
  return next;
}

/** The past month's score, once there are enough settled questions to mean something. */
export async function oddsRecordSummary(now = Date.now()): Promise<OddsRecordSummary | null> {
  const record = await getStore().get<OddsRecord>(RECORD_KEY).catch(() => null);
  const recent = (record?.verdicts ?? []).filter((v) => v.settled >= day(now - WINDOW_DAYS * 86_400_000));
  if (recent.length < 10) return null;
  const bucket = (label: string, lo: number, hi: number) => {
    const list = recent.filter((v) => v.chance >= lo && v.chance < hi);
    return { label, called: list.filter((v) => v.called).length, total: list.length };
  };
  return {
    called: recent.filter((v) => v.called).length,
    total: recent.length,
    buckets: [bucket("Under 70%", 0, 70), bucket("70–90%", 70, 90), bucket("90%+", 90, 101)],
    recent: recent.slice(0, 24).map(({ title, favourite, chance, winner, called, settled }) => ({ title, favourite, chance, winner, called, settled })),
  };
}
