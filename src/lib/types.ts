export type SectionKey =
  | "dateline"
  | "the-nation"
  | "two-cities"
  | "paddock-notes"
  | "sports"
  | "clutch"
  | "sky-report"
  | "circuit-board"
  | "ledger"
  | "market-pulse"
  | "straw-poll"
  | "grapevine";

export interface SectionMeta {
  key: SectionKey;
  label: string;
  kicker: string;
  slug: string;
  /** The section's own name, set large in its header ("Paddock Notes"). */
  name: string;
  /** One word for the navigation bar ("F1"). */
  short: string;
  /** CSS colour the section wears: its header, rules and hover lines. */
  hue: string;
}

export interface StatItem {
  label: string;
  value: string;
}

export interface Story {
  id: string;
  section: SectionKey;
  headline: string;
  deck: string;
  dateline: string;
  readTimeMin: number;
  lastUpdated: string;
  body: string[];
  pullQuote?: string;
  stats?: StatItem[];
  promoted?: boolean;
  significance: number;
  /** Matched reader interest, e.g. "Lando Norris" — drives the "For you"
   *  kicker and the hero boost. Set server-side from the interests cookie. */
  personal?: string;
  tags?: string[];
  sourceUrl?: string;
  sourceName?: string;
  /** One line on what the story means for the reader (digest stories). */
  why?: string;
  /** Small label above the headline, e.g. the country in World. */
  kicker?: string;
  /** Picked as a spare: printed only when the front page borrowed one of
   *  this section's stories as its lead. */
  reserve?: boolean;
}

export interface MarketIndex {
  id: string;
  name: string;
  symbol: string;
  market: MarketRegion;
  level: number;
  changePct: number;  // 1-day % change
  change7d: number | null;
  change1m: number | null;
  sparkline: number[];
  narrative: string;
  /** The average size of a day's move over the past month, in %: today's
   *  move against it says whether today was unusual. */
  usualMove?: number | null;
  /** Live figures fall back to the last good reading, marked stale with
   *  its time, before they are ever left out (lib/live/last-good.ts). */
  stale?: boolean;
  asOf?: string;
}

export type MarketRegion = "India" | "US" | "Europe" | "Asia";

/** A coin priced in USDT (Binance spot). */
export interface CryptoQuote {
  id: string;
  name: string;
  /** Exchange pair, e.g. "BTCUSDT". */
  pair: string;
  price: number;
  /** Rolling 24-hour change. */
  changePct: number;
  high24h: number;
  low24h: number;
  sparkline: number[];
  stale?: boolean;
  asOf?: string;
}

/** One price bar for the detail charts. Time is UNIX seconds. */
export interface PriceBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export type IpoStage = "upcoming" | "open" | "closed" | "listing" | "listed";

/** A mainboard IPO on the watch board. Dates are ISO days (IST). */
export interface IpoEntry {
  id: string;
  name: string;
  /** NSE symbol once the exchange lists the issue. */
  symbol: string | null;
  open: string | null;
  close: string | null;
  allotment: string | null;
  listing: string | null;
  /** True when the listing date is worked out (T+3), not announced. */
  listingEstimated?: boolean;
  priceLow: number | null;
  priceHigh: number | null;
  /** Issue size, ₹ crore. */
  sizeCr: number | null;
  /** Grey market premium, ₹ per share (unofficial). */
  gmp: number | null;
  gmpPct: number | null;
  /** Overall subscription as printed by the GMP table, e.g. "5.07x". */
  subscription: string | null;
  gmpUrl: string | null;
  stage: IpoStage;
}

export interface IpoDetail extends IpoEntry {
  subscriptionByCategory: Array<{ category: string; times: number }>;
  subscriptionUpdated: string | null;
  facts: Array<{ label: string; value: string }>;
  documents: Array<{ label: string; url: string }>;
  gmpHistory: Array<{ date: string; gmp: number }>;
  listingPerformance: { open: number; close: number | null; last: number | null } | null;
}

