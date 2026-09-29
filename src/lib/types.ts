export type SectionKey =
  | "dateline"
  | "two-cities"
  | "paddock-notes"
  | "sports"
  | "sky-report"
  | "circuit-board"
  | "ledger"
  | "market-pulse"
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
    racePhase: "last-race" | "qualifying" | "race";
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
  };
  trending: TrendingTopic[];
  grapevine?: GrapevineData;
  onThisDay: OnThisDayEntry[];
  wordOfDay: WordOfDay;
}

export interface Personalization {
  onboarded: boolean;
  homeCity: string;
  sports: ("f1" | "football" | "tennis")[];
  favoriteF1Team: string;
  favoriteF1Drivers: string[];        // up to 2 driverIds
  favoriteFootballPlayer: string;
  favoriteFootballClub: string;
  favoriteFootballNationalTeam: string;
  favoriteTennisPlayer: string;
  hateWatchF1: string;                // rival team/driver to track negative news for
  hateWatchFootball: string;          // rival club/country/player
  hateWatchTennis: string;            // rival player
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
