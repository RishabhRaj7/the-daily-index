import { cookies } from "next/headers";
import type { Edition, FootballStanding, GrapevineData, TennisRanking, WireBrief } from "@/lib/types";
import EditionView from "@/components/EditionView";
import { getF1Schedule, getF1Roster } from "@/lib/live/f1";
import { getF1News } from "@/lib/live/f1-news";
import { getFootballNews } from "@/lib/live/football-news";
import { getTennisNews } from "@/lib/live/tennis-news";
import { getTechNews } from "@/lib/live/tech-news";
import { getWorldIndiaWire, getMarketsWire } from "@/lib/live/news";
import { getRedditTrending } from "@/lib/live/reddit";
import { getLiveMarkets } from "@/lib/live/indices";
import { buildSectionsSync } from "@/lib/live/wire-to-story";
import { getOnThisDay } from "@/lib/live/onthistday";
import { getWordOfDay } from "@/lib/live/wordofday";
import { getFootballStandings } from "@/lib/live/football-stats";
import type { FootballLeagueData } from "@/lib/live/football-stats";
import { getTennisRankings } from "@/lib/live/tennis-stats";
import { buildEditorsPicks } from "@/lib/live/editors-picks";
import { parseInterestsCookie } from "@/lib/personalization";
import { buildMatchers, matchBrief, rankBriefsByInterest } from "@/lib/interest-match";
import { getRedditConnection, getUserSubreddits } from "@/lib/reddit-auth";
import { editionDate, editionDateLabel } from "@/lib/edition-date";
import { EDITION_COOKIE } from "@/lib/edition-client";
import { readEdition, readStoredPrefs } from "@/lib/server/editions";
import type { DigestPreferences, DigestResult } from "@/lib/preferences/types";

// Vol 1, No. 1 = 28 Jan 2026.
const ISSUE_BASE = new Date("2026-01-28");

// Dates follow the edition's time zone (IST by default), not the server's
// UTC clock, so the masthead and the server-built edition agree on "today".
function editionMeta() {
  const isoDate = editionDate();
  const date = editionDateLabel();
  const issue = Math.floor((Date.parse(isoDate) - ISSUE_BASE.getTime()) / 86_400_000) + 1;
  const volume = Number(isoDate.slice(0, 4)) - 2025;
  return { date, isoDate, volume, issue };
}

async function loadInitialDigest(
  hash: string | undefined,
): Promise<{ result: DigestResult; prefs: DigestPreferences } | null> {
  if (!hash || !/^[0-9a-f]{16}$/.test(hash)) return null;
  try {
    const [edition, prefs] = await Promise.all([readEdition(editionDate(), hash), readStoredPrefs(hash)]);
    return edition && prefs ? { result: edition.digest, prefs } : null;
  } catch {
    // Store unreachable — the browser fetches the edition itself.
    return null;
  }
}