export interface MarketMood {
  /** The market this mood reads; absent on moods stored before the split. */
  region?: MarketRegion;
  score: number; // 0-100, 0 = extreme fear, 100 = extreme greed
  label: string;
  inputs: StatItem[];
  /** A published index (Tickertape MMI, CNN Fear & Greed); absent when the
   *  score is the paper's own formula over the region's indices. */
  source?: { name: string; url: string; asOf: string };
  stale?: boolean;
  asOf?: string;
  /** How broad the day was: the index's members that rose and fell (Nifty 50). */
  breadth?: { index: string; up: number; down: number; total: number };
}

/** A commodity priced in rupees (converted from its dollar benchmark). */
export interface Commodity {
  id: string;
  name: string;
  /** What one price buys: "10 g", "kg", "barrel"… */
  unit: string;
  priceInr: number;
  priceUsd?: number;
  /** Day change in rupee terms (the benchmark's move and the rupee's). */
  changePct: number;
  sparkline: number[];
  /** How the rupee figure is derived. */
  note: string;
  /** Where the price comes from when it isn't the converted benchmark
   *  (gold and silver: IBJA's published rate). */
  source?: string;
  stale?: boolean;
  asOf?: string;
}

export interface F1Race {
  round: number;
  name: string;
  country: string;
  circuit: string;
  date: string; // ISO date
  circuitImageUrl?: string;
  polePosition?: { driver: string; team: string; time: string };
  /** Every session of the race weekend (practice, sprint, qualifying, race);
   *  only filled for the next race. */
  sessions?: F1Session[];
}

export interface F1Session {
  /** "Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race". */
  name: string;
  /** ISO timestamps (UTC). */
  start: string;
  end: string;
}

export interface F1Standing {
  position: number;
  driverId: string;
  name: string;
  code: string;
  team: string;
  points: number;
  wins: number;
}

export interface F1LastResult {
  position: number | null;
  driver: string;
  code: string;
  team: string;
  time: string;   // winner's race time; gap for others (e.g. "+5.123s")
  points: number;
}

export interface F1LastRace {
  name: string;
  circuit: string;
  date: string;
  results: F1LastResult[];
}

export interface F1GridResult {
  position: number;
  driver: string;
  code: string;
  team: string;
  time: string;
}

/** Where the race weekend is: practice under way (latest practice times),
 *  qualifying done (the grid), a race running, or the race settled (result). */
export type F1Phase = "last-race" | "practice" | "qualifying" | "race";

/** One finished session of the weekend: its times, fastest first. */
export interface F1SessionResult {
  /** "Practice 2", "Sprint Qualifying", "Sprint". */
  name: string;
  /** The Grand Prix it belongs to. */
  race: string;
  end: string;
  rows: F1GridResult[];
}

/** The quickest driver of a finished session, for the weekend list. */
export interface F1SessionTop {
  code: string;
  driver: string;
  team: string;
  time: string;
}

export interface F1LiveResult {
  position: number;
  driver: string;
  code: string;
  team: string;
  interval: string;
  status: string;
}

export interface F1ConstructorStanding {
  position: number;
  team: string;
  points: number;
  //wins: number;
}

export interface TrendingTopic {
  id: string;
  label: string;
  platform: "reddit";
  detail: string;
  url?: string;
  summary?: string;
  subreddit?: string;
  score?: number;
}

// An Editor's Pick is a real story lifted from today's fetched wire pool —
// never invented. `why` is a short editorial reason for surfacing it, and
// `personal` flags that it matched one of the reader's stated interests.
export interface EditorsPick {
  id: string;
  title: string;
  url: string;
  domain: string;
  pool: string;          // which feed it came from, e.g. "World", "F1", "Tech"
  why: string;           // deterministic reason (used until the LLM blurb arrives)
  blurb?: string;        // optional LLM-written one-liner grounded in the title/snippet
  snippet: string;
  personal: boolean;
  matchedInterest?: string;
  postedAgo: string;
}

