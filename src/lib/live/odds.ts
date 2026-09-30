import type { OddsMarket, OddsSubject, OddsUniverse } from "@/lib/types";
import { getStore } from "@/lib/server/store";

// Straw Poll: what the prediction markets think, read for this reader only.
//
// Andaaza (thefirstparth/andaaza) reads the 400 busiest markets and crawls
// all 12,000 of Kalshi's events, then throws most of it away. This asks
// only for what the reader could care about:
//
//   Polymarket   the busiest events in each subject's own tags (f1, soccer,
//                ai, economy, geopolitics…), plus a search for each name the
//                reader follows. Keyless public API; the site needs a VPN in
//                India, the API does not.
//   Kalshi       the series that fit a subject (Fed and RBI decisions, F1
//                races, league titles, best AI model…), found from Kalshi's
//                own series list once a week (no hand-kept tickers to go
//                stale) and re-read by series. Kalshi turns away bursts, so
//                its calls go three at a time, each retried.
//
// Every upstream call sits in Next's data cache for a quarter of an hour:
// a visitor gets the cached reading at once and the next one is read in the
// background, so nobody waits and no scheduled job is needed.
//
// Noise rules, from andaaza's hard-won list: all-but-settled questions
// (98.5%+, or 95%+ once past their due date), side bets (maps, props,
// handicaps), price ladders ("↑ $120"), and what the reader said no to —
// US state and local politics, crypto, awards and culture.
//
// The page decides what to print (lib/odds-pick.ts): this returns every
// candidate, classified and cleaned.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const REVALIDATE = 900;
const PM = "https://gamma-api.polymarket.com";
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

async function json<T>(url: string, revalidate = REVALIDATE, timeout = 9000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate },
      signal: AbortSignal.timeout(timeout),
    });
    if (res.status === 429) throw new Error("429");
    return res.ok ? ((await res.json()) as T) : null;
  } catch (e) {
    if (e instanceof Error && e.message === "429") throw e;
    return null;
  }
}

