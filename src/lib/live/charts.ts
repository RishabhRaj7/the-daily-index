// Price history for the market detail charts: any index or commodity tile
// (Yahoo Finance) or crypto tile (Binance), over six ranges. Commodities are
// converted to rupees bar by bar with the USD/INR rate of the same moment,
// so the chart matches the rupee price on the tile.

import type { PriceBar } from "@/lib/types";
import { BINANCE, BROWSER_UA, COMMODITIES, CRYPTO_PAIRS, SYMBOLS, USD_INR } from "./indices";
import { getIbjaRates } from "./published-markets";

export type ChartRange = "1D" | "5D" | "1M" | "6M" | "1Y" | "5Y";
export const CHART_RANGES: ChartRange[] = ["1D", "5D", "1M", "6M", "1Y", "5Y"];
export type ChartKind = "index" | "commodity" | "crypto";

const YAHOO: Record<ChartRange, { range: string; interval: string; revalidate: number }> = {
  "1D": { range: "1d", interval: "5m", revalidate: 60 },
  "5D": { range: "5d", interval: "15m", revalidate: 300 },
  "1M": { range: "1mo", interval: "60m", revalidate: 900 },
  "6M": { range: "6mo", interval: "1d", revalidate: 3600 },
  "1Y": { range: "1y", interval: "1d", revalidate: 3600 },
  "5Y": { range: "5y", interval: "1wk", revalidate: 21600 },
};

const BINANCE_RANGE: Record<ChartRange, { interval: string; limit: number; revalidate: number }> = {
  "1D": { interval: "5m", limit: 288, revalidate: 60 },
  "5D": { interval: "30m", limit: 240, revalidate: 300 },
  "1M": { interval: "4h", limit: 180, revalidate: 900 },
  "6M": { interval: "1d", limit: 183, revalidate: 3600 },
  "1Y": { interval: "1d", limit: 365, revalidate: 3600 },
  "5Y": { interval: "1w", limit: 261, revalidate: 21600 },
};

export interface ChartData {
  name: string;
  /** What a price is quoted in: "₹ per 10 g", "USDT", "points". */
  unit: string;
  bars: PriceBar[];
  /** The close before the range's first bar (intraday: yesterday's close). */
  previousClose: number | null;
  hasVolume: boolean;
  note?: string;
  /** The official rate the tile prints, when the chart's live line differs
   *  from it (gold and silver: IBJA's rate and when it was published). */
  reference?: { label: string; value: number; asOf: string };
}

interface YahooResult {
  meta?: { chartPreviousClose?: number; previousClose?: number; gmtoffset?: number };
  timestamp?: number[];
  indicators?: { quote?: Array<Record<"open" | "high" | "low" | "close" | "volume", (number | null)[]>> };
}

async function yahooRaw(symbol: string, range: string, interval: string, revalidate: number): Promise<YahooResult | null> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
    { headers: { "User-Agent": BROWSER_UA }, next: { revalidate } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.chart?.result?.[0] ?? null;
}

async function yahoo(symbol: string, range: ChartRange): Promise<YahooResult | null> {
  const r = YAHOO[range];
  const result = await yahooRaw(symbol, r.range, r.interval, r.revalidate);
  if (range !== "1D" || (result && toBars(result).length > 0)) return result;
  // A closed day (a holiday, a weekend) has no bars for "1d": show the last
  // session instead, from five days of five-minute bars, against the close
  // before it.
  const week = await yahooRaw(symbol, "5d", "5m", 300);
  const ts = week?.timestamp ?? [];
  const q = week?.indicators?.quote?.[0];
  if (!week || !q || ts.length === 0) return result;
  const offset = week.meta?.gmtoffset ?? 0;
  const day = (t: number) => Math.floor((t + offset) / 86400);
  // The last day with a real bar (a closed day can carry an empty stub).
  const lastReal = [...ts.keys()].reverse().find((i) => typeof q.close?.[i] === "number");
  if (lastReal == null) return result;
  const lastDay = day(ts[lastReal]);
  const from = ts.findIndex((t) => day(t) === lastDay);
  const prior = q.close?.slice(0, from).filter((c): c is number => typeof c === "number").at(-1);
  const pick = <T,>(arr: T[] | undefined) => arr?.slice(from);
  return {
    meta: { ...week.meta, chartPreviousClose: prior ?? week.meta?.chartPreviousClose },
    timestamp: ts.slice(from),
    indicators: {
      quote: [
        {
          open: pick(q.open) ?? [],
          high: pick(q.high) ?? [],
          low: pick(q.low) ?? [],
          close: pick(q.close) ?? [],
          volume: pick(q.volume) ?? [],
        },
      ],
    },
  };
}

function toBars(result: YahooResult): PriceBar[] {
  const q = result.indicators?.quote?.[0];
  const ts = result.timestamp ?? [];
  if (!q) return [];
  const bars: PriceBar[] = [];
  ts.forEach((t, i) => {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if ([o, h, l, c].every((v) => typeof v === "number")) {
      bars.push({ t, o: o!, h: h!, l: l!, c: c!, ...(typeof q.volume?.[i] === "number" ? { v: q.volume![i]! } : {}) });
    }
  });
  return bars;
}