export interface GrapevineData {
  picks: EditorsPick[];
  reddit: TrendingTopic[];
  redditStatus: "live" | "public" | "unavailable" | "unconfigured";
  redditNote: string | null;
}

// Server-side view of the reader's interests, bridged via cookie so the
// Editor's Picks scorer can weight real stories toward what the reader cares
// about. Mirrors a subset of Personalization.
export interface ReaderInterests {
  city: string;
  f1Drivers: string[];
  f1Team: string;
  footballClub: string;
  footballPlayer: string;
  nationalTeam: string;
  tennisPlayer: string;
  topics: string[];
}

// ---- Reader memory (localStorage only) -------------------------------------

export interface EngagementRecord {
  id: string;
  headline: string;
  section: SectionKey;
  sourceName?: string;
  tags: string[];
  at: string;            // ISO timestamp
}

export interface IssueRecord {
  isoDate: string;
  issue: number;
  heroHeadline: string;
  heroSection: SectionKey;
  sectionsRead: SectionKey[];
  openedAt: string;
}

export interface ReaderMemory {
  version: 1;
  firstOpened: string | null;
  visits: string[];                       // ISO dates, unique, ascending
  issues: IssueRecord[];                  // capped, newest last
  engagements: EngagementRecord[];        // capped, newest last
  sectionAffinity: Partial<Record<SectionKey, number>>;
  sourceAffinity: Record<string, number>;
  tagAffinity: Record<string, number>;
}

export interface ReaderProfile {
  streak: number;
  longestStreak: number;
  totalIssues: number;
  firstOpened: string | null;
  lastOpened: string | null;
  favouriteSection: SectionKey | null;
  favouriteSource: string | null;
  topTags: string[];
  weekdayHabit: string | null;           // e.g. "Sunday" if they rarely miss it
  engagementsThisWeek: number;
}

export interface EditionBrief {
  /** `url` links the bullet to its story; `headline` is the original title. */
  bullets: Array<{ section: string; text: string; url?: string; headline?: string }>;
}

