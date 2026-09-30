// Figures other people publish, read as published — never recalculated.
//
//   Tickertape's Market Mood Index (India) and CNN's Fear & Greed Index (US)
//   replace the paper's own mood formula for those two regions: each blends
//   flows, breadth, momentum and volatility with a published method, and
//   each gives the week- and month-ago readings for free. Europe and Asia
//   have no free published index, so they keep the paper's formula.
//
//   IBJA (India Bullion and Jewellers Association) publishes the benchmark
//   gold and silver rates Indian jewellers and banks quote, twice each
//   trading day. That replaces COMEX × USD/INR + 6% duty, an estimate.
//
// Every reader returns null on any failure; the caller falls back.

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface PublishedMood {
  score: number;
  label: string;
  source: { name: string; url: string; asOf: string };
  /** Earlier readings from the publisher, newest first. */
  history: Array<{ label: string; score: number }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Tickertape's own zones (tickertape.in/market-mood-index).
function tickertapeZone(score: number): string {
  return score < 30 ? "Extreme Fear" : score < 50 ? "Fear" : score < 70 ? "Greed" : "Extreme Greed";
}

export async function getTickertapeMood(revalidate = 900): Promise<PublishedMood | null> {
  try {
    const res = await fetch("https://api.tickertape.in/mmi/now", {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { date?: string; indicator?: number; lastDay?: { indicator?: number }; lastWeek?: { indicator?: number }; lastMonth?: { indicator?: number } };
    };
    const d = body.data;
    if (typeof d?.indicator !== "number" || d.indicator < 0 || d.indicator > 100) return null;
    const history = (
      [
        ["Yesterday", d.lastDay?.indicator],
        ["A week ago", d.lastWeek?.indicator],
        ["A month ago", d.lastMonth?.indicator],
      ] as Array<[string, number | undefined]>
    ).flatMap(([label, v]) => (typeof v === "number" ? [{ label, score: round1(v) }] : []));
    return {
      score: round1(d.indicator),
      label: tickertapeZone(d.indicator),
      source: { name: "Tickertape Market Mood Index", url: "https://www.tickertape.in/market-mood-index", asOf: d.date ?? new Date().toISOString() },
      history,
    };
  } catch {
    return null;
  }
}

// CNN answers only a request that looks like its own page; a bare one gets 418.
export async function getCnnFearGreed(revalidate = 900): Promise<PublishedMood | null> {
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json", Origin: "https://edition.cnn.com", Referer: "https://edition.cnn.com/" },
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      fear_and_greed?: { score?: number; rating?: string; timestamp?: string; previous_close?: number; previous_1_week?: number; previous_1_month?: number };
    };
    const f = body.fear_and_greed;
    if (typeof f?.score !== "number" || f.score < 0 || f.score > 100 || !f.rating) return null;
    const history = (
      [
        ["Previous close", f.previous_close],
        ["A week ago", f.previous_1_week],
        ["A month ago", f.previous_1_month],
      ] as Array<[string, number | undefined]>
    ).flatMap(([label, v]) => (typeof v === "number" ? [{ label, score: round1(v) }] : []));
    return {
      score: round1(f.score),
      label: f.rating.replace(/\b\w/g, (c) => c.toUpperCase()),
      source: { name: "CNN Fear & Greed Index", url: "https://edition.cnn.com/markets/fear-and-greed", asOf: f.timestamp ?? new Date().toISOString() },
      history,
    };
  } catch {
    return null;
  }
}

export interface IbjaRates {
  /** "DD/MM/YYYY" and session of the latest rate. */
  date: string;
  session: "AM" | "PM";
  /** Rupees per 10 g of 999 gold, and per kg of 999 silver. */
  gold: number;
  silver: number;
  /** The previous day's closing rates, for the day's change. */
  prevGold?: number;
  prevSilver?: number;
  /** Daily 999 rates, oldest first (about four months). */
  goldHistory: number[];
  silverHistory: number[];
  asOf: string;
}

interface IbjaRow {
  date: string;
  session: "AM" | "PM";
  gold: number;
  silver: number;
}

/** "29/09/2026" → sortable "2026-09-29". */
const isoOf = (dmy: string) => dmy.split("/").reverse().join("-");

export function parseIbja(html: string): IbjaRates | null {
  const rows: IbjaRow[] = [];
  for (const m of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = m[1];
    const head = row.match(/data-label="(AM|PM)"[^>]*>\s*<strong>(\d{2}\/\d{2}\/\d{4})<\/strong>/);
    const gold = Number(row.match(/data-label="Gold 999">\s*([\d.]+)/)?.[1]);
    const silver = Number(row.match(/data-label="Silver 999">\s*([\d.]+)/)?.[1]);
    if (!head || !gold || !silver) continue;
    rows.push({ session: head[1] as "AM" | "PM", date: head[2], gold, silver });
  }
  if (rows.length === 0) return null;
  // Newest first: date, then PM after AM.
  rows.sort((a, b) => isoOf(b.date).localeCompare(isoOf(a.date)) || (a.session === b.session ? 0 : a.session === "PM" ? -1 : 1));
  const latest = rows[0];
  // Sanity: per 10 g of gold and per kg of silver, in rupees.
  if (latest.gold < 30_000 || latest.gold > 500_000 || latest.silver < 30_000 || latest.silver > 1_000_000) return null;
  const prevDay = rows.find((r) => r.date !== latest.date);

  const hidden = (id: string): Record<string, unknown> | null => {
    const raw = html.match(new RegExp(`id="${id}" value="([^"]+)"`))?.[1];
    if (!raw) return null;
    try {
      return JSON.parse(raw.replace(/&quot;/g, '"')) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const series = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n > 0) : []);

  return {
    date: latest.date,
    session: latest.session,
    gold: latest.gold,
    silver: latest.silver,
    ...(prevDay ? { prevGold: prevDay.gold, prevSilver: prevDay.silver } : {}),
    goldHistory: series(hidden("HdnGold")?.purity999),
    silverHistory: series(hidden("HdnSilver")?.silverRate),
    // AM rates are published around 12:30 IST, PM around 17:00.
    asOf: `${isoOf(latest.date)}T${latest.session === "AM" ? "12:30" : "17:00"}:00+05:30`,
  };
}

export async function getIbjaRates(revalidate = 1800): Promise<IbjaRates | null> {
  try {
    const res = await fetch("https://ibjarates.com/", {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
      next: { revalidate },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? parseIbja(await res.text()) : null;
  } catch {
    return null;
  }
}
