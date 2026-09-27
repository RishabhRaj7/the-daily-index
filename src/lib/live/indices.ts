import type { MarketIndex, MarketMood } from "@/lib/types";

// Yahoo Finance's chart endpoint requires no key, but does require a
// browser-like User-Agent or it 429s — this is the same unofficial-but-
// widely-used endpoint many open-source finance tools rely on.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const SYMBOLS: { id: string; symbol: string; name: string; market: "India" | "US" }[] = [
  { id: "nifty50",  symbol: "%5ENSEI",   name: "Nifty 50",          market: "India" },
  { id: "niftyit",  symbol: "%5ECNXIT",  name: "Nifty IT",          market: "India" },
  { id: "sensex",   symbol: "%5EBSESN",  name: "Sensex",            market: "India" },
  { id: "sp500",    symbol: "%5EGSPC",   name: "S&P 500",           market: "US"    },
  { id: "dow",      symbol: "%5EDJI",    name: "Dow Jones",         market: "US"    },
  { id: "nasdaq",   symbol: "%5EIXIC",   name: "Nasdaq Composite",  market: "US"    },
];

interface SparkSeries {
  close?: (number | null)[];
  fulldayPrice?: number;
  fulldayChangePercent?: number;
  chartPreviousClose?: number;
}

function toIndex(spec: (typeof SYMBOLS)[number], series: SparkSeries | undefined): MarketIndex | null {
  const validCloses = (series?.close ?? []).filter((c): c is number => typeof c === "number");
  const level = series?.fulldayPrice ?? validCloses.at(-1);
  const changePct =
    series?.fulldayChangePercent ??
    (typeof level === "number" && series?.chartPreviousClose
      ? ((level - series.chartPreviousClose) / series.chartPreviousClose) * 100
      : undefined);
  if (typeof level !== "number" || typeof changePct !== "number") return null;

  // 7-day change: price 7 trading sessions ago vs today
  const close7dAgo = validCloses.length >= 8 ? validCloses[validCloses.length - 8] : null;
  const change7d = close7dAgo != null ? ((level - close7dAgo) / close7dAgo) * 100 : null;

  // 1-month change: earliest close in the 1-month window vs today
  const close1mAgo = validCloses.length >= 2 ? validCloses[0] : null;
  const change1m = close1mAgo != null ? ((level - close1mAgo) / close1mAgo) * 100 : null;

  const sparkline = validCloses.slice(-7);
  const direction = changePct >= 0 ? "up" : "down";
  const narrative = `${spec.name} is trading at ${level.toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })}, ${direction} ${Math.abs(changePct).toFixed(2)}% today.`;

  return {
    id: spec.id,
    name: spec.name,
    symbol: spec.symbol,
    market: spec.market,
    level,
    changePct,
    change7d,
    change1m,
    sparkline: sparkline.length > 1 ? sparkline : [level, level],
    narrative,
  };
}

// One request for every index: Yahoo's spark endpoint returns each
// symbol's daily closes plus the live price and day change — the same
// figures the per-symbol chart endpoint gave in six separate calls.
async function fetchAllIndices(revalidate = 900): Promise<MarketIndex[]> {
  try {
    const symbols = SYMBOLS.map((s) => s.symbol).join(",");
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols}&range=1mo&interval=1d`,
      { headers: { "User-Agent": BROWSER_UA }, next: { revalidate } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, SparkSeries>;
    return SYMBOLS.map((spec) => toIndex(spec, data[decodeURIComponent(spec.symbol)])).filter(
      (i): i is MarketIndex => i !== null,
    );
  } catch {
    return [];
  }
}

function buildMood(indices: MarketIndex[]): MarketMood {
  const avgChange =
    indices.reduce((sum, i) => sum + i.changePct, 0) / (indices.length || 1);
  const advancers = indices.filter((i) => i.changePct > 0).length;

  const score = Math.max(0, Math.min(100, Math.round(50 + avgChange * 15)));
  const label =
    score >= 75 ? "Extreme Greed" :
    score >= 60 ? "Greed" :
    score >= 40 ? "Neutral" :
    score >= 25 ? "Fear" : "Extreme Fear";

  return {
    score,
    label,
    inputs: [
      { label: "Average change", value: `${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(2)}%` },
      { label: "Advancers", value: `${advancers} of ${indices.length} up` },
    ],
  };
}

export interface LiveMarkets {
  indices: MarketIndex[];
  mood: MarketMood;
}

// Real numbers only — level, % change, and sparkline all come straight from
// Yahoo Finance; the "mood" gauge is a transparent formula over those same
// numbers (average change + advancers/decliners), not an invented index.
// Partial is fine: one index missing no longer blanks the whole panel.
export async function getLiveMarkets(revalidate = 900): Promise<LiveMarkets | null> {
  const indices = await fetchAllIndices(revalidate);
  if (indices.length === 0) return null;
  return { indices, mood: buildMood(indices) };
}
