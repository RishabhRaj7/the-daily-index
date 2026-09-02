import { cookies } from "next/headers";
import type { Edition, FootballStanding, TennisRanking, WireBrief } from "@/lib/types";
import EditionView from "@/components/EditionView";
import { getLiveF1 } from "@/lib/live/f1";
import { getF1News } from "@/lib/live/f1-news";
import { getFootballNews } from "@/lib/live/football-news";
import { getTennisNews } from "@/lib/live/tennis-news";
import { getTechNews } from "@/lib/live/tech-news";
import { getWorldIndiaWire, getMarketsWire } from "@/lib/live/news";
import { getCreditCardWire } from "@/lib/live/credit-card-wire";
import { getRedditTrending } from "@/lib/live/reddit";
import { getLiveMarkets } from "@/lib/live/indices";
import { buildSectionsSync } from "@/lib/live/wire-to-story";
import { getOnThisDay } from "@/lib/live/onthistday";
import { getWordOfDay } from "@/lib/live/wordofday";
import { getFootballStandings } from "@/lib/live/football-stats";
import { getTennisRankings } from "@/lib/live/tennis-stats";
import { MY_CARDS } from "@/lib/config/cards";
import { CURATED_X_TOPICS } from "@/lib/config/x-topics";

// Vol 1, No. 1 = 28 Jan 2026.
const ISSUE_BASE = new Date("2026-01-28");

function editionMeta() {
  const now = new Date();
  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const isoDate = now.toISOString().slice(0, 10);
  const issue = Math.floor((now.getTime() - ISSUE_BASE.getTime()) / 86_400_000) + 1;
  const volume = now.getFullYear() - 2025;
  return { date, isoDate, volume, issue };
}

// Keyword signals that indicate a sports article is genuinely bad news for the subject.
// An article must mention the subject AND contain at least one of these to appear in Schadenfreude.
const NEGATIVE_SIGNALS = [
  "loses", "lost", "defeat", "crash", "penalt", "ban", "suspend", "drop",
  "scandal", "fail", "miss", "error", "injur", "dnf", "retir", "fine",
  "disqualif", "controversial", "resign", "sacked", "relegated", "protest",
  "backlash", "criticis", "blunder", "red card", "poor", "worst",
  "leav", "departing", "exit", "fired", "demot", "under investigation",
  "stripped", "appeal", "overrul", "ruled out", "withdraw", "concede",
];

function filterHateWatch(articles: WireBrief[], subject: string): WireBrief[] {
  if (!subject.trim()) return [];
  const term = subject.toLowerCase();
  const hasNeg = (text: string) =>
    NEGATIVE_SIGNALS.some((s) => text.toLowerCase().includes(s));
  return articles
    .filter((a) => {
      const title = a.title.toLowerCase();
      const summary = (a.summary ?? "").toLowerCase();
      const mentionsSubject = title.includes(term) || summary.includes(term);
      const isNegative = hasNeg(a.title) || hasNeg(a.summary ?? "");
      return mentionsSubject && isNegative;
    })
    .sort((a, b) => {
      // Count negative signals — more signals = more negative, surface first
      const score = (text: string) =>
        NEGATIVE_SIGNALS.filter((s) => text.toLowerCase().includes(s)).length;
      return (score(b.title) + score(b.summary ?? "")) - (score(a.title) + score(a.summary ?? ""));
    })
    .slice(0, 3);
}

