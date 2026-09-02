import type { Edition } from "../types";

export const TODAY_EDITION: Edition = {
  date: "Saturday, 29 August 2026",
  isoDate: "2026-08-29",
  volume: 1,
  issue: 214,
  weather: {
    city: "Bengaluru",
    condition: "Overcast, stray showers",
    weatherCode: 61,
    tempC: 24,
    narrative:
      "Expect a muggy, grey-lidded morning across Bengaluru, with the cloud deck thick enough that the sun won't properly show itself before noon. A stray thunderstorm is likely after 4 PM, rolling in from the southwest the way they have most afternoons this week, so keep an umbrella closer than the weather app's confidence in it deserves.",
    quip: "The umbrella you left at home sends its regards.",
    sunrise: "6:04 AM",
    sunset: "6:38 PM",
    uvIndex: 6,
    aqi: 58,
    aqiLabel: "Moderate",
  },
  f1: {
    nextRace: {
      round: 16,
      name: "Italian Grand Prix",
      country: "Italy",
      flag: "🇮🇹",
      circuit: "Autodromo Nazionale Monza",
      date: "2026-09-06T13:00:00Z",
    },
    upcoming: [
      {
        round: 16,
        name: "Italian Grand Prix",
        country: "Italy",
        flag: "🇮🇹",
        circuit: "Monza",
        date: "2026-09-06",
      },
      {
        round: 17,
        name: "Azerbaijan Grand Prix",
        country: "Azerbaijan",
        flag: "🇦🇿",
        circuit: "Baku City Circuit",
        date: "2026-09-20",
      },
      {
        round: 18,
        name: "Singapore Grand Prix",
        country: "Singapore",
        flag: "🇸🇬",
        circuit: "Marina Bay",
        date: "2026-10-04",
      },
      {
        round: 19,
        name: "United States Grand Prix",
        country: "USA",
        flag: "🇺🇸",
        circuit: "Circuit of the Americas",
        date: "2026-10-18",
      },
      {
        round: 20,
        name: "Mexico City Grand Prix",
        country: "Mexico",
        flag: "🇲🇽",
        circuit: "Autódromo Hermanos Rodríguez",
        date: "2026-10-25",
      },
    ],
    standings: [
      { position: 1, driverId: "norris", code: "NOR", name: "L. Norris", team: "McLaren", points: 301, wins: 7 },
      { position: 2, driverId: "piastri", code: "PIA", name: "O. Piastri", team: "McLaren", points: 284, wins: 5 },
      { position: 3, driverId: "max_verstappen", code: "VER", name: "M. Verstappen", team: "Red Bull", points: 261, wins: 4 },
      { position: 4, driverId: "leclerc", code: "LEC", name: "C. Leclerc", team: "Ferrari", points: 203, wins: 1 },
      { position: 5, driverId: "russell", code: "RUS", name: "G. Russell", team: "Mercedes", points: 187, wins: 1 },
    ],
    constructorStandings: [
      { position: 1, team: "McLaren", points: 585, wins: 12 },
      { position: 2, team: "Red Bull", points: 330, wins: 4 },
      { position: 3, team: "Ferrari", points: 295, wins: 1 },
      { position: 4, team: "Mercedes", points: 220, wins: 1 },
      { position: 5, team: "Aston Martin", points: 120, wins: 0 },
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
        level: 25142.3,
        changePct: 0.3,
        change7d: 1.1,
        change1m: -0.8,
        sparkline: [24810, 24765, 24902, 24850, 24990, 25060, 25142],
        narrative:
          "Dalal Street opened nervy this morning, the index dipping half a percent in the first hour before recovering on the back of banking stocks — a pattern that's now repeated three sessions running.",
      },
      {
        id: "niftyit",
        name: "Nifty IT",
        symbol: "%5ECNXIT",
        market: "India",
        level: 38200.0,
        changePct: 0.6,
        change7d: 2.1,
        change1m: 3.4,
        sparkline: [37400, 37600, 37750, 37900, 38000, 38100, 38200],
        narrative:
          "Nifty IT outpaced the broader market, lifted by strong earnings guidance from large-cap software exporters.",
      },
      {
        id: "sensex",
        name: "Sensex",
        symbol: "BSE",
        market: "India",
        level: 82340.1,
        changePct: 0.28,
        change7d: 0.9,
        change1m: -1.1,
        sparkline: [81620, 81510, 81780, 81690, 82005, 82190, 82340],
        narrative:
          "The Sensex clawed back to a flat week, up a modest 0.3%, tracking the Nifty tick for tick as IT majors offset a soft showing from auto stocks.",
      },
      {
        id: "sp500",
        name: "S&P 500",
        symbol: "SPX",
        market: "US",
        level: 6482.7,
        changePct: 0.9,
        change7d: 1.8,
        change1m: 2.3,
        sparkline: [6390, 6402, 6415, 6440, 6455, 6470, 6483],
        narrative:
          "Across the Pacific, the S&P 500 quietly notched its second-best week since March, carried by a cooler-than-feared inflation print and a bid in mega-cap tech.",
      },
      {
        id: "dow",
        name: "Dow Jones",
        symbol: "DJI",
        market: "US",
        level: 41230.5,
        changePct: 0.4,
        change7d: 0.7,
        change1m: 1.2,
        sparkline: [40950, 40890, 41005, 41060, 41110, 41180, 41231],
        narrative:
          "The Dow's gains were thinner but steadier, industrials doing the heavy lifting while a handful of healthcare names dragged on the index.",
      },
      {
        id: "nasdaq",
        name: "Nasdaq Composite",
        symbol: "IXIC",
        market: "US",
        level: 21540.2,
        changePct: 1.4,
        change7d: 2.9,
        change1m: 4.1,
        sparkline: [21150, 21230, 21290, 21360, 21430, 21490, 21540],
        narrative:
          "The Nasdaq led all comers, up a full 1.4% on the week as chipmakers extended their rally into a fourth straight session.",
      },
    ],
    mood: {
      score: 64,
      label: "Greed",
      inputs: [
        { label: "Volatility (VIX)", value: "13.2, below average" },
        { label: "Market breadth", value: "68% of stocks above 50-day avg" },
        { label: "Volume", value: "Slightly above 20-day average" },
      ],
    },
  },
  creditCards: [
    {
      id: "hdfc-regalia-gold",
      name: "HDFC Regalia Gold",
      issuer: "HDFC Bank",
      network: "Visa Signature / World MC",
      annualFee: "₹1,000 + GST (waived above ₹3L spend)",
      rewardRate: "4 points / ₹150 (up to 10x via SmartBuy)",
      milestoneBenefit: "₹1,500 gift voucher at ₹5L annual spend",
      loungeAccess: "8 domestic visits/year",
    },
    {
      id: "hsbc-travelone",
      name: "HSBC TravelOne",
      issuer: "HSBC",
      network: "Visa Signature",
      annualFee: "₹3,999 + GST",
      rewardRate: "3 points / ₹100 (10x on travel portal bookings)",
      milestoneBenefit: "2,500 bonus points at ₹3L annual spend",
      loungeAccess: "4 domestic + 4 international (Priority Pass)",
    },
    {
      id: "hsbc-live-plus",
      name: "HSBC Live+",
      issuer: "HSBC",
      network: "Visa Signature",
      annualFee: "₹999 + GST (waived above ₹2L spend)",
      rewardRate: "10% cashback on dining, food delivery & telecom (capped ₹1,000/month)",
      milestoneBenefit: "None",
      loungeAccess: "Not included",
    },
    {
      id: "axis-atlas",
      name: "Axis Atlas",
      issuer: "Axis Bank",
      network: "Visa Infinite",
      annualFee: "₹5,000 + GST",
      rewardRate: "2 EDGE Miles / ₹100 (5x on travel categories)",
      milestoneBenefit: "2,500–5,000 bonus miles at tiered annual spend",
      loungeAccess: "Tiered: up to unlimited domestic + international",
    },
    {
      id: "yes-marquee",
      name: "YES Bank Marquee",
      issuer: "YES Bank",
      network: "Visa Infinite (metal)",
      annualFee: "₹9,999 + GST",
      rewardRate: "12 points / ₹200",
      milestoneBenefit: "Marquee membership + brand vouchers at renewal",
      loungeAccess: "Unlimited, domestic + international (Priority Pass)",
    },
  ],
  trending: [
    // Curated — X has no free/legal API, so this side stays hand-picked.
    // `detail` is used directly as the "why trending" summary in the Grapevine.
    {
      id: "t1",
      label: "#MonzaWeekend",
      platform: "x",
      detail: "Formula 1 fans are dissecting Friday practice data ahead of the Italian Grand Prix at Monza. The debate centres on whether Pirelli's hard compound will survive the high-speed banking sections, with most teams expected to run a one-stop strategy.",
    },
    {
      id: "t3",
      label: "#GPT6Rumors",
      platform: "x",
      detail: "Unverified screenshots purporting to show an OpenAI internal changelog for GPT-6 are circulating widely. AI researchers are split: some flag signs consistent with a real document, others point to metadata inconsistencies suggesting a fabrication.",
    },
    {
      id: "t5",
      label: "#Monsoon2026",
      platform: "x",
      detail: "A dramatic timelapse of Bengaluru's evening downpour yesterday is going viral, racking up millions of views. The city received 94mm of rain in under three hours — its heaviest single-evening event since 2022 — triggering waterlogging across the outer ring road.",
    },
    {
      id: "t6",
      label: "#AxisAtlasTiers",
      platform: "x",
      detail: "Axis Bank quietly updated the spend thresholds for the Atlas card's lounge-access tiers overnight. Cardholders are sharing screenshots showing the domestic visit cap dropped from 8 to 5 at the base tier, drawing frustration from frequent flyers.",
    },
    {
      id: "t7",
      label: "#UPICreditLine",
      platform: "x",
      detail: "RBI's pilot to allow credit lines directly on UPI is generating heated debate among fintech founders and consumer advocates. Proponents say it democratises short-term credit; critics argue it will normalise debt for everyday grocery purchases among users unprepared for interest charges.",
    },
    // Fallback Reddit set — replaced by getRedditTrending() when it succeeds.
    {
      id: "t2",
      label: "RBI's new UPI credit-line pilot",
      platform: "reddit",
      detail: "r/personalfinanceindia · 3,400 comments",
      summary: "RBI has greenlit a pilot allowing banks to offer revolving credit lines directly through UPI. The thread is divided: some see it as a major step toward financial inclusion, while others worry it will trap lower-income users in high-interest debt disguised as frictionless payments.",
    },
    {
      id: "t4",
      label: "Axis Atlas tier-change megathread",
      platform: "reddit",
      detail: "r/personalfinanceindia · 2,100 upvotes",
      summary: "Following Axis Bank's revision of Atlas spend thresholds, cardholders are documenting exactly how many lounge visits they're losing. The consensus in the thread is that the card's value proposition has weakened at the base tier, and several users are asking whether TravelOne or the HDFC Regalia Gold is now a better replacement.",
    },
    {
      id: "t8",
      label: "Monza tyre strategy — who blinks first?",
      platform: "reddit",
      detail: "r/formula1 · 1,800 upvotes",
      summary: "With Monza's low-downforce layout punishing hard on tyre deg, r/formula1 is running statistical simulations on whether a one-stop is viable for the top teams. The thread is particularly focused on whether McLaren will split strategies between Norris and Piastri to cover both scenarios.",
    },
    {
      id: "t9",
      label: "Browser AI tab redesigns — three takes, one week",
      platform: "reddit",
      detail: "r/technology · 4,200 upvotes",
      summary: "Chrome, Arc, and Safari each dropped AI-assisted tab management features within the same week, and r/technology is comparing them side by side. The dominant view is that Chrome's implementation is the most aggressive — auto-grouping tabs without asking — while Arc's feels more like a suggestion engine.",
    },
    {
      id: "t10",
      label: "Best card for a first international trip",
      platform: "reddit",
      detail: "r/personalfinanceindia · 980 upvotes",
      summary: "A recurring question that draws a crowd every time: which card minimises forex markup and maximises lounge access for a first overseas trip? This week's thread has settled into a two-horse race between HSBC TravelOne (strong forex rate, Priority Pass) and Axis Atlas (better miles accrual if you book via the portal).",
    },
  ],
  onThisDay: [
    {
      year: "1997",
      text: "Google's precursor, BackRub, was already crawling Stanford's servers, though the name \"Google\" wouldn't be registered for another month.",
    },
    {
      year: "2005",
      text: "Hurricane Katrina made its second landfall near the Louisiana-Mississippi border.",
    },
    {
      year: "2013",
      text: "Indian sprinter Milkha Singh's biopic rights were auctioned, sparking a bidding war among production houses.",
    },
  ],
  wordOfDay: {
    word: "petrichor",
    pronunciation: "PET-rih-kor",
    partOfSpeech: "noun",
    definition:
      "the pleasant, earthy smell that accompanies the first rain after a long dry spell.",
    example:
      "The newsroom's windows were open just long enough to catch the petrichor before the downpour reached the desk.",
  },
  sections: {
    // Dateline is now built entirely from live wire sources at request time
    // (see app/page.tsx: promoteWireToStories) so every story there carries
    // a real source link and a real, recent timestamp. This array is the
    // fallback used only if the live fetch fails outright.
    dateline: [],
    // Paddock Notes now runs on live F1 news (Autosport + Motorsport.com),
    // each promoted story carrying a real source link and timestamp — see
    // app/page.tsx. Empty here is the fallback for a total live-fetch failure.
    paddockNotes: [],
    // Sky Report's narrative is now the real, template-generated sentence
    // from lib/live/weather.ts (built from live Open-Meteo data), not a
    // hand-authored story — see SkyReportSection.
    skyReport: [],
    // The Circuit Board now runs on live tech news (TechCrunch), promoted
    // the same way as Dateline/Ledger. Empty here is the total-failure
    // fallback.
    circuitBoard: [],
    // Same deal as Dateline — The Ledger's stories now come from the live
    // markets wire at request time, each with a real source link and a
    // fresh timestamp. This is the fallback for a total live-fetch failure.
    ledger: [],
    // Plastic & Points runs on the live, keyword-filtered credit-card wire —
    // it's often sparse (0-2 matches on a given day) since no dedicated free
    // feed exists; an empty section is the honest outcome on a quiet day,
    // not a bug. See app/page.tsx / lib/live/credit-card-wire.ts.
    plasticPoints: [],
    // Market Pulse's narrative is dropped entirely in favor of real,
    // per-index factual lines generated straight from live Yahoo Finance
    // data (see lib/live/indices.ts) — no separate "market wrap" story.
    marketPulse: [],
    // No narrative wrap-up story here — there's no honest single source to
    // attribute a synthesized "what the internet is talking about" summary
    // to. The section is just the live/curated trending ticker below.
    grapevine: [],
  },
};
