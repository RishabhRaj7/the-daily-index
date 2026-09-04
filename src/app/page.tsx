import { cookies } from "next/headers";
import type { Edition, FootballStanding, GrapevineData, TennisRanking, WireBrief } from "@/lib/types";
import EditionView from "@/components/EditionView";
import { getLiveF1, getF1Roster } from "@/lib/live/f1";
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
import { buildEditorsPicks } from "@/lib/live/editors-picks";
import { parseInterestsCookie } from "@/lib/personalization";
import { buildMatchers, matchBrief, rankBriefsByInterest } from "@/lib/interest-match";
import { getRedditConnection, getUserSubreddits } from "@/lib/reddit-auth";

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

  // Interests (names only) — used to weight Editor's Picks toward the reader.
  const interestsRaw = parseInterestsCookie(cookieStore.get("daily-index:interests")?.value);
  const followedCard = MY_CARDS.find((c) => c.id === interestsRaw.card);
  // Driver names are resolved after the roster fetch below (see interests).
  const interestsBase = {
    ...interestsRaw,
    // Resolve the card ID to a matchable name, e.g. "Axis Atlas".
    card: followedCard ? `${followedCard.issuer} ${followedCard.name}` : "",
  };

  const multiSport = userSports.length > 1;
  const perSport = multiSport ? 3 : 5;

  // Connected Reddit account (Login-with-Reddit): the reader's *actual*
  // subscriptions drive the column. A hand-picked list in Settings is merged
  // first so explicit choices always win; the rest fills from subscriptions.
  let redditUser: string | null = null;
  let connectedSubs: string[] = [];
  try {
    const conn = await getRedditConnection();
    if (conn) {
      redditUser = conn.redditUsername;
      connectedSubs = await getUserSubreddits();
    }
  } catch {
    // DB unreachable — fall back to the cookie list below.
  }

  // When no subreddits configured, derive from sports so the Grapevine feels
  // relevant from day one.
  const fallbackSubs = [
    ...userSports.map((s) =>
      s === "f1" ? "formula1" : s === "football" ? "soccer" : "tennis",
    ),
    "personalfinanceindia",
    "technology",
  ];
  const effectiveSubreddits =
    userSubreddits.length > 0
      ? [...new Set([...userSubreddits, ...connectedSubs])].slice(0, 8)
      : connectedSubs.length > 0
        ? connectedSubs.slice(0, 8)
        : fallbackSubs;

  // Fetch per-sport feeds independently so we can filter hate-watch from the
  // full set (before the perSport cap applied to the main section).
  const [
    liveF1,
    f1Roster,
    f1FeedRaw,
    footballFeedRaw,
    tennisFeedRaw,
    footballData,
    tennisDataRaw,
    techNewsAll,
    worldWireAll,
    marketsWireAll,
    cardsWireAll,
    redditResult,
    liveMarkets,
    onThisDay,
    wordOfDay,
  ] = await Promise.all([
    getLiveF1(),
    getF1Roster(),
    userSports.includes("f1")       ? getF1News(20)       : Promise.resolve([] as WireBrief[]),
    userSports.includes("football") ? getFootballNews(20) : Promise.resolve([] as WireBrief[]),
    userSports.includes("tennis")   ? getTennisNews(20)   : Promise.resolve([] as WireBrief[]),
    userSports.includes("football")
      ? getFootballStandings()
      : Promise.resolve(null as { league: string; standings: FootballStanding[] } | null),
    userSports.includes("tennis")
      ? getTennisRankings().then((rankings) => ({ rankings }))
      : Promise.resolve(null as { rankings: TennisRanking[] } | null),
    getTechNews(14),
    getWorldIndiaWire(16),
    getMarketsWire(14),
    getCreditCardWire(),
    getRedditTrending(5, effectiveSubreddits),
    getLiveMarkets(),
    getOnThisDay(),
    getWordOfDay(),
  ]);

  // Preferences drive ranking everywhere below: matching stories float to
  // the top of their section pool and get tagged `personal` ("For you").
  // Driver cookie stores roster IDs — resolve to real names for matching.
  const rosterById = new Map(f1Roster.map((d) => [d.id, d]));
  const interests = {
    ...interestsBase,
    f1Drivers: interestsBase.f1Drivers.map((id) => rosterById.get(id)?.name ?? id),
  };
  const matchers = buildMatchers(interests);
  const rankPool = (briefs: WireBrief[], pool: string) =>
    rankBriefsByInterest(briefs, matchers, pool);
  const personalTag = (pool: string) => (b: WireBrief) =>
    matchBrief(b, matchers, pool)?.label ?? null;

  const worldWire = rankPool(worldWireAll, "World");
  const marketsWire = rankPool(marketsWireAll, "Markets");
  const techNews = rankPool(techNewsAll, "Tech");
  const cardsWire = rankPool(cardsWireAll, "Cards");
  const f1Feed = userSports.includes("f1") ? rankPool(f1FeedRaw, "F1") : f1FeedRaw;
  const footballFeed = userSports.includes("football") ? rankPool(footballFeedRaw, "Football") : footballFeedRaw;
  const tennisFeed = userSports.includes("tennis") ? rankPool(tennisFeedRaw, "Tennis") : tennisFeedRaw;

  // Editor's Picks — real stories from today's pool that didn't make a main
  // slot, ranked for curiosity + the reader's stated interests. Never invented.
  const mainStoryUrls = new Set<string>([
    ...worldWire.slice(0, 5),
    ...marketsWire.slice(0, 5),
    ...techNews.slice(0, 5),
    ...f1Feed.slice(0, perSport),
    ...footballFeed.slice(0, perSport),
    ...tennisFeed.slice(0, perSport),
  ].map((b) => b.url));
  const editorsPicks = buildEditorsPicks(
    [
      { label: "World", briefs: worldWire },
      { label: "Markets", briefs: marketsWire },
      { label: "Tech", briefs: techNews },
      { label: "Cards", briefs: cardsWire },
      { label: "F1", briefs: f1Feed },
      { label: "Football", briefs: footballFeed },
      { label: "Tennis", briefs: tennisFeed },
    ],
    { interests, sports: userSports, excludeUrls: mainStoryUrls, limit: 5 },
  );
  const grapevine: GrapevineData = {
    picks: editorsPicks,
    reddit: redditResult.topics,
    redditStatus: redditResult.status,
    redditNote: redditResult.note,
  };

  // Hate-watch stories — best negative headline per subject; total capped at 1
  const hateWatchRaw = [
    ...filterHateWatch(f1Feed,       hateWatch.f1).slice(0, 1),
    ...filterHateWatch(footballFeed, hateWatch.football).slice(0, 1),
    ...filterHateWatch(tennisFeed,   hateWatch.tennis).slice(0, 1),
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
    { briefs: worldWire,    section: "dateline",      count: 5, personalize: personalTag("World") },
    { briefs: marketsWire,  section: "ledger",        count: 5, personalize: personalTag("Markets") },
    { briefs: f1Feed,       section: "paddock-notes", count: perSport, personalize: personalTag("F1") },
    { briefs: footballFeed, section: "paddock-notes", count: perSport, personalize: personalTag("Football") },
    { briefs: tennisFeed,   section: "paddock-notes", count: perSport, personalize: personalTag("Tennis") },
    { briefs: techNews,     section: "circuit-board", count: 5, personalize: personalTag("Tech") },
    { briefs: cardsWire,    section: "plastic-points", count: cardsWire.length, personalize: personalTag("Cards") },
    { briefs: hateWatchRaw, section: "paddock-notes", count: 1 },
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
    trending: redditResult.topics,
    grapevine,
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
      redditLive={redditResult.status === "live"}
      hateWatchStories={hateWatchStories}
      summaryArticles={summaryArticles}
      f1Stories={f1Stories}
      footballStories={footballStories}
      tennisStories={tennisStories}
      footballData={footballData}
      tennisData={tennisDataRaw}
      redditUser={redditUser}
      feedSubreddits={effectiveSubreddits}
    />
  );
}
