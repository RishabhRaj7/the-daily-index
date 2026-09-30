import type { Commodity, CryptoQuote, MarketIndex, MarketMood, MarketRegion } from "@/lib/types";
import { getCnnFearGreed, getIbjaRates, getTickertapeMood, type IbjaRates, type PublishedMood } from "./published-markets";
import { withLastGood } from "./last-good";

// Yahoo Finance's spark endpoint requires no key, but does require a
// browser-like User-Agent or it 429s — this is the same unofficial-but-
// widely-used endpoint many open-source finance tools rely on.
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

type Spec = { id: string; symbol: string; name: string; market: MarketRegion };

// Four indices per region, so every region fills the same grid. India leads.
export const SYMBOLS: Spec[] = [
  { id: "nifty50",   symbol: "^NSEI",      name: "Nifty 50",       market: "India"  },
  { id: "sensex",    symbol: "^BSESN",     name: "Sensex",         market: "India"  },
  { id: "niftybank", symbol: "^NSEBANK",   name: "Nifty Bank",     market: "India"  },
  { id: "niftyit",   symbol: "^CNXIT",     name: "Nifty IT",       market: "India"  },
  { id: "sp500",     symbol: "^GSPC",      name: "S&P 500",        market: "US"     },
  { id: "dow",       symbol: "^DJI",       name: "Dow Jones",      market: "US"     },
  { id: "nasdaq",    symbol: "^IXIC",      name: "Nasdaq",         market: "US"     },
  { id: "russell",   symbol: "^RUT",       name: "Russell 2000",   market: "US"     },
  { id: "ftse",      symbol: "^FTSE",      name: "FTSE 100",       market: "Europe" },
  { id: "dax",       symbol: "^GDAXI",     name: "DAX",            market: "Europe" },
  { id: "cac",       symbol: "^FCHI",      name: "CAC 40",         market: "Europe" },
  { id: "stoxx50",   symbol: "^STOXX50E",  name: "Euro Stoxx 50",  market: "Europe" },
  { id: "nikkei",    symbol: "^N225",      name: "Nikkei 225",     market: "Asia"   },
  { id: "hangseng",  symbol: "^HSI",       name: "Hang Seng",      market: "Asia"   },
  { id: "shanghai",  symbol: "000001.SS",  name: "Shanghai",       market: "Asia"   },
  { id: "kospi",     symbol: "^KS11",      name: "KOSPI",          market: "Asia"   },
];

// Volatility gauges feed each region's mood; they are not shown as tiles.
const VOLATILITY: Partial<Record<MarketRegion, string>> = { India: "^INDIAVIX", US: "^VIX" };

// Commodities are priced in dollars abroad; the page shows rupees.
export const USD_INR = "INR=X";
const TROY_OZ_GRAMS = 31.1035;
const LB_PER_KG = 2.20462;
// Customs duty on gold and silver (6% since the July 2024 budget). Added so
// the figure tracks what the metal costs landed in India (the MCX price),
// not the bare international price. GST (3%) and making charges are not.
const BULLION_DUTY = 0.06;

type CommoditySpec = {
  id: string;
  symbol: string;
  name: string;
  unit: string;
  /** Dollar quote → rupees per unit, given USD/INR. */
  toInr: (usd: number, inr: number) => number;
  note: string;
};
export const COMMODITIES: CommoditySpec[] = [
  {
    id: "gold", symbol: "GC=F", name: "Gold", unit: "10 g",
    toInr: (usd, inr) => (usd / TROY_OZ_GRAMS) * 10 * inr * (1 + BULLION_DUTY),
    note: "COMEX gold in rupees, with 6% import duty (before GST)",
  },
  {
    id: "silver", symbol: "SI=F", name: "Silver", unit: "kg",
    toInr: (usd, inr) => (usd / TROY_OZ_GRAMS) * 1000 * inr * (1 + BULLION_DUTY),
    note: "COMEX silver in rupees, with 6% import duty (before GST)",
  },
  {
    id: "crude", symbol: "CL=F", name: "Crude oil", unit: "barrel",
    toInr: (usd, inr) => usd * inr,
    note: "WTI crude in rupees — the benchmark MCX crude follows",
  },
  {
    id: "natgas", symbol: "NG=F", name: "Natural gas", unit: "mmBtu",
    toInr: (usd, inr) => usd * inr,
    note: "Henry Hub gas in rupees",
  },
  {
    id: "copper", symbol: "HG=F", name: "Copper", unit: "kg",
    toInr: (usd, inr) => usd * LB_PER_KG * inr,
    note: "COMEX copper in rupees",
  },
];

