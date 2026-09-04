export type SectionKey =
  | "dateline"
  | "paddock-notes"
  | "sky-report"
  | "circuit-board"
  | "ledger"
  | "plastic-points"
  | "market-pulse"
  | "grapevine";

export interface SectionMeta {
  key: SectionKey;
  label: string;
  kicker: string;
  slug: string;
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
}

export interface MarketIndex {
  id: string;
  name: string;
  symbol: string;
  market: "India" | "US";
  level: number;
  changePct: number;  // 1-day % change
  change7d: number | null;
  change1m: number | null;
  sparkline: number[];
  narrative: string;
}

export interface MarketMood {
  score: number; // 0-100, 0 = extreme fear, 100 = extreme greed
  label: string;
  inputs: StatItem[];
}

export interface F1Race {
  round: number;
  name: string;
  country: string;
  flag: string;
  circuit: string;
  date: string; // ISO date
  circuitImageUrl?: string;
  polePosition?: { driver: string; team: string; time: string };
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
  position: number;
  driver: string;
  code: string;
  team: string;
  time: string;   // winner's race time; gap for others (e.g. "+5.123s")
  points: number;
}

export interface F1LastRace {
  name: string;
  flag: string;
  circuit: string;
  date: string;
  results: F1LastResult[];
}

export interface F1ConstructorStanding {
  position: number;
  team: string;
  points: number;
  wins: number;
}

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  network: string;
  annualFee: string;
  rewardRate: string;
  milestoneBenefit: string;
  loungeAccess: string;
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
  pool: string;          // which feed it came from, e.g. "World", "F1", "Cards"
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
  card: string;
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
  bullets: Array<{ section: string; text: string }>;
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
}

export interface Edition {
  date: string; // display date, e.g. "Saturday, 29 August 2026"
  isoDate: string; // 2026-08-29
  volume: number;
  issue: number;
  sections: {
    dateline: Story[];
    paddockNotes: Story[];
    skyReport: Story[];
    circuitBoard: Story[];
    ledger: Story[];
    plasticPoints: Story[];
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
  } | null; // null when the F1 standings API is unreachable
  markets: {
    indices: MarketIndex[];
    mood: MarketMood | null;
  };
  creditCards: CreditCard[];
  trending: TrendingTopic[];
  grapevine?: GrapevineData;
  onThisDay: OnThisDayEntry[];
  wordOfDay: WordOfDay;
}

export interface Personalization {
  onboarded: boolean;
  homeCity: string;
  cardFollowing: string;              // single card ID to follow in Plastic & Points
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
  sectionOrder: SectionKey[];
}

export interface F1RosterEntry {
  id: string;
  name: string;
  code: string;
  team: string;
}
