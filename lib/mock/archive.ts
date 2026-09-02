import type { Edition, Story } from "../types";

function story(
  id: string,
  section: Story["section"],
  headline: string,
  deck: string,
  body: string[],
  overrides: Partial<Story> = {},
): Story {
  return {
    id,
    section,
    headline,
    deck,
    dateline: overrides.dateline ?? "ARCHIVE EDITION",
    readTimeMin: overrides.readTimeMin ?? 2,
    lastUpdated: overrides.lastUpdated ?? "end of day",
    body,
    significance: overrides.significance ?? 50,
    ...overrides,
  };
}

const TODAY_ISSUE = 214;

interface ArchiveDay {
  isoDate: string;
  date: string;
  daysAgo: number;
}

const DAYS: ArchiveDay[] = [
  { isoDate: "2026-08-28", date: "Friday, 28 August 2026", daysAgo: 1 },
  { isoDate: "2026-08-27", date: "Thursday, 27 August 2026", daysAgo: 2 },
  { isoDate: "2026-08-26", date: "Wednesday, 26 August 2026", daysAgo: 3 },
  { isoDate: "2026-08-25", date: "Tuesday, 25 August 2026", daysAgo: 4 },
  { isoDate: "2026-08-24", date: "Monday, 24 August 2026", daysAgo: 5 },
];

const HEADLINES: Record<
  string,
  { headline: string; deck: string; body: string[] }
> = {
  "2026-08-28": {
    headline: "Red Bull's rear-wing gamble pays off in final Dutch GP practice",
    deck: "A late-notice upgrade closed the straight-line gap to McLaren by nearly two tenths",
    body: [
      "Red Bull's decision to hold back its rear-wing revision until the final practice session at Zandvoort looked, for most of Friday, like a mistake — the team spent the morning mired in fifth and sixth on the timesheets. By Saturday's final hour, the gamble had closed the straight-line deficit to McLaren by close to two tenths, enough to put both papaya cars on notice ahead of qualifying.",
      "Team principal comments afterward were characteristically guarded, but paddock engineers described the update as the most significant aerodynamic step Red Bull has taken since the summer break.",
    ],
  },
  "2026-08-27": {
    headline: "A record monsoon surplus is reshaping India's rabi sowing forecasts",
    deck: "Reservoir levels sit 18% above the ten-year average heading into September",
    body: [
      "This year's monsoon has delivered a rare surplus rather than the deficit forecasters warned of in June, leaving major reservoirs across the Deccan plateau sitting 18% above their ten-year average with weeks of the season still to run. Agricultural economists are already revising rabi sowing forecasts upward, particularly for wheat and pulses in the Gangetic plain.",
      "The surplus isn't without cost — flood damage in low-lying districts of Bihar and Assam has been more severe than in a typical year — but the net effect on the farm economy is expected to be positive heading into the winter crop cycle.",
    ],
  },
  "2026-08-26": {
    headline: "ICICI adds a fourth airline partner to its transfer program, quietly closing the gap to Axis",
    deck: "The update brings ICICI's Emeralde cardholders parity on two long-haul routes",
    body: [
      "ICICI Bank added a fourth airline partner to its points-transfer program this week, a move that brings Emeralde Private Metal cardholders to rough parity with Axis Magnus on two of the most-redeemed long-haul routes out of Mumbai and Delhi. No changes were made to the card's base earn rate or annual fee.",
      "The update continues a summer-long back-and-forth between India's premium card issuers, each incrementally improving transfer economics rather than competing on headline reward rates.",
    ],
  },
  "2026-08-25": {
    headline: "A quiet earnings beat from a Bengaluru SaaS firm is drawing outsized attention",
    deck: "Its net-revenue-retention number was the highest reported by any Indian software company this earnings season",
    body: [
      "A mid-cap Bengaluru-based SaaS company posted a net-revenue-retention rate that quietly topped every other Indian software firm to report this earnings season, a detail that took a full trading day to filter through to analyst notes. The stock moved only modestly on the news, but at least three brokerages issued same-day upgrades citing the metric specifically.",
    ],
  },
  "2026-08-24": {
    headline: "Nasdaq begins the week testing a fresh all-time high before chipmakers fade into the close",
    deck: "A volatile Monday session set the tone for what became the tech-led week that followed",
    body: [
      "The Nasdaq Composite brushed a fresh intraday all-time high early Monday before a wave of profit-taking in semiconductor names pulled the index back to a flat close — the opening chapter of what would become a strong week for US tech overall, even if Monday itself ended up a false start.",
    ],
  },
};