export interface FootballStanding {
  rank: number;
  club: string;
  abbreviation: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

export interface FootballLeader {
  name: string;
  team: string;
  value: number;
  displayValue: string;
}

export interface FootballLeaderCategory {
  name: string;
  label: string;
  leaders: FootballLeader[];
}

export interface TennisRanking {
  rank: number;
  name: string;
  country: string;
  points: number;
}

export interface OnThisDayEntry {
  year: string;
  text: string;
}

export interface WordOfDay {
  word: string;
  pronunciation: string;
  partOfSpeech: string;
  definition: string;
  example: string;
}

export interface WireBrief {
  id: string;
  title: string;
  url: string;
  domain: string;
  image?: string;
  summary?: string;
  points?: number;
  comments?: number;
  postedAgo: string;
}

export interface WeatherNow {
  city: string;
  condition: string;
  weatherCode: number;
  tempC: number;
  narrative: string;
  quip: string;
  sunrise: string;
  sunset: string;
  uvIndex: number;
  aqi: number;
  aqiLabel: string;
  /** Today's range and how the air feels. */
  tempMin?: number;
  tempMax?: number;
  feelsLikeC?: number;
  humidity?: number;
  /** Open-Meteo's own day/night flag at fetch time; the page re-derives it
   *  from the clock (lib/sky.ts) so it flips at sunset without a refetch. */
  isDay?: boolean;
  /** The city's offset from UTC, so the sun is placed on its clock. */
  utcOffsetSeconds?: number;
  /** The same reading, written for after dark. */
  night?: { condition: string; narrative: string; quip: string };
  /** Highest chance of rain today, %. */
  rainChance?: number;
  /** The next four parts of the day (morning, afternoon, evening, night). */
  blocks?: WeatherBlock[];
  latitude?: number;
  longitude?: number;
}

export interface WeatherBlock {
  /** "This afternoon", "Evening", "Night", "Morning". */
  label: string;
  /** Local clock, "12:00". */
  from: string;
  to: string;
  /** Highest chance of rain in the block, %. */
  rainPct: number;
  tempMin: number;
  tempMax: number;
  /** Weather code of the block's wettest hour. */
  weatherCode: number;
  night: boolean;
}

export interface Edition {
  date: string; // display date, e.g. "Saturday, 29 August 2026"
  isoDate: string; // 2026-08-29
  volume: number;
  issue: number;
  sections: {
    dateline: Story[];
    /** India's national news; filled only by the digest. */
    nation?: Story[];
    /** The reader's cities; filled only by the digest. */
    twoCities?: Story[];
    paddockNotes: Story[];
    skyReport: Story[];
    circuitBoard: Story[];
    ledger: Story[];
    marketPulse: Story[];
    grapevine: Story[];
  };
  weather?: WeatherNow; // fetched client-side; absent until hydration completes
  f1: {
    nextRace: F1Race;
    upcoming: F1Race[];
    standings: F1Standing[];
    constructorStandings: F1ConstructorStanding[];
    lastRace: F1LastRace | null;
    qualifyingGrid: F1GridResult[];
    liveResults: F1LiveResult[];
    currentRace: F1Race | null;
    racePhase: F1Phase;
  } | null; // null when the F1 standings API is unreachable
  markets: {
    indices: MarketIndex[];
    mood: MarketMood | null;
    /** One mood per region (India, US, Europe, Asia). */
    moods?: MarketMood[];
    /** Commodities in rupees. */
    commodities?: Commodity[];
    /** Bitcoin and Ethereum in USDT. */
    crypto?: CryptoQuote[];
    /** Exchange holidays (lib/market-hours.ts HolidayMap). */
    holidays?: Partial<Record<string, Record<string, string>>>;
  };
  trending: TrendingTopic[];
  grapevine?: GrapevineData;
  /** Clutch's data at press time; the page keeps it fresh. */
  valorant?: ValorantData | null;
  onThisDay: OnThisDayEntry[];
  wordOfDay: WordOfDay;
}

export interface Personalization {
  onboarded: boolean;
  homeCity: string;
  sports: ("f1" | "football" | "tennis")[];
  favoriteF1Team: string;
  favoriteF1Drivers: string[];        // up to 2 driverIds
  /** Set once the paddock defaults have been applied to a saved paper. */
  paddockSeeded?: boolean;
  favoriteFootballPlayer: string;
  favoriteFootballClub: string;
  favoriteFootballNationalTeam: string;
  favoriteTennisPlayer: string;
  hateWatchF1: string;                // rival team/driver to track negative news for
  hateWatchFootball: string;          // rival club/country/player
  hateWatchTennis: string;            // rival player
  /** Valorant teams followed in Clutch, by Riot team code ("PRX"). */
  valorantTeams: string[];
  /** Questions the reader keeps an eye on in Straw Poll, as searches
   *  ("Which party will win the Senate in 2026"): whatever market answers
   *  one today, even as the dates roll on. */
  oddsWatch?: string[];
  /** Markets starred from a sheet, by id (pm:<slug>, ks:<ticker>). */
  oddsPins?: Array<{ id: string; title: string }>;
  topics: string[];
  subreddits: string[];            // up to 5; empty = use globally trending Reddit posts
  /** Every section, in print order (hidden ones keep their place). */
  sectionOrder: SectionKey[];
  /** Sections the reader switched off in Page order. */
  hiddenSections: SectionKey[];
  /** Print the "Why it matters" line under summaries. Off by default. */
  showWhy: boolean;
}

export interface F1RosterEntry {
  id: string;
  name: string;
  code: string;
  team: string;
}

/** One dated thing in the Week Ahead (lib/live/ahead.ts). */
export interface AheadEvent {
  /** IST date, YYYY-MM-DD. */
  date: string;
  /** IST time, HH:MM, when the event has one. */
  time?: string;
  label: string;
  kind: "policy" | "markets" | "holiday" | "ipo" | "f1" | "esports";
  url?: string;
}

export interface WeekAhead {
  from: string;
  to: string;
  events: AheadEvent[];
  /** The next policy decisions beyond the week. */
  later: AheadEvent[];
  at: string;
}

// ---- Clutch: Valorant (lib/live/valorant.ts) ----------------------------------------

export interface ValTeam {
  /** Riot's team code, e.g. "PRX" — what the reader's follow list stores. */
  code: string;
  name: string;
  image: string | null;
  /** VCT league region: Americas, EMEA, Pacific, China. */
  region?: string;
}

export interface ValSide {
  code: string;
  name: string;
  image: string | null;
  /** Maps won; null before the match. */
  wins: number | null;
  outcome?: "win" | "loss";
  /** The team's record in this stage, "2–0". */
  record?: string;
}

export interface ValMatch {
  id: string;
  start: string;
  state: "unstarted" | "inProgress" | "completed";
  /** Event name, "Champions Shanghai". */
  event: string;
  eventKey: string;
  /** "Groups", "Playoffs", "Finals"… */
  stage: string;
  bestOf: number;
  teams: [ValSide, ValSide];
  /** Polymarket's match-winner prices, in percent. */
  odds?: { a: number; b: number; volume: number; url: string };
  /** The group letter, when the organisers' match title gives one. */
  group?: string;
  /** Known only from Polymarket (Riot hasn't scheduled it yet). */
  fromMarket?: boolean;
}

export interface ValWinnerOdds {
  title: string;
  url: string;
  volume: number;
  /** Every team still priced, favourite first. */
  field: Array<{ name: string; prob: number }>;
}

export interface ValEvent {
  key: string;
  name: string;
  league: string;
  region: string;
  international: boolean;
  logo: string | null;
  /** First and last scheduled match. */
  start: string;
  end: string;
  /** The stage being played now, or next. */
  stage: string;
  finished: boolean;
  odds?: ValWinnerOdds;
}

export interface ValNews {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
}

export interface ValorantData {
  /** "event": an international is on; "league": the VCT leagues are; "off": neither. */
  phase: "event" | "league" | "off";
  events: ValEvent[];
  /** The event the section leads with. */
  featured: ValEvent | null;
  nextEvent: ValEvent | null;
  lastEvent: ValEvent | null;
  matches: ValMatch[];
  teams: ValTeam[];
  news: ValNews[];
  fetchedAt: string;
}

// ---- Straw Poll: prediction-market odds (lib/live/odds.ts, lib/odds-pick.ts) ------------

export type OddsSubject = "f1" | "football" | "tennis" | "valorant" | "money" | "tech" | "india" | "world" | "culture";

export interface OddsMarket {
  /** pm:<event slug> or ks:<event ticker>. */
  id: string;
  source: "Polymarket" | "Kalshi";
  title: string;
  url: string;
  subject: OddsSubject;
  /** Up to four, favourite first (a date ladder: the furthest deadline
   *  first; a price ladder: every level, highest first). Each carries what
   *  its own price history is read by: Polymarket's CLOB token, Kalshi's
   *  market ticker. */
  outcomes: Array<{ name: string; prob: number; prev?: number; token?: string; ticker?: string }>;
  /** The favourite, its move today and over a week, in points. */
  lead: { name: string; prob: number; move: number | null; week: number | null };
  binary: boolean;
  ladder: boolean;
  /** A price ladder ("What price will Bitcoin hit in 2026?": ↑ $150k, ↓ $60k…). */
  hit?: boolean;
  /** Kalshi's series, for its price history. */
  series?: string;
  /** Dollars traded today and in all. */
  vol24: number;
  vol: number;
  /** The favourite's bid–ask gap in points: small means traders agree. */
  spread: number | null;
  /** When the question is due to be settled. */
  closes: string | null;
  /** Polymarket CLOB token of the favourite, for its price history. */
  token?: string;
  tags: string[];
  /** How it's decided, from the market's own rules. */
  rules: string;
  /** The same question on the other site. */
  also?: Array<{ source: string; prob: number; name: string; url: string }>;
}

export interface OddsUniverse {
  markets: OddsMarket[];
  sources: Array<{ name: string; ok: boolean; count: number }>;
  at: string;
  tookMs: number;
  /** How often the favourite a week out won, over the past month (once 10+ settled). */
  record?: OddsRecordSummary | null;
  /** Which markets each watched search found: query → market ids. */
  watched?: Record<string, string[]>;
}

/** Straw Poll's track record: the favourite a week before each question settled, against what happened. */
export interface OddsRecordSummary {
  called: number;
  total: number;
  /** By how sure the favourite was: under 70%, 70–90%, 90%+. */
  buckets: Array<{ label: string; called: number; total: number }>;
  /** The latest verdicts, newest first. */
  recent: Array<{ title: string; favourite: string; chance: number; winner: string; called: boolean; settled: string }>;
}

/** A severe-weather alert near one of the reader's places (lib/live/alerts.ts). */
export interface WeatherAlert {
  place: string;
  /** watch, alert, warning, orange or red. */
  severity: string;
  type: string;
  area: string;
  from: string | null;
  until: string | null;
  message: string;
  /** IMD, CWC, a state authority… */
  source: string;
}

/** One day's cash-market trade by one kind of investor, ₹ crore. */
export interface FlowDay { buy: number; sell: number; net: number }

/** Market Pulse's rates row (lib/live/rates.ts). Any part may be missing. */
export interface RatesPanel {
  /** RBI policy repo rate, % ; next decision date (IST). */
  repo?: { rate: number; next: string | null };
  /** Fed funds target range, %; when it last changed; next decision (IST). */
  fed?: { lower: number; upper: number; since: string; move: "cut" | "hike" | null; next: string | null };
  /** US 10-year Treasury yield, % and its move today in points. */
  us10y?: { yield: number; change: number | null };
  /** FII and DII buying and selling in the cash market, ₹ crore. */
  flows?: {
    date: string;
    fii: FlowDay;
    dii: FlowDay;
    /** The month so far, from the days the paper has kept. */
    month: { fii: number; dii: number; days: number } | null;
    /** Each kept trading day this month, oldest first: net ₹ crore. */
    days: Array<{ date: string; fii: number; dii: number }>;
  };
  at: string;
}

// ---- Clutch: a match's numbers (lib/live/vlr.ts) ----------------------------------------

/** One player's line: rating, ACS, K/D/A, KAST %, ADR, HS %, first kills and deaths. */
export interface ValStatLine {
  r: number | null;
  acs: number | null;
  k: number | null;
  d: number | null;
  a: number | null;
  kd: number | null;
  kast: number | null;
  adr: number | null;
  hs: number | null;
  fk: number | null;
  fd: number | null;
  fkd: number | null;
}

export interface ValPlayerStats {
  name: string;
  team: string;
  /** Agent slugs ("kayo"), as in /public/val/agents. */
  agents: string[];
  all: ValStatLine;
  /** Attack and defence halves; missing on some older pages. */
  t: ValStatLine | null;
  ct: ValStatLine | null;
}

export interface ValMapStats {
  /** "all" for the whole match. */
  id: string;
  name: string;
  /** Rounds won, in the match's team order. */
  score: [number | null, number | null];
  /** Which team picked the map. */
  pickedBy: 0 | 1 | null;
  duration: string | null;
  /** Each round: who won it, on which side, and how. */
  rounds: Array<{ winner: 0 | 1; side: "t" | "ct"; how: "elim" | "defuse" | "boom" | "time" | null }>;
  teams: [ValPlayerStats[], ValPlayerStats[]];
}

export interface ValMatchStats {
  /** The VLR.gg page the numbers come from. */
  url: string;
  live: boolean;
  teams: [string, string];
  maps: ValMapStats[];
  /** Riot's VODs, by map number (1-based). */
  vods: Array<{ map: number; url: string }>;
  fetchedAt: string;
}