export default async function Home() {
  const cookieStore = await cookies();

  // Today's edition for this reader, if the server already built it: the
  // browser remembers its edition in a cookie, and the preferences that
  // built it are stored with it. Started now, awaited after the feeds.
  const initialDigestPromise = loadInitialDigest(cookieStore.get(EDITION_COOKIE)?.value);
  const redditEnabled = process.env.REDDIT_ENABLED === "true";

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


  // Interests (names only) — used to weight Editor's Picks toward the reader.
  // Driver names are resolved after the roster fetch below (see interests).
  const interestsBase = parseInterestsCookie(cookieStore.get("daily-index:interests")?.value);

  const multiSport = userSports.length > 1;
  const perSport = multiSport ? 3 : 5;

  // Connected Reddit account (Login-with-Reddit): the reader's *actual*
  // subscriptions drive the column. A hand-picked list in Settings is merged
  // first so explicit choices always win; the rest fills from subscriptions.
  // The DB round-trip is started but NOT awaited here — it overlaps the big
  // fetch block below instead of serialising ahead of it.
  const redditConnectionPromise: Promise<{ user: string; subs: string[] } | null> = (async () => {
    try {
      if (!redditEnabled) return null;
      const conn = await getRedditConnection();
      if (!conn) return null;
      return { user: conn.redditUsername, subs: await getUserSubreddits() };
    } catch {
      // DB unreachable — fall back to the cookie list below.
      return null;
    }
  })();

  // When no subreddits configured, derive from sports so the Grapevine feels
  // relevant from day one.
  const fallbackSubs = [
    ...userSports.map((s) =>
      s === "f1" ? "formula1" : s === "football" ? "soccer" : "tennis",
    ),
    "personalfinanceindia",
    "technology",
  ];

  // Fetch per-sport feeds independently so we can filter hate-watch from the
  // full set (before the perSport cap applied to the main section).
  //
  // F1 note: the sidebar used to be served by one `getLiveF1()` waterfall
  // (~10 sequential upstream calls) on this page's critical path — a slow
  // OpenF1 endpoint stalled the whole edition, and a failed one printed a
  // dead "unavailable" until the next load. Now the page only fetches the
  // fast schedule here; standings / last-race / grid stream into the sidebar
  // via /api/f1 (see components/widgets/F1Sidebar.tsx).
  const [
    f1Schedule,
    f1Roster,
    f1FeedRaw,
    footballFeedRaw,
    tennisFeedRaw,
    footballData,
    tennisDataRaw,
    techNewsAll,
    worldWireAll,
    marketsWireAll,
    redditBundle,
    liveMarkets,
    onThisDay,
    wordOfDay,
  ] = await Promise.all([
    getF1Schedule(),
    getF1Roster(),
    userSports.includes("f1")       ? getF1News(20)       : Promise.resolve([] as WireBrief[]),
    userSports.includes("football") ? getFootballNews(20) : Promise.resolve([] as WireBrief[]),
    userSports.includes("tennis")   ? getTennisNews(20)   : Promise.resolve([] as WireBrief[]),
    userSports.includes("football")
      ? getFootballStandings()
      : Promise.resolve(null as { leagues: FootballLeagueData[] } | null),
    userSports.includes("tennis")
      ? getTennisRankings().then((rankings) => ({ rankings }))
      : Promise.resolve(null as { rankings: TennisRanking[] } | null),
    getTechNews(14),
    getWorldIndiaWire(16),
    getMarketsWire(14),
    // The Reddit column waits on the connected-account lookup (started
    // above) — both still run inside this block, overlapping the rest.
    redditEnabled
      ? redditConnectionPromise.then(async (conn) => {
          const connectedSubs = conn?.subs ?? [];
          const effectiveSubreddits =
            userSubreddits.length > 0
              ? [...new Set([...userSubreddits, ...connectedSubs])].slice(0, 8)
              : connectedSubs.length > 0
                ? connectedSubs.slice(0, 8)
                : fallbackSubs;
          const result = await getRedditTrending(5, effectiveSubreddits);
          return { result, user: conn?.user ?? null, subs: effectiveSubreddits };
        })
      : Promise.resolve({
          result: {
            topics: [],
            status: "unconfigured" as const,
            note: "Reddit fetching is disabled by REDDIT_ENABLED.",
            fetchedAt: new Date().toISOString(),
          },
          user: null as string | null,
          subs: userSubreddits.length > 0 ? userSubreddits.slice(0, 8) : fallbackSubs,
        }),
    getLiveMarkets(),
    getOnThisDay(),
    getWordOfDay(),
  ]);

  const { result: redditResult, user: redditUser, subs: effectiveSubreddits } = redditBundle;
  const initialDigest = await initialDigestPromise;

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
  ] = buildSectionsSync([
    { briefs: worldWire,    section: "dateline",      count: 5, personalize: personalTag("World") },
    { briefs: marketsWire,  section: "ledger",        count: 5, personalize: personalTag("Markets") },
    { briefs: f1Feed,       section: "paddock-notes", count: perSport, personalize: personalTag("F1") },
    { briefs: footballFeed, section: "paddock-notes", count: perSport, personalize: personalTag("Football") },
    { briefs: tennisFeed,   section: "paddock-notes", count: perSport, personalize: personalTag("Tennis") },
    { briefs: techNews,     section: "circuit-board", count: 5, personalize: personalTag("Tech") },
  ]);

  // Rename IDs to avoid collisions — all three sport sections share the same
  // section key "paddock-notes" so wireBriefToStory would generate duplicate IDs.
  const f1Stories      = f1Raw.map((s, i)       => ({ ...s, id: `wire-paddock-notes-f1-${i}` }));
  const footballStories = footballRaw.map((s, i) => ({ ...s, id: `wire-paddock-notes-football-${i}` }));
  const tennisStories  = tennisRaw.map((s, i)   => ({ ...s, id: `wire-paddock-notes-tennis-${i}` }));

  // Combined for edition.sections.paddockNotes (used by hero picker)
  const paddockStories = [...f1Stories, ...footballStories, ...tennisStories];

  const edition: Edition = {
    ...editionMeta(),
    // weather is intentionally absent here — EditionView fetches it live
    // on the client using the user's homeCity from personalization settings.
    //
    // F1 is intentionally schedule-only here: the fast calendar paints with
    // the rest of the edition, while standings and results stream into the
    // sidebar afterwards via /api/f1 (progressive loading — see F1Sidebar).
    f1: f1Schedule
      ? {
          nextRace: f1Schedule.nextRace,
          upcoming: f1Schedule.upcoming,
          standings: [],
          constructorStandings: [],
          lastRace: null,
          qualifyingGrid: [],
          liveResults: [],
          currentRace: null,
          racePhase: "last-race",
        }
      : null,
    markets: {
      indices: liveMarkets?.indices ?? [],
      mood: liveMarkets?.mood ?? null,
      moods: liveMarkets?.moods ?? [],
      commodities: liveMarkets?.commodities ?? [],
    },
    trending: redditResult.topics,
    grapevine,
    onThisDay,
    wordOfDay,
    sections: {
      dateline: datelineStories,
      twoCities: [],
      paddockNotes: paddockStories,
      skyReport: [],
      circuitBoard: circuitStories,
      ledger: ledgerStories,
      marketPulse: [],
      grapevine: [],
    },
  };

  return (
    <EditionView
      edition={edition}
      f1Live={Boolean(f1Schedule)}
      redditLive={redditResult.status === "live"}
      initialDigest={initialDigest}
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