function buildArchiveEdition(day: ArchiveDay, volume: number): Edition {
  const content = HEADLINES[day.isoDate];
  const dl = story("arch-dl", "dateline", content.headline, content.deck, content.body, {
    dateline: `ARCHIVE — ${day.date}`,
    significance: 80,
    promoted: true,
  });

  return {
    date: day.date,
    isoDate: day.isoDate,
    volume,
    issue: TODAY_ISSUE - day.daysAgo,
    weather: {
      city: "Bengaluru",
      condition: "Partly cloudy",
      weatherCode: 2,
      tempC: 25,
      narrative: "A milder day than average, with clear spells through the afternoon.",
      quip: "The sky can't make up its mind. Honestly, relatable.",
      sunrise: "6:03 AM",
      sunset: "6:40 PM",
      uvIndex: 7,
      aqi: 52,
      aqiLabel: "Moderate",
    },
    f1: {
      nextRace: {
        round: 15,
        name: "Dutch Grand Prix",
        country: "Netherlands",
        flag: "🇳🇱",
        circuit: "Circuit Zandvoort",
        date: "2026-08-30",
      },
      upcoming: [
        { round: 15, name: "Dutch Grand Prix", country: "Netherlands", flag: "🇳🇱", circuit: "Zandvoort", date: "2026-08-30" },
        { round: 16, name: "Italian Grand Prix", country: "Italy", flag: "🇮🇹", circuit: "Monza", date: "2026-09-06" },
      ],
      standings: [
        { position: 1, driverId: "norris", code: "NOR", name: "L. Norris", team: "McLaren", points: 291, wins: 7 },
        { position: 2, driverId: "piastri", code: "PIA", name: "O. Piastri", team: "McLaren", points: 276, wins: 5 },
        { position: 3, driverId: "max_verstappen", code: "VER", name: "M. Verstappen", team: "Red Bull", points: 253, wins: 4 },
      ],
      constructorStandings: [
        { position: 1, team: "McLaren", points: 567, wins: 12 },
        { position: 2, team: "Red Bull", points: 320, wins: 4 },
        { position: 3, team: "Ferrari", points: 290, wins: 1 },
      ],
      lastRace: null,
    },
    markets: {
      indices: [
        {
          id: "nifty50",
          name: "Nifty 50",
          symbol: "NIFTY",
          market: "India",
          level: 24990.2,
          changePct: -0.2,
          change7d: null,
          change1m: null,
          sparkline: [25040, 25010, 24960, 24980, 24955, 24970, 24990],
          narrative: "A quiet, range-bound session with low volumes ahead of the weekend.",
        },
        {
          id: "sp500",
          name: "S&P 500",
          symbol: "SPX",
          market: "US",
          level: 6440.1,
          changePct: 0.5,
          change7d: null,
          change1m: null,
          sparkline: [6400, 6410, 6405, 6420, 6425, 6435, 6440],
          narrative: "A steady grind higher, led by defensive sectors.",
        },
      ],
      mood: {
        score: 55,
        label: "Neutral",
        inputs: [
          { label: "Volatility (VIX)", value: "14.8" },
          { label: "Market breadth", value: "58% above 50-day avg" },
        ],
      },
    },
    creditCards: [],
    trending: [
      { id: "arch-t1", label: "#ZandvoortQuali", platform: "x", detail: "Fans debating grid penalties ahead of Sunday" },
    ],
    onThisDay: [{ year: "2001", text: "A landmark undersea cable linking three continents went live." }],
    wordOfDay: {
      word: "sonder",
      pronunciation: "SON-der",
      partOfSpeech: "noun",
      definition: "the realization that each passerby has a life as vivid and complex as your own.",
      example: "Reading the day's dateline stories back to back had a small sonder effect on the newsroom.",
    },
    sections: {
      dateline: [dl],
      paddockNotes: [],
      skyReport: [],
      circuitBoard: [],
      ledger: [],
      plasticPoints: [],
      marketPulse: [],
      grapevine: [],
    },
  };
}

export const ARCHIVE_EDITIONS: Edition[] = DAYS.map((d) => buildArchiveEdition(d, 1));

export function getArchiveEditionByDate(isoDate: string): Edition | undefined {
  return ARCHIVE_EDITIONS.find((e) => e.isoDate === isoDate);
}
