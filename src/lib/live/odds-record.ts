import { getStore } from "@/lib/server/store";
import { DAY_KEY, type DaySnap } from "./odds";

// Straw Poll's track record: how often the markets' favourite a week before
// a question settled turned out right. Andaaza shows what markets think;
// this says how far to trust them.
//
// Each day the odds reader keeps every market's favourite (odds.ts
// snapshot). Once a day (the morning cron) this looks at questions that
// settled in the past month, finds the favourite seven days before, asks
// the exchange who actually won and keeps the verdict. A question already
// judged is never fetched again; at most 40 are checked a run.

const RECORD_KEY = "odds:record:v1";
const WINDOW_DAYS = 30;
const LEAD_DAYS = 7;
const PER_RUN = 40;

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

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Who won a settled question, as the exchange names it; null if not settled yet. */
export async function winnerOf(id: string): Promise<string | null> {
  if (id.startsWith("pm:")) {
    const events = await json<Array<{ closed?: boolean; markets?: Array<{ groupItemTitle?: string; outcomes?: string; outcomePrices?: string }> }>>(
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(id.slice(3))}`,
    );
    const e = events?.[0];
    if (!e?.closed || !e.markets?.length) return null;
    const parse = (v?: string) => {
      try {
        return JSON.parse(v ?? "[]") as string[];
      } catch {
        return [];
      }
    };
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

/** Judge the questions that settled since the last run. */
export async function updateOddsRecord(now = Date.now()): Promise<OddsRecord> {
  const store = getStore();
  const record = (await store.get<OddsRecord>(RECORD_KEY).catch(() => null)) ?? { updated: "", verdicts: [] };
  const judged = new Set(record.verdicts.map((v) => v.id));
  const days = Array.from({ length: WINDOW_DAYS + LEAD_DAYS }, (_, i) => day(now - i * 86_400_000));
  const snaps = await store.getMany<Record<string, DaySnap>>(days.map(DAY_KEY)).catch(() => new Map<string, Record<string, DaySnap>>());

  // Questions due in the window, with the favourite a week before they were due.
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
  }
  const cutoff = day(now - 90 * 86_400_000);
  const next: OddsRecord = {
    updated: new Date(now).toISOString(),
    verdicts: [...verdicts, ...record.verdicts].filter((v) => v.settled >= cutoff).slice(0, 400),
  };
  await store.set(RECORD_KEY, next, { ttlSeconds: 120 * 86_400 }).catch(() => {});
  return next;
}

/** The past month's score, once there are enough settled questions to mean something. */
export async function oddsRecordSummary(now = Date.now()): Promise<{ called: number; total: number } | null> {
  const record = await getStore().get<OddsRecord>(RECORD_KEY).catch(() => null);
  const recent = (record?.verdicts ?? []).filter((v) => v.settled >= day(now - WINDOW_DAYS * 86_400_000));
  if (recent.length < 10) return null;
  return { called: recent.filter((v) => v.called).length, total: recent.length };
}