interface SparkSeries {
  close?: (number | null)[];
  fulldayPrice?: number;
  fulldayChangePercent?: number;
  chartPreviousClose?: number;
  previousClose?: number;
}

function closes(series: SparkSeries | undefined): number[] {
  return (series?.close ?? []).filter((c): c is number => typeof c === "number");
}

function levelOf(series: SparkSeries | undefined): number | undefined {
  return series?.fulldayPrice ?? closes(series).at(-1);
}

/** Today's move: Yahoo's own figure, else the last two closes. */
function dayChange(series: SparkSeries | undefined): number | undefined {
  if (typeof series?.fulldayChangePercent === "number") return series.fulldayChangePercent;
  const c = closes(series);
  const level = levelOf(series);
  const prev = c.length >= 2 ? c[c.length - 2] : undefined;
  return typeof level === "number" && prev ? ((level - prev) / prev) * 100 : undefined;
}

function toIndex(spec: Spec, series: SparkSeries | undefined): MarketIndex | null {
  const validCloses = closes(series);
  const level = levelOf(series);
  const changePct = dayChange(series);
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

// Yahoo's spark endpoint answers up to 20 symbols per request; the board
// needs ~24, so it is asked in two batches at once.
async function fetchSpark(symbols: string[], revalidate: number): Promise<Record<string, SparkSeries>> {
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  const parts = await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${batch.map(encodeURIComponent).join(",")}&range=1mo&interval=1d`,
          { headers: { "User-Agent": BROWSER_UA }, next: { revalidate } },
        );
        return res.ok ? ((await res.json()) as Record<string, SparkSeries>) : {};
      } catch {
        return {};
      }
    }),
  );
  return Object.assign({}, ...parts);
}

function toCommodity(spec: CommoditySpec, series: SparkSeries | undefined, fx: SparkSeries | undefined): Commodity | null {
  const usd = levelOf(series);
  const inr = levelOf(fx);
  const change = dayChange(series);
  if (typeof usd !== "number" || typeof inr !== "number" || typeof change !== "number") return null;
  // The rupee moves too: the day's change in rupees combines both.
  const fxChange = dayChange(fx) ?? 0;
  const changePct = ((1 + change / 100) * (1 + fxChange / 100) - 1) * 100;
  const fxCloses = closes(fx);
  const spark = closes(series)
    .slice(-7)
    .map((c, i, arr) => spec.toInr(c, fxCloses[fxCloses.length - arr.length + i] ?? inr));
  const priceInr = spec.toInr(usd, inr);
  return {
    id: spec.id,
    name: spec.name,
    unit: spec.unit,
    priceInr,
    priceUsd: usd,
    changePct,
    sparkline: spark.length > 1 ? spark : [priceInr, priceInr],
    note: spec.note,
  };
}

function usdInr(fx: SparkSeries | undefined): Commodity | null {
  const level = levelOf(fx);
  const changePct = dayChange(fx);
  if (typeof level !== "number" || typeof changePct !== "number") return null;
  const spark = closes(fx).slice(-7);
  return {
    id: "usdinr",
    name: "US dollar",
    unit: "USD",
    priceInr: level,
    changePct,
    sparkline: spark.length > 1 ? spark : [level, level],
    note: "Rupees per dollar — up means a weaker rupee",
  };
}

const MOOD_LABELS = (score: number) =>
  score >= 75 ? "Extreme Greed" : score >= 60 ? "Greed" : score >= 40 ? "Neutral" : score >= 25 ? "Fear" : "Extreme Fear";

/**
 * One region's mood: the average move of its indices, nudged by breadth and,
 * where there is one, the day's change in its volatility index (fear rising
 * pulls the score down). Every input is shown under the gauge.
 */
function buildMood(region: MarketRegion, indices: MarketIndex[], vix?: SparkSeries): MarketMood {
  const avgChange = indices.reduce((sum, i) => sum + i.changePct, 0) / (indices.length || 1);
  const advancers = indices.filter((i) => i.changePct > 0).length;
  const breadth = indices.length ? advancers / indices.length - 0.5 : 0; // -0.5..0.5
  const vixLevel = levelOf(vix);
  const vixChange = dayChange(vix);

  let score = 50 + avgChange * 15 + breadth * 10;
  if (typeof vixChange === "number") score -= Math.max(-10, Math.min(10, vixChange * 0.6));
  score = Math.max(0, Math.min(100, Math.round(score)));

  const inputs = [
    { label: "Average move", value: `${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(2)}%` },
    { label: "Advancers", value: `${advancers} of ${indices.length} up` },
  ];
  if (typeof vixLevel === "number" && typeof vixChange === "number") {
    inputs.push({
      label: region === "India" ? "India VIX" : "VIX",
      value: `${vixLevel.toFixed(1)} (${vixChange >= 0 ? "+" : ""}${vixChange.toFixed(1)}%)`,
    });
  }
  return { region, score, label: MOOD_LABELS(score), inputs };
}

/**
 * A published index stands in for the formula where one exists (India:
 * Tickertape MMI, US: CNN Fear & Greed). Its own earlier readings replace
 * the formula's inputs; the volatility reading stays, since it's ours.
 */
function publishedMood(region: MarketRegion, published: PublishedMood, own: MarketMood): MarketMood {
  const vix = own.inputs.find((i) => /VIX/.test(i.label));
  return {
    region,
    score: Math.round(published.score),
    label: published.label,
    inputs: [...published.history.map((h) => ({ label: h.label, value: `${h.score.toFixed(1)}` })), ...(vix ? [vix] : [])],
    source: published.source,
  };
}

/** Gold and silver at IBJA's published rate, in place of the COMEX estimate. */
function ibjaCommodity(base: Commodity, rates: IbjaRates): Commodity {
  const gold = base.id === "gold";
  const price = gold ? rates.gold : rates.silver;
  const prev = gold ? rates.prevGold : rates.prevSilver;
  const history = gold ? rates.goldHistory : rates.silverHistory;
  const spark = history.slice(-7);
  if (spark.at(-1) !== price) spark.push(price);
  return {
    ...base,
    priceInr: price,
    changePct: prev ? ((price - prev) / prev) * 100 : base.changePct,
    sparkline: spark.length > 1 ? spark.slice(-7) : base.sparkline,
    note: `IBJA ${gold ? "999 gold" : "999 silver"} rate, ${rates.date} ${rates.session} — what jewellers and banks quote, before GST`,
    source: "IBJA",
    asOf: rates.asOf,
  };
}

export const MARKET_REGIONS: MarketRegion[] = ["India", "US", "Europe", "Asia"];

// Crypto in USDT from Binance's public market-data mirror (no key; the
// mirror answers from any region, unlike api.binance.com).
export const BINANCE = "https://data-api.binance.vision/api/v3";
export const CRYPTO_PAIRS: Array<{ id: string; name: string; pair: string }> = [
  { id: "btc", name: "Bitcoin", pair: "BTCUSDT" },
  { id: "eth", name: "Ethereum", pair: "ETHUSDT" },
];

async function fetchCrypto(revalidate: number): Promise<CryptoQuote[]> {
  try {
    const symbols = encodeURIComponent(JSON.stringify(CRYPTO_PAIRS.map((c) => c.pair)));
    const [tickerRes, ...klineRes] = await Promise.all([
      fetch(`${BINANCE}/ticker/24hr?symbols=${symbols}`, { next: { revalidate } }),
      ...CRYPTO_PAIRS.map((c) =>
        fetch(`${BINANCE}/klines?symbol=${c.pair}&interval=1d&limit=7`, { next: { revalidate: 3600 } }),
      ),
    ]);
    if (!tickerRes.ok) return [];
    const tickers = (await tickerRes.json()) as Array<Record<string, string>>;
    const klines = await Promise.all(klineRes.map((r) => (r.ok ? r.json() : Promise.resolve([]))));
    return CRYPTO_PAIRS.flatMap((c, i) => {
      const t = tickers.find((x) => x.symbol === c.pair);
      if (!t) return [];
      const price = Number(t.lastPrice);
      const spark = (klines[i] as string[][]).map((k) => Number(k[4])).filter(Number.isFinite);
      return [
        {
          id: c.id,
          name: c.name,
          pair: c.pair,
          price,
          changePct: Number(t.priceChangePercent),
          high24h: Number(t.highPrice),
          low24h: Number(t.lowPrice),
          sparkline: spark.length > 1 ? [...spark.slice(0, -1), price] : [price, price],
        },
      ];
    });
  } catch {
    return [];
  }
}

export interface LiveMarkets {
  indices: MarketIndex[];
  /** India's mood — kept for older readers of this shape. */
  mood: MarketMood;
  moods: MarketMood[];
  commodities: Commodity[];
  crypto: CryptoQuote[];
}

// Real numbers only — levels, changes and sparklines come straight from
// Yahoo Finance; India's and the US's moods are their published indices,
// Europe's and Asia's a transparent formula over the region's numbers; gold
// and silver are IBJA's rates. Partial is fine: one missing symbol never
// blanks the panel, and anything missing falls back to its last good
// reading, marked stale (lib/live/last-good.ts).
export async function getLiveMarkets(revalidate = 900): Promise<LiveMarkets | null> {
  return withLastGood(await readLiveMarkets(revalidate));
}

async function readLiveMarkets(revalidate: number): Promise<LiveMarkets | null> {
  const cryptoPromise = fetchCrypto(Math.min(revalidate, 60));
  const publishedPromise = Promise.all([
    getTickertapeMood(Math.max(revalidate, 600)),
    getCnnFearGreed(Math.max(revalidate, 600)),
    getIbjaRates(1800),
  ]);
  const data = await fetchSpark(
    [
      ...SYMBOLS.map((s) => s.symbol),
      ...Object.values(VOLATILITY),
      USD_INR,
      ...COMMODITIES.map((c) => c.symbol),
    ],
    revalidate,
  );
  const indices = SYMBOLS.map((spec) => toIndex(spec, data[spec.symbol])).filter(
    (i): i is MarketIndex => i !== null,
  );
  if (indices.length === 0) return null;

  const [tickertape, cnn, ibja] = await publishedPromise;
  const published: Partial<Record<MarketRegion, PublishedMood | null>> = { India: tickertape, US: cnn };
  const moods = MARKET_REGIONS.flatMap((region) => {
    const inRegion = indices.filter((i) => i.market === region);
    const vix = VOLATILITY[region];
    if (inRegion.length === 0) return [];
    const own = buildMood(region, inRegion, vix ? data[vix] : undefined);
    const pub = published[region];
    return [pub ? publishedMood(region, pub, own) : own];
  });

  const fx = data[USD_INR];
  const commodities = [
    ...COMMODITIES.map((spec) => toCommodity(spec, data[spec.symbol], fx)),
    usdInr(fx),
  ]
    .filter((c): c is Commodity => c !== null)
    .map((c) => (ibja && (c.id === "gold" || c.id === "silver") ? ibjaCommodity(c, ibja) : c));

  return { indices, mood: moods[0], moods, commodities, crypto: await cryptoPromise };
}