export async function getChart(kind: ChartKind, id: string, range: ChartRange): Promise<ChartData | null> {
  if (kind === "index") {
    const spec = SYMBOLS.find((s) => s.id === id);
    if (!spec) return null;
    const result = await yahoo(spec.symbol, range);
    if (!result) return null;
    const bars = toBars(result);
    return {
      name: spec.name,
      unit: "points",
      bars,
      previousClose: result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? null,
      hasVolume: bars.some((b) => (b.v ?? 0) > 0),
    };
  }

  if (kind === "commodity") {
    const spec = COMMODITIES.find((c) => c.id === id);
    if (id === "usdinr") {
      const result = await yahoo(USD_INR, range);
      if (!result) return null;
      return {
        name: "US dollar",
        unit: "₹ per USD",
        bars: toBars(result),
        previousClose: result.meta?.chartPreviousClose ?? null,
        hasVolume: false,
        note: "Up means a weaker rupee.",
      };
    }
    if (!spec) return null;
    const bullion = spec.id === "gold" || spec.id === "silver";
    const [asset, fx, ibja] = await Promise.all([
      yahoo(spec.symbol, range),
      yahoo(USD_INR, range),
      bullion ? getIbjaRates(1800) : Promise.resolve(null),
    ]);
    if (!asset) return null;
    const fxBars = fx ? toBars(fx) : [];
    const lastFx = fxBars.at(-1)?.c ?? null;
    if (!lastFx) return null;
    // Each bar is converted at the latest rupee rate at or before it.
    let j = 0;
    const rateAt = (t: number) => {
      while (j + 1 < fxBars.length && fxBars[j + 1].t <= t) j++;
      return fxBars[j] && fxBars[j].t <= t ? fxBars[j].c : (fxBars[0]?.c ?? lastFx);
    };
    let bars = toBars(asset).map((b) => {
      const r = rateAt(b.t);
      return { t: b.t, o: spec.toInr(b.o, r), h: spec.toInr(b.h, r), l: spec.toInr(b.l, r), c: spec.toInr(b.c, r) };
    });
    const prev = asset.meta?.chartPreviousClose;
    let previousClose = typeof prev === "number" ? spec.toInr(prev, fxBars[0]?.c ?? lastFx) : null;

    // Gold and silver: the tile prints IBJA's rate, which sits above COMEX in
    // rupees (duty, GST-free bar premium, the local market). IBJA has no
    // intraday history, so the COMEX line is pegged to it: scaled so it
    // reads IBJA's rate at the moment IBJA published it. The level then
    // matches the tile; the movement since is COMEX's.
    let note = spec.note;
    let reference: ChartData["reference"];
    if (bullion && ibja && bars.length > 0) {
      const rate = spec.id === "gold" ? ibja.gold : ibja.silver;
      const at = Date.parse(ibja.asOf) / 1000;
      // COMEX in rupees when IBJA published: from this range when it covers
      // that moment, else from the five-day series (a 1D chart on a day IBJA
      // hasn't published yet starts after it).
      let anchor = [...bars].reverse().find((b) => b.t <= at)?.c;
      if (anchor == null && range !== "5D") {
        const [a5, f5] = await Promise.all([yahoo(spec.symbol, "5D"), yahoo(USD_INR, "5D")]);
        const bar = a5 ? [...toBars(a5)].reverse().find((b) => b.t <= at) : undefined;
        const fxAt = f5 ? [...toBars(f5)].reverse().find((b) => b.t <= at)?.c : undefined;
        if (bar && fxAt) anchor = spec.toInr(bar.c, fxAt);
      }
      const k = anchor ? rate / anchor : NaN;
      if (Number.isFinite(k) && k > 0.8 && k < 1.3) {
        bars = bars.map((b) => ({ t: b.t, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k }));
        if (previousClose != null) previousClose *= k;
        const when = new Date(ibja.asOf).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
        reference = { label: "IBJA rate · the price on the card", value: rate, asOf: ibja.asOf };
        note = `Pegged to IBJA's 999 rate of ₹${rate.toLocaleString("en-IN")} (${when} IST, the price on the tile); moves since then follow COMEX ${spec.id} in rupees. Longer ranges carry today's premium back, so years ago read approximate.`;
      }
    }
    return {
      name: spec.name,
      unit: `₹ per ${spec.unit}`,
      bars,
      previousClose,
      hasVolume: false,
      note,
      reference,
    };
  }

  const pair = CRYPTO_PAIRS.find((c) => c.id === id);
  if (!pair) return null;
  const r = BINANCE_RANGE[range];
  const res = await fetch(`${BINANCE}/klines?symbol=${pair.pair}&interval=${r.interval}&limit=${r.limit}`, {
    next: { revalidate: r.revalidate },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<[number, string, string, string, string, string]>;
  const bars = rows.map((k) => ({
    t: Math.floor(k[0] / 1000),
    o: Number(k[1]),
    h: Number(k[2]),
    l: Number(k[3]),
    c: Number(k[4]),
    v: Number(k[5]),
  }));
  return { name: pair.name, unit: "USDT", bars, previousClose: bars[0]?.o ?? null, hasVolume: true };
}