export default async function Home() {
  const cookieStore = await cookies();

  // Subreddits preference
  const subredditsCookie = cookieStore.get("daily-index:subreddits");
  const userSubreddits: string[] = (() => {
    if (!subredditsCookie?.value) return [];
    try { return JSON.parse(decodeURIComponent(subredditsCookie.value)); }
    catch { return []; }
  })();

  // Sports preference
  const sportsCookie = cookieStore.get("daily-index:sports");
  const userSports: ("f1" | "football" | "tennis")[] = (() => {
    if (!sportsCookie?.value) return ["f1"];
    try {
      const parsed = JSON.parse(decodeURIComponent(sportsCookie.value));
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : ["f1"];
    } catch { return ["f1"]; }
  })();

  // Hate-watch subjects (one per sport)
  const hateWatchCookie = cookieStore.get("daily-index:hate-watch");
  const hateWatch: Record<"f1" | "football" | "tennis", string> = (() => {
    if (!hateWatchCookie?.value) return { f1: "", football: "", tennis: "" };
    try {
      const p = JSON.parse(decodeURIComponent(hateWatchCookie.value));
      return {
        f1:       typeof p.f1       === "string" ? p.f1       : "",
        football: typeof p.football === "string" ? p.football : "",
        tennis:   typeof p.tennis   === "string" ? p.tennis   : "",
      };
    } catch { return { f1: "", football: "", tennis: "" }; }
  })();

  const multiSport = userSports.length > 1;
  const perSport = multiSport ? 3 : 5;

  // When no subreddits configured, derive from sports so the Grapevine feels
  // relevant from day one.
  const effectiveSubreddits =
    userSubreddits.length > 0
      ? userSubreddits
      : [
          ...userSports.map((s) =>
            s === "f1" ? "formula1" : s === "football" ? "soccer" : "tennis",
          ),
          "personalfinanceindia",
          "technology",
        ];

  // Fetch per-sport feeds independently so we can filter hate-watch from the
  // full set (before the perSport cap applied to the main section).
  const [
    liveF1,
    f1FeedRaw,
    footballFeedRaw,
    tennisFeedRaw,
    footballData,
    tennisDataRaw,
    techNewsAll,
    worldWireAll,
    marketsWireAll,
    cardsWireAll,
    redditTrending,
    liveMarkets,
    onThisDay,
    wordOfDay,
  ] = await Promise.all([
    getLiveF1(),
    userSports.includes("f1")       ? getF1News(20)       : Promise.resolve([] as WireBrief[]),
    userSports.includes("football") ? getFootballNews(20) : Promise.resolve([] as WireBrief[]),
    userSports.includes("tennis")   ? getTennisNews(20)   : Promise.resolve([] as WireBrief[]),
    userSports.includes("football")
      ? getFootballStandings()
      : Promise.resolve(null as { league: string; standings: FootballStanding[] } | null),
    userSports.includes("tennis")
      ? getTennisRankings().then((rankings) => ({ rankings }))
      : Promise.resolve(null as { rankings: TennisRanking[] } | null),
    getTechNews(8),
    getWorldIndiaWire(10),
    getMarketsWire(10),
    getCreditCardWire(),
    getRedditTrending(5, effectiveSubreddits),
    getLiveMarkets(),
    getOnThisDay(),
    getWordOfDay(),
  ]);

  // Hate-watch stories — best negative headline per subject; total capped at 1
  const hateWatchRaw = [
    ...filterHateWatch(f1FeedRaw,       hateWatch.f1).slice(0, 1),
    ...filterHateWatch(footballFeedRaw, hateWatch.football).slice(0, 1),
    ...filterHateWatch(tennisFeedRaw,   hateWatch.tennis).slice(0, 1),
  ];

  // Build sections synchronously from raw RSS snippets — page renders immediately.
  // The client fetches AI summaries in the background via /api/summarize.
  // Sports sections are built per-sport so each gets its own sidebar in the component.
  const [
    { stories: datelineStories },
    { stories: ledgerStories },
    { stories: f1Raw },
    { stories: footballRaw },
    { stories: tennisRaw },
    { stories: circuitStories },
    { stories: plasticStories },
    { stories: hateWatchStories },
  ] = buildSectionsSync([
    { briefs: worldWireAll,                                                    section: "dateline",       count: 5 },
    { briefs: marketsWireAll,                                                  section: "ledger",         count: 5 },
    { briefs: userSports.includes("f1")       ? f1FeedRaw       : [],          section: "paddock-notes",  count: perSport },
    { briefs: userSports.includes("football") ? footballFeedRaw : [],          section: "paddock-notes",  count: perSport },
    { briefs: userSports.includes("tennis")   ? tennisFeedRaw   : [],          section: "paddock-notes",  count: perSport },
    { briefs: techNewsAll,                                                     section: "circuit-board",  count: 5 },
    { briefs: cardsWireAll,                                                    section: "plastic-points", count: cardsWireAll.length },
    { briefs: hateWatchRaw,                                                    section: "paddock-notes",  count: 1 },
  ]);

  // Rename IDs to avoid collisions — all three sport sections share the same
  // section key "paddock-notes" so wireBriefToStory would generate duplicate IDs.
  const f1Stories      = f1Raw.map((s, i)       => ({ ...s, id: `wire-paddock-notes-f1-${i}` }));
  const footballStories = footballRaw.map((s, i) => ({ ...s, id: `wire-paddock-notes-football-${i}` }));
  const tennisStories  = tennisRaw.map((s, i)   => ({ ...s, id: `wire-paddock-notes-tennis-${i}` }));

  // Combined for edition.sections.paddockNotes (used by hero picker)
  const paddockStories = [...f1Stories, ...footballStories, ...tennisStories];

  // Collect article data for client-side summarization (sent to /api/summarize).
  const summaryArticles = [
    ...datelineStories,
    ...ledgerStories,
    ...f1Stories,
    ...footballStories,
    ...tennisStories,
    ...circuitStories,
    ...plasticStories,
    ...hateWatchStories,
  ]
    .filter((s) => s.sourceUrl)
    .map((s) => ({ id: s.id, url: s.sourceUrl!, snippet: s.body[0] ?? "" }));

  const edition: Edition = {
    ...editionMeta(),
    // weather is intentionally absent here — EditionView fetches it live
    // on the client using the user's homeCity from personalization settings.
    f1: liveF1 ?? null,
    markets: {
      indices: liveMarkets?.indices ?? [],
      mood: liveMarkets?.mood ?? null,
    },
    creditCards: MY_CARDS,
    trending: [
      ...CURATED_X_TOPICS.slice(0, 5),
      ...redditTrending.slice(0, 5),
    ],
    onThisDay,
    wordOfDay,
    sections: {
      dateline: datelineStories,
      paddockNotes: paddockStories,
      skyReport: [],
      circuitBoard: circuitStories,
      ledger: ledgerStories,
      plasticPoints: plasticStories,
      marketPulse: [],
      grapevine: [],
    },
  };

  return (
    <EditionView
      edition={edition}
      f1Live={Boolean(liveF1)}
      redditLive={redditTrending.length > 0}
      hateWatchStories={hateWatchStories}
      summaryArticles={summaryArticles}
      f1Stories={f1Stories}
      footballStories={footballStories}
      tennisStories={tennisStories}
      footballData={footballData}
      tennisData={tennisDataRaw}
    />
  );
}