/** Kalshi refuses a few calls in any burst: try again after 0.5, 1 and 2 s. */
async function kalshiJson<T>(url: string, revalidate = REVALIDATE): Promise<T | null> {
  for (let t = 0; t < 4; t++) {
    try {
      return await json<T>(url, revalidate);
    } catch {
      await new Promise((r) => setTimeout(r, 500 * 2 ** t));
    }
  }
  return null;
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const arr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  try {
    const a = JSON.parse(String(v ?? "[]"));
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
};

// ---- what the reader never wants -------------------------------------------------------

const US_STATES =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";

// US politics below the national level, what-will-X-say markets, crypto,
// awards and culture, weather, other esports.
const EXCLUDE = new RegExp(
  [
    "\\bgovernor\\b", "\\bmayor", "\\bstate (senate|house|assembly)", "\\bprimary\\b", "\\bprimaries\\b", "\\bnominee\\b", "\\bnomination\\b",
    "\\bapproval rating", "\\bapproval\\b.*\\btrump", "\\bwill .* say\\b", "\\bsay .* during\\b", "\\btweets?\\b", "\\bposts?\\b.*\\btimes\\b", "\\bmention",
    "\\bbitcoin\\b", "\\bbtc\\b", "\\bethereum\\b", "\\bsolana\\b", "\\bxrp\\b", "\\bcrypto", "\\bmemecoin", "\\bdoge",
    "\\bnobel\\b", "\\boscars?\\b", "\\bgrammys?\\b", "\\bemmys?\\b", "person of the year", "\\beurovision\\b", "\\bbox office\\b", "\\balbum\\b", "\\bbillboard\\b", "\\bspotify\\b",
    "\\bhurricane\\b", "\\btemperature\\b", "\\bweather\\b", "\\bearthquake\\b",
    "\\bdota\\b", "\\bcounter-strike\\b", "\\bcs2\\b", "\\bleague of legends\\b", "\\blol:", "\\boverwatch\\b", "\\brocket league\\b",
    "\\bnfl\\b", "\\bnba\\b", "\\bmlb\\b", "\\bnhl\\b", "\\bwnba\\b", "\\bncaa", "\\bufc\\b", "\\bboxing\\b", "\\bgolf\\b", "\\bpga\\b",
    "\\bup or down\\b", "\\bhighest temperature\\b",
    // State bills and races are state politics, whatever the subject.
    `\\b(${US_STATES}) (enacts?|passes|bans|legali[sz]es|governor|senate|house|legislature)\\b`,
  ].join("|"),
  "i",
);

// Price ladders and props are not questions a reader follows.
const LADDER = /^[↑↓]|^[<>≥≤]|^\$?[\d,.]+\s*[kmb%]?\+?$|^(over|under|above|below|between)\b|\bor (more|higher|lower|less)\b/i;
const PROP = /\b(map \d|set \d|game \d|first blood|most kills|total (maps|kills|overtimes|goals|points)|exact score|correct score|handicap|o\/u|over\/under|to score|anytime|fastest lap|pole|podium|top \d finish|winning margin|halftime|both teams)\b/i;

// ---- subjects ----------------------------------------------------------------------------

const SUBJECT_RULES: Array<[OddsSubject, RegExp]> = [
  ["valorant", /\bvalorant\b|\bvct\b/i],
  ["f1", /\b(f1|formula 1|formula one|grand prix|drivers'? champion|constructors'? champion)\b/i],
  ["tennis", /\b(atp|wimbledon|us open|french open|roland garros|australian open|djokovic|alcaraz|sinner|zverev|medvedev|men's singles)\b/i],
  ["football", /\b(premier league|la liga|laliga|champions league|europa league|ballon d'or|serie a|bundesliga|ligue 1|uefa|fifa|world cup|el cl[aá]sico|real madrid|barcelona|arsenal|liverpool|manchester|chelsea|bayern|psg)\b/i],
  ["money", /\b(fed|federal reserve|fomc|interest rates?|rate (cut|hike)|rbi|repo rate|inflation|cpi|recession|gdp|oil|crude|brent|wti|gold|silver|rupee|usd\/inr|nifty|sensex|s&p|nasdaq|dow jones|largest company|market cap|ipo|earnings|tariffs?|stock market)\b/i],
  ["tech", /\b(ai|a\.i\.|openai|anthropic|gemini|chatgpt|gpt-?\d|claude|grok|llm|deepseek|nvidia|apple|google|alphabet|microsoft|meta|tesla|spacex|starship|iphone|model)\b/i],
  ["india", /\b(india|indian|modi|bjp|lok sabha|rajya sabha|bihar|kerala|tamil nadu|west bengal|kolkata|delhi|mumbai|pakistan)\b/i],
  ["world", /./],
];

function subjectOf(text: string, tagHint?: OddsSubject): OddsSubject {
  if (tagHint && tagHint !== "world") {
    // A tag names the subject, unless the words say it is India's.
    if (tagHint === "money" || tagHint === "tech") return /\b(rbi|nifty|sensex|rupee)\b/i.test(text) ? "money" : tagHint;
    return tagHint;
  }
  return SUBJECT_RULES.find(([, re]) => re.test(text))?.[0] ?? "world";
}

// Polymarket tags per subject; the busiest thirty events of each.
const PM_TAGS: Array<[string, OddsSubject]> = [
  ["f1", "f1"],
  ["soccer", "football"],
  ["tennis", "tennis"],
  ["valorant", "valorant"],
  ["ai", "tech"],
  ["tech", "tech"],
  ["economy", "money"],
  ["finance", "money"],
  ["ipos", "money"],
  ["india", "india"],
  ["geopolitics", "world"],
  ["global-elections", "world"],
  ["middle-east", "world"],
  ["ukraine", "world"],
];

// ---- Polymarket -----------------------------------------------------------------------------

interface PmMarket {
  question?: string;
  groupItemTitle?: string;
  outcomes?: string;
  outcomePrices?: string;
  sportsMarketType?: string;
  active?: boolean;
  closed?: boolean;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  spread?: number;
  bestBid?: number;
  bestAsk?: number;
  endDate?: string;
  clobTokenIds?: string;
}
interface PmEvent {
  slug: string;
  title: string;
  description?: string;
  endDate?: string;
  volume?: number;
  volume24hr?: number;
  tags?: Array<{ label?: string; slug?: string }>;
  markets?: PmMarket[];
}

const MONTH_ITEM = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(, \d{4})?$/i;

function fromPolymarket(e: PmEvent, hint?: OddsSubject): OddsMarket | null {
  if (!e?.slug || / - more markets$/i.test(e.title)) return null;
  let mk = (e.markets ?? []).filter((m) => m.active !== false && m.closed !== true);
  // A match or race: only its result market.
  if (mk.some((m) => m.sportsMarketType === "moneyline")) mk = mk.filter((m) => m.sportsMarketType === "moneyline");
  else mk = mk.filter((m) => !m.sportsMarketType || /(^|_)(race_)?winner$|champion/.test(m.sportsMarketType));
  mk = mk.filter((m) => !PROP.test(`${m.groupItemTitle ?? ""} ${m.question ?? ""}`));
  if (mk.length === 0) return null;

  const spread = (m: PmMarket) => {
    const s = num(m.spread);
    const b = num(m.bestBid);
    const a = num(m.bestAsk);
    return s != null ? s * 100 : a != null && b != null ? (a - b) * 100 : null;
  };

  let rows: Array<{ name: string; prob: number; d1: number | null; w1: number | null; sp: number | null; token?: string; at?: number }>;
  let ladder = false;
  if (mk.length === 1) {
    const m = mk[0];
    const names = arr(m.outcomes);
    const p = arr(m.outcomePrices).map(Number);
    const tokens = arr(m.clobTokenIds);
    rows =
      names[0] === "Yes"
        ? [{ name: "Yes", prob: p[0] * 100, d1: num(m.oneDayPriceChange), w1: num(m.oneWeekPriceChange), sp: spread(m), token: tokens[0] }]
        : names.map((n, i) => ({
            name: n,
            prob: p[i] * 100,
            d1: i === 0 ? num(m.oneDayPriceChange) : num(m.oneDayPriceChange) != null ? -num(m.oneDayPriceChange)! : null,
            w1: null,
            sp: spread(m),
            token: tokens[i],
          }));
  } else if (mk.every((m) => MONTH_ITEM.test(m.groupItemTitle ?? "") && m.endDate)) {
    // A date ladder ("… by …?"): the nearest open deadlines in date order,
    // the furthest one leading (the nearer ones are the path to it).
    ladder = true;
    const seen = new Set<number>();
    rows = mk
      .map((m) => ({
        at: Date.parse(m.endDate!),
        name: `By ${(m.groupItemTitle ?? "").replace(/, \d{4}$/, "")}`,
        prob: Number(arr(m.outcomePrices)[0]) * 100,
        d1: num(m.oneDayPriceChange),
        w1: num(m.oneWeekPriceChange),
        sp: spread(m),
        token: arr(m.clobTokenIds)[0],
      }))
      .filter((r) => r.at > Date.now() && !seen.has(r.at) && seen.add(r.at))
      .sort((a, b) => a.at - b.at)
      .slice(0, 4);
    if (rows.length > 1) rows = [rows[rows.length - 1], ...rows.slice(0, -1)];
  } else {
    rows = mk.map((m) => ({
      name: (m.groupItemTitle || m.question || "").replace(/^Draw \(.*\)$/, "Draw"),
      prob: Number(arr(m.outcomePrices)[0]) * 100,
      d1: num(m.oneDayPriceChange),
      w1: num(m.oneWeekPriceChange),
      sp: spread(m),
      token: arr(m.clobTokenIds)[0],
    }));
  }
  rows = rows.filter((o) => Number.isFinite(o.prob) && !/^(other|team [a-z]|tbd)$/i.test(o.name));
  if (!ladder) rows.sort((a, b) => b.prob - a.prob);
  if (rows.length === 0 || rows.some((o) => LADDER.test(o.name))) return null;

  const f = rows[0];
  const text = `${e.title} ${(e.tags ?? []).map((t) => t.label).join(" ")}`;
  return {
    id: `pm:${e.slug}`,
    source: "Polymarket",
    title: e.title,
    url: `https://polymarket.com/event/${e.slug}`,
    subject: subjectOf(text, hint),
    outcomes: rows.slice(0, 4).map((o) => ({ name: o.name, prob: r1(o.prob), ...(o.d1 != null && !ladder ? { prev: r1(o.prob - o.d1 * 100) } : {}) })),
    lead: { name: f.name, prob: r1(f.prob), move: f.d1 != null ? r1(f.d1 * 100) : null, week: f.w1 != null ? r1(f.w1 * 100) : null },
    binary: rows.length === 1 || f.name === "Yes",
    ladder,
    vol24: Math.round(Number(e.volume24hr) || 0),
    vol: Math.round(Number(e.volume) || 0),
    spread: f.sp != null ? r1(f.sp) : null,
    closes: e.endDate ?? null,
    token: f.token,
    tags: (e.tags ?? []).map((t) => t.label ?? "").filter(Boolean).slice(0, 8),
    rules: (e.description ?? "").replace(/\s+/g, " ").slice(0, 400),
  };
}

async function polymarketByTags(): Promise<OddsMarket[]> {
  const pages = await Promise.all(
    PM_TAGS.map(async ([tag, subject]) => {
      const events = await json<PmEvent[]>(
        `${PM}/events?tag_slug=${tag}&active=true&closed=false&order=volume24hr&ascending=false&limit=30`,
      ).catch(() => null);
      return (events ?? []).map((e) => fromPolymarket(e, subject));
    }),
  );
  return pages.flat().filter((m): m is OddsMarket => m !== null);
}

async function polymarketSearch(names: string[]): Promise<OddsMarket[]> {
  const pages = await Promise.all(
    names.slice(0, 8).map(async (q) => {
      const res = await json<{ events?: PmEvent[] }>(
        `${PM}/public-search?q=${encodeURIComponent(q)}&events_status=active&limit_per_type=10`,
      ).catch(() => null);
      return (res?.events ?? []).map((e) => fromPolymarket(e));
    }),
  );
  return pages.flat().filter((m): m is OddsMarket => m !== null);
}

// ---- Kalshi ------------------------------------------------------------------------------------

interface KMarket {
  ticker: string;
  title?: string;
  yes_sub_title?: string;
  status?: string;
  last_price_dollars?: string;
  previous_price_dollars?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  volume_24h_fp?: string;
  volume_fp?: string;
  close_time?: string;
  expected_expiration_time?: string;
  rules_primary?: string;
}
interface KEvent { event_ticker: string; series_ticker: string; title: string; sub_title?: string; category?: string; markets?: KMarket[] }
interface KSeries { ticker: string; title: string; category?: string; tags?: string[] | null; volume_fp?: string; frequency?: string }

// Series found once a week from Kalshi's own list: the busiest that fit a
// subject, recurring daily/weekly ladders left out.
const SERIES_KEY = "odds:kalshi-series:v1";
const SERIES_FALLBACK = ["KXFEDDECISION", "KXCBDECISIONINDIA", "KXF1RACE", "KXF1", "KXF1CONSTRUCTORS", "KXLALIGA", "KXUCL", "KXPREMIERLEAGUE", "KXBALLONDOR", "KXATP", "KXTOPMODEL", "KXHORMUZNORM"];

async function kalshiSeries(): Promise<string[]> {
  const store = getStore();
  const saved = await store.get<{ at: string; tickers: string[] }>(SERIES_KEY).catch(() => null);
  if (saved && Date.now() - Date.parse(saved.at) < 7 * 86_400_000 && saved.tickers.length > 0) return saved.tickers;
  const lists = await inBatches(["Sports", "Economics", "Financials", "Politics", "World", "Science and Technology", "Elections"], 2, (c) =>
    kalshiJson<{ series?: KSeries[] }>(`${KALSHI}/series?category=${encodeURIComponent(c)}&include_volume=true`, 86_400),
  );
  const all = lists.flatMap((l) => l?.series ?? []);
  if (all.length === 0) return saved?.tickers ?? SERIES_FALLBACK;
  const picked = all
    .filter((s) => !/daily|hourly|weekly/i.test(s.frequency ?? "") && !EXCLUDE.test(s.title) && !PROP.test(s.title))
    .map((s) => ({ s, subject: subjectOf(s.title) }))
    .filter(({ s, subject }) => subject !== "world" || /\b(election|president|prime minister|war|ceasefire|iran|israel|russia|ukraine|china|taiwan|nato|hormuz|leader)\b/i.test(s.title))
    .sort((a, b) => Number(b.s.volume_fp ?? 0) - Number(a.s.volume_fp ?? 0));
  // The busiest few per subject, so one subject can't take every slot.
  const per = new Map<OddsSubject, number>();
  const tickers: string[] = [];
  for (const { s, subject } of picked) {
    const n = per.get(subject) ?? 0;
    if (n >= 5) continue;
    per.set(subject, n + 1);
    tickers.push(s.ticker);
    if (tickers.length >= 28) break;
  }
  const out = [...new Set([...tickers, ...SERIES_FALLBACK])].slice(0, 32);
  await store.set(SERIES_KEY, { at: new Date().toISOString(), tickers: out }, { ttlSeconds: 14 * 86_400 }).catch(() => {});
  return out;
}

function fromKalshi(e: KEvent): OddsMarket | null {
  const mk = (e.markets ?? []).filter((m) => !m.status || m.status === "active" || m.status === "open");
  const price = (m: KMarket) => {
    const l = num(m.last_price_dollars);
    const b = num(m.yes_bid_dollars);
    const a = num(m.yes_ask_dollars);
    return l && l > 0 ? l * 100 : b != null && a != null && a > 0 ? ((b + a) / 2) * 100 : null;
  };
  let rows = mk
    .map((m) => {
      const prev = num(m.previous_price_dollars);
      const a = num(m.yes_ask_dollars);
      const b = num(m.yes_bid_dollars);
      return {
        name: m.yes_sub_title || m.title || "",
        prob: price(m),
        prev: prev && prev > 0 ? prev * 100 : null,
        v: Number(m.volume_24h_fp ?? 0),
        vt: Number(m.volume_fp ?? 0),
        sp: a && a > 0 && b != null ? (a - b) * 100 : null,
      };
    })
    .filter((o): o is typeof o & { prob: number } => o.prob != null);
  if (rows.length === 0) return null;
  const vol24 = rows.reduce((s, o) => s + o.v, 0);
  const vol = rows.reduce((s, o) => s + o.vt, 0);
  if (mk.length === 1) rows = [{ ...rows[0], name: "Yes" }];
  rows.sort((a, b) => b.prob - a.prob);
  if (rows.some((o) => LADDER.test(o.name))) return null;
  const f = rows[0];
  // A Kalshi sport the paper doesn't follow (its matches file under Sports),
  // and side bets.
  if (/sports/i.test(e.category ?? "") && subjectOf(e.title) === "world") return null;
  if (PROP.test(e.title)) return null;
  const title = e.title + (e.sub_title && !/2099|^on /i.test(e.sub_title) && !e.title.toLowerCase().includes(e.sub_title.toLowerCase().split(" : ")[0]) ? ` (${e.sub_title})` : "");
  return {
    id: `ks:${e.event_ticker}`,
    source: "Kalshi",
    title,
    url: `https://kalshi.com/markets/${e.series_ticker.toLowerCase()}`,
    subject: subjectOf(`${title} ${e.category ?? ""}`),
    outcomes: rows.slice(0, 4).map((o) => ({ name: o.name, prob: r1(o.prob), ...(o.prev != null ? { prev: r1(o.prev) } : {}) })),
    lead: { name: f.name, prob: r1(f.prob), move: f.prev != null ? r1(f.prob - f.prev) : null, week: null },
    binary: rows.length === 1 || f.name === "Yes",
    ladder: false,
    vol24: Math.round(vol24),
    vol: Math.round(vol),
    spread: f.sp != null ? r1(f.sp) : null,
    closes: mk[0]?.expected_expiration_time ?? mk[0]?.close_time ?? null,
    tags: [e.category ?? ""].filter(Boolean),
    rules: (mk[0]?.rules_primary ?? "").replace(/\s+/g, " ").slice(0, 400),
  };
}

async function kalshi(): Promise<OddsMarket[]> {
  const series = await kalshiSeries();
  const pages = await inBatches(series, 3, (s) =>
    kalshiJson<{ events?: KEvent[] }>(`${KALSHI}/events?series_ticker=${s}&status=open&with_nested_markets=true&limit=6`),
  );
  return pages
    .flatMap((p) => p?.events ?? [])
    .map(fromKalshi)
    .filter((m): m is OddsMarket => m !== null);
}

// ---- cleaning and merging ---------------------------------------------------------------------

/** Decided in all but name: a leader at 98.5%+, a yes/no under 1.5%, or a
 *  leader at 95%+ on a question already past its due date. */
function decided(m: OddsMarket): boolean {
  const p = m.lead.prob;
  if (p >= 98.5 || (m.binary && p <= 1.5)) return true;
  const due = m.closes ? Date.parse(m.closes) : NaN;
  return p >= 95 && Number.isFinite(due) && due <= Date.now();
}

const STOP = new Set("will the a an of in on by to be who what which is winner win end before after than more less over under yes no season champion".split(" "));
const toks = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w) && !/^20\d\d$/.test(w)),
  );
const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g;
/** Two titles about the same period: no clashing months, years or "this week". */
function samePeriod(a: string, b: string): boolean {
  const months = (t: string) => new Set((t.toLowerCase().match(MONTHS) ?? []).map((m) => m.slice(0, 3)));
  const years = (t: string) => new Set(t.match(/\b20\d\d\b/g) ?? []);
  const clash = (x: Set<string>, y: Set<string>) => x.size > 0 && y.size > 0 && ![...x].some((v) => y.has(v));
  const weekly = (t: string) => /\b(this week|week of|today|tonight)\b/i.test(t);
  const ma = months(a);
  const mb = months(b);
  // "End of October" is not "end of 2026" (unless the month is December).
  const monthly = (m: Set<string>) => m.size > 0 && !(m.size === 1 && m.has("dec"));
  if (monthly(ma) !== monthly(mb)) return false;
  return !clash(ma, mb) && !clash(years(a), years(b)) && weekly(a) === weekly(b);
}

// The same contender named by two sites.
const ALIASES: Array<[RegExp, string]> = [
  [/\b(claude|anthropic)\b/, "anthropic"],
  [/\b(gemini|google|deepmind)\b/, "google"],
  [/\b(chatgpt|openai|gpt)\b/, "openai"],
  [/\b(grok|xai)\b/, "xai"],
  [/\b(muse|meta)\b/, "meta"],
];

/** An outcome's name made comparable: "Fed maintains rate" is "No change",
 *  "Andrea Kimi Antonelli" is "Kimi Antonelli", "Claude" is "Anthropic". */
function canon(name: string): string {
  const n = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const alias = ALIASES.find(([re]) => re.test(n));
  if (alias) return alias[1];
  if (/no change|maintain|hold|unchanged/.test(n)) return "hold";
  if (/\b(cut|decrease|lower)/.test(n)) return `cut${n.match(/\d+/)?.[0] ?? ""}`;
  if (/\b(hike|increase|raise)/.test(n)) return `hike${n.match(/\d+/)?.[0] ?? ""}`;
  return n.replace(/\b(fc|cf|afc|amg|motorsport|f1 team|team)\b/g, "").replace(/[^a-z0-9]/g, "");
}
const sameName = (a: string, b: string) => {
  const x = canon(a);
  const y = canon(b);
  return x === y || (x.length > 4 && y.length > 4 && (x.includes(y) || y.includes(x)));
};

function sameQuestion(a: OddsMarket, b: OddsMarket): boolean {
  if (a.subject !== b.subject) return false;
  // The same race worded differently ("Ballon d'Or Winner 2026", "Who will
  // win the Ballon d'Or in 2026?"): the same favourite, most of the same
  // front-runners, a word in common, due within six weeks of each other.
  // A pick-several question ("top 3 finish") adds up to far more than 100%.
  const several = (m: OddsMarket) => m.outcomes.reduce((s, o) => s + o.prob, 0) > 115;
  const leadsAlike =
    a.outcomes.slice(0, 2).some((o) => sameName(o.name, b.lead.name)) || b.outcomes.slice(0, 2).some((o) => sameName(o.name, a.lead.name));
  if (samePeriod(a.title, b.title) && !a.binary && !b.binary && !several(a) && !several(b) && leadsAlike) {
    const shared = a.outcomes.filter((o) => b.outcomes.some((x) => sameName(o.name, x.name))).length;
    const words = [...toks(a.title)].some((w) => toks(b.title).has(w));
    if (words && shared >= Math.min(2, a.outcomes.length, b.outcomes.length)) return true;
  }
  const A = toks(a.title);
  const B = toks(b.title);
  if (A.size < 2 || B.size < 2) return false;
  const shared = [...A].filter((x) => B.has(x)).length;
  const sameLead = sameName(a.lead.name, b.lead.name) || a.outcomes.some((o) => sameName(o.name, b.lead.name));
  return shared / Math.min(A.size, B.size) >= 0.7 && sameLead;
}

export async function getOddsUniverse(follows: string[] = []): Promise<OddsUniverse> {
  const started = Date.now();
  const [byTag, searched, ks] = await Promise.all([
    polymarketByTags().catch(() => [] as OddsMarket[]),
    polymarketSearch(follows).catch(() => [] as OddsMarket[]),
    kalshi().catch(() => [] as OddsMarket[]),
  ]);
  const sources = [
    { name: "Polymarket", ok: byTag.length > 0, count: byTag.length + searched.length },
    { name: "Kalshi", ok: ks.length > 0, count: ks.length },
  ];

  // One card per question: the busier site leads, the other rides along.
  const seen = new Set<string>();
  const all = [...byTag, ...searched, ...ks]
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .filter((m) => !decided(m) && !EXCLUDE.test(`${m.title} ${m.tags.join(" ")}`))
    .sort((a, b) => b.vol24 - a.vol24);
  const markets: OddsMarket[] = [];
  for (const m of all) {
    const twin = markets.find((x) => x.source !== m.source && !x.also?.some((y) => y.source === m.source) && sameQuestion(x, m));
    if (twin) {
      // The other site's price for the same favourite.
      const same = m.outcomes.find((o) => sameName(o.name, twin.lead.name));
      (twin.also ??= []).push({ source: m.source, prob: same?.prob ?? m.lead.prob, name: same?.name ?? m.lead.name, url: m.url });
    }
    else markets.push(m);
  }
  return { markets, sources, at: new Date().toISOString(), tookMs: Date.now() - started };
}
