"use client";

import { ArrowUpIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Edition,
  EditionBrief,
  FootballStanding,
  GrapevineData,
  IssueRecord,
  Personalization,
  ReaderMemory,
  ReaderProfile,
  SectionKey,
  Story,
  TennisRanking,
  WeatherAlert,
  WeatherNow,
} from "@/lib/types";
import type { FootballLeagueData } from "@/lib/live/football-stats";
import { pickHeroStory } from "@/lib/format";
import {
  DEFAULT_PERSONALIZATION,
  loadPersonalization,
  PERSONALIZATION_CHANGED_EVENT,
  F1_TEAM_COLORS,
} from "@/lib/personalization";
import { getLiveWeather, getWeatherAt } from "@/lib/live/weather";
import PostcardSection from "@/components/sections/PostcardSection";
import {
  loadTravel,
  refreshTravel,
  travelIsStale,
  TRAVEL_CHANGED_EVENT,
  type TravelState,
} from "@/lib/travel";
import { isCitySection } from "@/lib/preferences/prompt";
import {
  buildProfile,
  engagementsSince,
  loadMemory,
  personalOnThisDay,
  rankForReader,
  recordIssueOpened,
} from "@/lib/reader-memory";
import { fallbackEditorsNote } from "@/lib/live/editorial-ai";
import {
  consumeForcedSummarize,
  mergeSummaryRecord,
  readNote,
  readPickBlurbs,
  readSummaryRecord,
  writeNote,
  writePickBlurbs,
} from "@/lib/summary-cache";
import Masthead from "@/components/masthead/Masthead";
import { until } from "@/components/masthead/SignalRow";
import HeroStory from "@/components/story/HeroStory";
import FrontStrip from "@/components/widgets/FrontStrip";
import { chaptersFor, type PrintedChapter } from "@/lib/chapters";
import WeekAhead from "@/components/widgets/WeekAhead";
import ListenButton from "@/components/extras/ListenButton";
import PullToRefreshStamp from "@/components/chrome/PullToRefreshStamp";
import DatelineSection from "@/components/sections/DatelineSection";
import TwoCitiesSection from "@/components/sections/TwoCitiesSection";
import NationSection from "@/components/sections/NationSection";
import PaddockNotesSection from "@/components/sections/PaddockNotesSection";
import SportsSection from "@/components/sections/SportsSection";
import SkyReportSection from "@/components/sections/SkyReportSection";
import CircuitBoardSection from "@/components/sections/CircuitBoardSection";
import LedgerSection from "@/components/sections/LedgerSection";
import MarketPulseSection from "@/components/sections/MarketPulseSection";
import ClutchSection from "@/components/sections/ClutchSection";
import StrawPollSection from "@/components/sections/StrawPollSection";
import { OddsStrip } from "@/components/odds/OddsCard";
import { RaceOddsContext, SparksContext, useSparks } from "@/components/odds/odds-context";
import InBrief from "@/components/story/InBrief";
import { layoutOdds, raceMarket, scoreOdds, storyOdds, type OddsFollow, type OddsLayout, type OddsPick } from "@/lib/odds-pick";
import { StoryOddsContext } from "@/components/story/StoryOdds";
import type { OddsUniverse } from "@/lib/types";
import GrapevineSection from "@/components/sections/GrapevineSection";
import DigestSectionView from "@/components/digest/DigestSectionView";
import {
  hashPreferences,
  loadDigestPreferences,
  PREFERENCES_CHANGED_EVENT,
} from "@/lib/preferences/storage";
import type {
  DigestArticle,
  DigestPreferences,
  DigestResult,
  DigestSection,
  NewsSlot,
} from "@/lib/preferences/types";
import { deriveBriefFromDigest, digestRevision } from "@/lib/preferences/stories";
import { projectDigest, withProjection } from "@/lib/preferences/project";
import {
  consumeEditionRefresh,
  readDigestCache,
  writeDigestCache,
} from "@/lib/digest-cache";
import EditionPrepOverlay from "@/components/chrome/EditionPrepOverlay";
import WritingNotice from "@/components/chrome/WritingNotice";
import PaperNav from "@/components/chrome/PaperNav";
import type { NavChapter } from "@/components/chrome/TopBar";
import Briefing from "@/components/story/Briefing";
import { digestArticleToStory } from "@/lib/preferences/stories";
import { SECTION_META } from "@/lib/sections";
import { requestEdition, waitForEdition } from "@/lib/edition-client";
import { mergeOpenMarkets, useLiveMarkets } from "@/lib/live-markets";
import type { HolidayMap } from "@/lib/market-hours";
import type { LiveMarkets } from "@/lib/live/indices";

type WeatherState = "loading" | "ready" | "failed";
const WEATHER_TIMEOUT_MS = 9000;

// New content — the edition, the hate-watch summaries, pick blurbs — is
// applied the moment it arrives; there is no "tap to update" step. Only the
// At a Glance panel shows a loading hint while /api/summarize runs.
type SummaryState = "idle" | "loading";
const SUMMARIZE_TIMEOUT_MS = 90_000;
// Edition polling gives up after 300s; this backstop sits just past it.
const DIGEST_TIMEOUT_MS = 320_000;
// While stories wait for Gemini, how often the page asks the server (which
// repairs at most every 5 minutes), and how long a page can sit in a background
// tab before it checks for a newer edition on coming back.
const REPAIR_RECHECK_MS = 5 * 60_000 + 10_000;
const RETURN_RECHECK_MS = 10 * 60_000;

/** A colour for a reader-made section, from what it seems to be about. */
function digestHue(label: string): string {
  const l = label.toLowerCase();
  if (/f1|formula|motor/.test(l)) return "var(--hue-f1)";
  if (/tech|\bai\b|science|gadget/.test(l)) return "var(--hue-tech)";
  if (/market|money|finance|business|econom/.test(l)) return "var(--hue-money)";
  if (/sport|football|tennis|cricket/.test(l)) return "var(--hue-sport)";
  if (/world|news|india|politic/.test(l)) return "var(--hue-world)";
  return "var(--hue-digest)";
}

const EMPTY_GRAPEVINE: GrapevineData = {
  picks: [],
  reddit: [],
  redditStatus: "unavailable",
  redditNote: null,
};

export default function EditionView({
  edition: initialEdition,
  isArchive = false,
  f1Live = false,
  hateWatchStories: initialHateWatchStories = [],
  initialDigest = null,
  f1Stories: initialF1Stories = [],
  footballStories: initialFootballStories = [],
  tennisStories: initialTennisStories = [],
  footballData = null,
  tennisData = null,
}: {
  edition: Edition;
  isArchive?: boolean;
  f1Live?: boolean;
  redditLive?: boolean;
  hateWatchStories?: Story[];
  /** Today's edition, when the server already had it — rendered into the
   *  first HTML so the reader never sees raw wires or the overlay. */
  initialDigest?: { result: DigestResult; prefs: DigestPreferences } | null;
  f1Stories?: Story[];
  footballStories?: Story[];
  tennisStories?: Story[];
  footballData?: { leagues: FootballLeagueData[] } | null;
  tennisData?: { rankings: TennisRanking[] } | null;
}) {
  // Server-rendered edition, projected once for the initial state below.
  const [seed] = useState(() =>
    initialDigest ? projectDigest(initialDigest.result, initialDigest.prefs) : null,
  );
  const [edition, setEdition] = useState(() =>
    seed ? { ...initialEdition, sections: withProjection(initialEdition.sections, seed) } : initialEdition,
  );
  const [hateWatchStories, setHateWatchStories] = useState(() => seed?.rivals ?? initialHateWatchStories);
  const [f1Stories, setF1Stories] = useState(() => (seed?.paddock.f1.length ? seed.paddock.f1 : initialF1Stories));
  const [footballStories, setFootballStories] = useState(() =>
    seed?.paddock.football.length ? seed.paddock.football : initialFootballStories,
  );
  const [tennisStories, setTennisStories] = useState(() =>
    seed?.paddock.tennis.length ? seed.paddock.tennis : initialTennisStories,
  );
  const [summaryState, setSummaryState] = useState<SummaryState>("idle");
  const inFlightRef = useRef<AbortController | null>(null);
  const [brief, setBrief] = useState<EditionBrief | null>(() =>
    initialDigest ? deriveBriefFromDigest(initialDigest.result, initialDigest.prefs) : null,
  );
  const [personalization, setPersonalization] = useState<Personalization>(DEFAULT_PERSONALIZATION);
  // Weather result tagged with the city it is for: a new city reads as
  // "loading" until its own answer lands, without resetting state in an effect.
  const [weatherResult, setWeatherResult] = useState<{
    city: string;
    state: WeatherState;
    data: WeatherNow | null;
  } | null>(null);
  const [grapevine, setGrapevine] = useState<GrapevineData>(initialEdition.grapevine ?? EMPTY_GRAPEVINE);

  // --- preference-driven digest state ---------------------------------------
  const [appliedDigest, setAppliedDigest] = useState<DigestResult | null>(initialDigest?.result ?? null);
  const [standaloneDigest, setStandaloneDigest] = useState<
    Array<{ section: DigestSection; articles: DigestArticle[] }>
  >(() => seed?.standalone ?? []);
  const digestInFlightRef = useRef<AbortController | null>(null);
  // Set at mount when this visit follows "Refresh edition": the server must
  // rebuild rather than hand back the edition the reader already had.
  const forceRebuildRef = useRef(false);
  // Which version of which edition is on the page, so nothing older replaces it.
  const [firstShown] = useState(() =>
    initialDigest ? { hash: hashPreferences(initialDigest.prefs), revision: digestRevision(initialDigest.result) } : null,
  );
  const shownRef = useRef(firstShown);
  const lastCheckRef = useRef(0);
  // What the page tells the reader went wrong (chrome/WritingNotice.tsx).
  const [serverNote, setServerNote] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // --- edition prep overlay ("cooking today's edition") -------------------
  // boot     — first render (SSR included): the opaque overlay is already on
  //            screen so raw RSS snippets never flash before the digest lands
  // cooking  — /api/digest in flight for a cold edition (no cache for today)
  // failed   — the digest call errored; the overlay offers retry / raw wires
  // leaving  — digest applied, overlay fading out
  // revealed — edition visible (either it always was, or prep finished)
  //
  // A warm visit (today's digest already cached for these preferences) skips
  // cooking entirely: the cached edition applies silently at mount and the
  // overlay never appears.
  type PrepPhase = "boot" | "cooking" | "failed" | "leaving" | "revealed";
  const [prep, setPrep] = useState<PrepPhase>(() => (isArchive || initialDigest ? "revealed" : "boot"));
  const [prepReason, setPrepReason] = useState<"first-visit" | "refresh">("first-visit");
  // Mirrors `prep` for callbacks that resolve long after render.
  const prepActiveRef = useRef(!isArchive && !initialDigest);
  const prepLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    prepActiveRef.current = prep === "boot" || prep === "cooking" || prep === "failed";
  }, [prep]);

  const revealEdition = useCallback(() => {
    setPrep("leaving");
    if (prepLeaveTimerRef.current) clearTimeout(prepLeaveTimerRef.current);
    prepLeaveTimerRef.current = setTimeout(() => setPrep("revealed"), 950);
  }, []);

  useEffect(() => {
    return () => {
      if (prepLeaveTimerRef.current) clearTimeout(prepLeaveTimerRef.current);
    };
  }, []);

  // Reader memory (local only)
  const [memory, setMemory] = useState<ReaderMemory | null>(null);
  const [editorsNote, setEditorsNote] = useState<{ text: string; source: "ai" | "desk" } | null>(null);

  const hero = useMemo(() => pickHeroStory(edition), [edition]);

  // --- mount: personalization + reader memory -----------------------------
  useEffect(() => {
    // Browser-only saved state is read after the first render so it matches the server HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPersonalization(loadPersonalization());
    const onPersonalization = () => setPersonalization(loadPersonalization());
    window.addEventListener(PERSONALIZATION_CHANGED_EVENT, onPersonalization);
    const stopPersonalization = () => window.removeEventListener(PERSONALIZATION_CHANGED_EVENT, onPersonalization);
    if (isArchive) {
      setMemory(loadMemory());
      return stopPersonalization;
    }
    const mem = recordIssueOpened({
      isoDate: initialEdition.isoDate,
      issue: initialEdition.issue,
      hero,
    });
    setMemory(mem);
    const onMemory = () => setMemory(loadMemory());
    window.addEventListener("daily-index:memory", onMemory);
    return () => {
      window.removeEventListener("daily-index:memory", onMemory);
      stopPersonalization();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profile: ReaderProfile | null = useMemo(
    () => (memory ? buildProfile(memory) : null),
    [memory],
  );
  const personalOtd: Array<{ label: string; issue: IssueRecord }> = useMemo(
    () => (memory ? personalOnThisDay(memory) : []),
    [memory],
  );

  useEffect(() => {
    document.documentElement.dataset.why = personalization.showWhy ? "on" : "off";
  }, [personalization.showWhy]);

  // Index tiles, the mood gauge and the signal card stay live while open.
  const [marketsAt, setMarketsAt] = useState<string | null>(null);
  const applyMarkets = useCallback(({ at, ...next }: LiveMarkets & { at: string }) => {
    setEdition((prev) => {
      const holidays = (next.holidays ?? prev.markets.holidays ?? {}) as HolidayMap;
      const { indices, mood, moods, commodities, crypto } = mergeOpenMarkets(prev.markets, next, holidays);
      return { ...prev, markets: { indices, mood, moods, commodities, crypto, holidays } };
    });
    setMarketsAt(at);
  }, []);
  useLiveMarkets(
    !isArchive,
    applyMarkets,
    edition.markets.indices.map((i) => i.id),
    (edition.markets.holidays ?? {}) as HolidayMap,
  );

  // --- weather: always resolves to ready or failed, never spins forever ----
  useEffect(() => {
    if (isArchive) return;
    let cancelled = false;
    const city = personalization.homeCity;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), WEATHER_TIMEOUT_MS));
    Promise.race([getLiveWeather(city), timeout])
      .then((w) => {
        if (cancelled) return;
        setWeatherResult({ city, state: w ? "ready" : "failed", data: w });
      })
      .catch(() => {
        if (!cancelled) setWeatherResult({ city, state: "failed", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [isArchive, personalization.homeCity]);

  // --- the reader's other cities, smaller in the Sky Report ----------------
  // Taken from the Two Cities section, minus the home city.
  const [otherWeather, setOtherWeather] = useState<WeatherNow[]>([]);
  useEffect(() => {
    if (isArchive) return;
    let cancelled = false;
    const load = () => {
      const home = personalization.homeCity.trim().toLowerCase();
      const same = (a: string) => a === home || (["bengaluru", "bangalore"].includes(a) && ["bengaluru", "bangalore"].includes(home));
      const cities = [
        ...new Set(
          loadDigestPreferences()
            .sections.flatMap((s) => (s.type === "grouped" && isCitySection(s) ? s.groups : []))
            .map((c) => c.trim())
            .filter((c) => c && !same(c.toLowerCase())),
        ),
      ].slice(0, 3);
      Promise.all(cities.map((c) => getLiveWeather(c).catch(() => null))).then((list) => {
        if (!cancelled) setOtherWeather(list.filter((w): w is WeatherNow => w !== null));
      });
    };
    load();
    window.addEventListener(PREFERENCES_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, load);
    };
  }, [isArchive, personalization.homeCity]);

  // --- travel mode: news and weather where the reader is ---------------------
  const [travel, setTravel] = useState<TravelState | null>(null);
  const [travelWeather, setTravelWeather] = useState<WeatherNow | null>(null);
  useEffect(() => {
    if (isArchive) return;
    const sync = () => setTravel(loadTravel());
    sync();
    window.addEventListener(TRAVEL_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TRAVEL_CHANGED_EVENT, sync);
  }, [isArchive]);
  const travelKey = travel ? `${travel.place.lat},${travel.place.lon}` : null;
  useEffect(() => {
    if (!travel) return;
    let cancelled = false;
    getWeatherAt(travel.place.lat, travel.place.lon, travel.place.city).then((w) => {
      if (!cancelled) setTravelWeather(w);
    });
    // The headlines kept from last time are shown at once; stale ones are
    // re-read in the background without asking for the location again.
    if (travelIsStale(travel)) refreshTravel(travel).catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-run for a new place only, not for each refreshed copy of the news.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelKey]);
  const travelling = travel !== null && !isArchive;

  // --- summaries / picks / editor's note -----------------------------------
  // Summaries are keyed by the article URL, never by the positional story id
  // ("wire-dateline-0"). Positional ids are reused across reloads while the
  // feed order changes, so an id-keyed cache would print yesterday's third
  // summary under today's third headline. URL-keying makes that impossible.
  const applyMap = useCallback((byUrl: Record<string, string>) => {
    const enrich = (stories: Story[]) =>
      stories.map((s) =>
        s.sourceUrl && byUrl[s.sourceUrl] ? { ...s, body: [byUrl[s.sourceUrl]] } : s,
      );
    setEdition((prev) => ({
      ...prev,
      sections: {
        dateline: enrich(prev.sections.dateline),
        nation: enrich(prev.sections.nation ?? []),
        twoCities: enrich(prev.sections.twoCities ?? []),
        paddockNotes: enrich(prev.sections.paddockNotes),
        skyReport: prev.sections.skyReport,
        circuitBoard: enrich(prev.sections.circuitBoard),
        ledger: enrich(prev.sections.ledger),
        marketPulse: prev.sections.marketPulse,
        grapevine: prev.sections.grapevine,
      },
    }));
    setHateWatchStories((prev) => enrich(prev));
    setF1Stories((prev) => enrich(prev));
    setFootballStories((prev) => enrich(prev));
    setTennisStories((prev) => enrich(prev));
  }, []);

  const applyPickBlurbs = useCallback((blurbs: Record<string, string>) => {
    if (!blurbs || Object.keys(blurbs).length === 0) return;
    setGrapevine((prev) => ({
      ...prev,
      picks: prev.picks.map((p) => (blurbs[p.id] ? { ...p, blurb: blurbs[p.id] } : p)),
    }));
  }, []);


  // The preference-driven digest (via /api/digest) now selects and summarises
  // every news section in one pass, so the legacy /api/summarize article pass
  // only covers the hate-watch stories, which stay outside the digest by
  // design. Everything else (picks blurbs, Editor's Desk note) is unchanged.
  const hateWatchInputs = useMemo(
    () =>
      initialHateWatchStories
        .filter((s) => s.sourceUrl)
        .map((s) => ({
          id: s.id,
          url: s.sourceUrl!,
          snippet: s.body[0] ?? "",
          title: s.headline,
        })),
    [initialHateWatchStories],
  );

  // Runs the AI pass for this edition.
  //
  //   force = false (page load): apply whatever is cached for today, then ask
  //           the model only about articles we have never asked about — new
  //           stories after a refresh, or everything if the cache is empty.
  //   force = true  ("Refresh edition", retry after failure): ignore the cache
  //           and summarise the whole edition again.
  //
  // The old effect returned early whenever *any* cache key existed for today,
  // which is why a reload (hard or not) never summarised again.
  const runSummarize = useCallback(
    (force: boolean) => {
      if (isArchive || memory === null) return;
      const today = edition.isoDate;

      const prof = buildProfile(memory);
      const weekday = new Date().toLocaleDateString("en-GB", { weekday: "long" });
      setEditorsNote(
        (cur) =>
          cur ?? { text: fallbackEditorsNote(prof, { weekday, heroHeadline: hero?.headline }), source: "desk" },
      );

      const cached = force ? null : readSummaryRecord(today);
      const cachedUrls = new Set(cached ? Object.keys(cached.byUrl) : []);
      const askedUrls = new Set(cached ? cached.asked : []);
      const currentUrls = new Set(hateWatchInputs.map((a) => a.url));

      // If we already asked for the blurbs / note once today, don't ask
      // again on every reload just because the model returned nothing.
      const extrasDone = cached?.extrasAsked === true;
      let havePicks = extrasDone;
      let haveNote = extrasDone;

      if (cached) {
        // Silently re-apply what the reader already accepted for these URLs.
        const hit: Record<string, string> = {};
        for (const url of currentUrls) if (cached.byUrl[url]) hit[url] = cached.byUrl[url];
        if (Object.keys(hit).length > 0) applyMap(hit);

        const cachedPicks = readPickBlurbs(today);
        if (cachedPicks) {
          applyPickBlurbs(cachedPicks);
          havePicks = havePicks || Object.keys(cachedPicks).length > 0;
        }
        const cachedNote = readNote(today);
        if (cachedNote) {
          setEditorsNote({ text: cachedNote, source: "ai" });
          haveNote = true;
        }
      }

      const toAsk = force
        ? hateWatchInputs
        : hateWatchInputs.filter((a) => !cachedUrls.has(a.url) && !askedUrls.has(a.url));
      const picksToAsk = force || !havePicks ? grapevine.picks : [];
      const wantNote = force || !haveNote;

      if (toAsk.length === 0 && picksToAsk.length === 0 && !wantNote) {
        setSummaryState("idle");
        return;
      }
      // Nothing new to summarise and the note is already on the page.
      if (toAsk.length === 0 && picksToAsk.length === 0 && hateWatchInputs.length === 0) {
        setSummaryState("idle");
        return;
      }

      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;
      const timer = setTimeout(() => controller.abort(), SUMMARIZE_TIMEOUT_MS);

      setSummaryState("loading");
      // Snapshot the snippet each article is currently printed with, so we can
      // tell a real summary from the model handing the RSS text straight back.
      const currentBody = new Map(hateWatchInputs.map((a) => [a.url, (a.snippet ?? "").trim()]));

      fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          // Digest handles every news section; only hate-watch stories still
          // go through the per-article summariser.
          articles: toAsk,
          picks: picksToAsk.map((p) => ({
            id: p.id,
            title: p.title,
            snippet: p.snippet,
            domain: p.domain,
            why: p.why,
          })),
          reader: wantNote
            ? {
                profile: prof,
                weekday,
                dateLabel: edition.date,
                heroHeadline: hero?.headline,
                recentHeadlines: engagementsSince(memory, 7).slice(-6).map((e) => e.headline),
              }
            : undefined,
        }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`summarize ${r.status}`);
          return (await r.json()) as {
            summaries?: Record<string, string>;
            pickBlurbs?: Record<string, string>;
            editorsNote?: string | null;
          };
        })
        .then(({ summaries, pickBlurbs, editorsNote: apiNote }) => {
          if (controller.signal.aborted) return;
          const idToUrl = new Map(hateWatchInputs.map((a) => [a.id, a.url]));
          const askedNow = new Set((force ? hateWatchInputs : toAsk).map((a) => a.url));

          const byUrl: Record<string, string> = {};
          const changed: Record<string, string> = {};
          for (const [id, text] of Object.entries(summaries ?? {})) {
            const url = idToUrl.get(id);
            if (!url || typeof text !== "string" || !text.trim()) continue;
            if (!askedNow.has(url)) continue;
            byUrl[url] = text;
            if (text.trim() !== currentBody.get(url)) changed[url] = text;
          }

          // Persist everything we learned (including "asked, got snippet back")
          // so the next load doesn't re-request it; keep only the entries that
          // would visibly change the page for the reader to apply.
          mergeSummaryRecord(today, byUrl, Array.from(askedNow), {
            extrasAsked: force || picksToAsk.length > 0 || wantNote,
          });
          if (pickBlurbs && Object.keys(pickBlurbs).length > 0) writePickBlurbs(today, pickBlurbs);
          if (apiNote) writeNote(today, apiNote);

          if (pickBlurbs) applyPickBlurbs(pickBlurbs);
          if (apiNote) setEditorsNote({ text: apiNote, source: "ai" });

          if (Object.keys(changed).length > 0) applyMap(changed);
          setSummaryState("idle");
        })
        .catch((err) => {
          if (controller.signal.aborted && inFlightRef.current !== controller) return; // superseded
          console.warn("[summarize] failed:", err);
          // Not worth interrupting the reader over: the RSS text stays.
          setSummaryState("idle");
        })
        .finally(() => {
          clearTimeout(timer);
          if (inFlightRef.current === controller) inFlightRef.current = null;
        });
    },
    [isArchive, memory, edition.isoDate, edition.date, hero?.headline, hateWatchInputs, grapevine.picks, applyMap, applyPickBlurbs],
  );

  const runSummarizeRef = useRef(runSummarize);
  useEffect(() => {
    runSummarizeRef.current = runSummarize;
  }, [runSummarize]);

  // --- preference-driven digest ----------------------------------------------
  // Sends the reader's stored preferences to /api/edition, which builds or
  // returns today's edition. The saved copy (digest-cache) only gives a first
  // paint when there's nothing better: the server is always asked, and the
  // newest revision wins, so a copy saved during a failure can't outlive it.
  const applyDigest = useCallback((result: DigestResult, prefs: DigestPreferences) => {
    shownRef.current = { hash: hashPreferences(prefs), revision: digestRevision(result) };
    const projection = projectDigest(result, prefs);
    const { paddock, standalone } = projection;
    setEdition((prev) => ({ ...prev, sections: withProjection(prev.sections, projection) }));
    if (paddock.f1.length > 0) setF1Stories(paddock.f1);
    if (paddock.football.length > 0) setFootballStories(paddock.football);
    if (paddock.tennis.length > 0) setTennisStories(paddock.tennis);
    setStandaloneDigest(standalone);
    setHateWatchStories(projection.rivals);
    setAppliedDigest(result);
  }, []);

  const runDigest = useCallback(
    (force: boolean, retry = false) => {
      if (isArchive) return;
      const prefs = loadDigestPreferences();
      const hash = hashPreferences(prefs);
      lastCheckRef.current = Date.now();

      // A saved copy paints at once, if it's newer than what's on the page.
      // Either way the server gets asked below.
      if (!force) {
        const cached = readDigestCache(edition.isoDate, hash);
        const shown = shownRef.current;
        if (cached && (shown?.hash !== hash || digestRevision(cached) > shown.revision)) {
          applyDigest(cached, prefs);
          setBrief(deriveBriefFromDigest(cached, prefs));
        }
      }

      digestInFlightRef.current?.abort();
      const controller = new AbortController();
      digestInFlightRef.current = controller;
      // Polling gives up on its own; this is the backstop so a hung request
      // can never pin the pressroom overlay forever.
      const timer = setTimeout(() => controller.abort(), DIGEST_TIMEOUT_MS);

      // A finished digest replaces the page's content straight away. Under
      // the pressroom overlay that happens before the overlay fades, so the
      // reader never sees the raw wire text; later (a background rebuild
      // landing) it simply swaps in.
      const deliver = (result: DigestResult) => {
        if (controller.signal.aborted) return;
        const revision = digestRevision(result);
        const shown = shownRef.current;
        const sameEdition = shown?.hash === hash;
        if (force || !sameEdition || revision >= shown.revision) writeDigestCache(edition.isoDate, hash, result);
        const total = Object.values(result.sections).reduce((n, a) => n + a.length, 0);
        if (total > 0 && (force || !sameEdition || revision > shown.revision)) {
          applyDigest(result, prefs);
          setBrief(deriveBriefFromDigest(result, prefs));
        }
        if (prepActiveRef.current) revealEdition();
      };

      (async () => {
        const first = await requestEdition(prefs, { force, retry, signal: controller.signal });
        setServerNote(first.note ?? null);
        if (first.state === "failed") throw new Error(first.error ?? "edition failed");
        // A tab left open past midnight keeps the day it's showing.
        if (!force && !prepActiveRef.current && first.date && first.date !== edition.isoDate) {
          setSyncError(null);
          return;
        }

        if (first.state === "ready" && first.digest) {
          // After "Refresh edition" the reader asked for a new paper — hold
          // the overlay until the fresh build lands instead of reprinting
          // the one they already had.
          if (!(force && first.refreshing)) deliver(first.digest);
          if (!first.refreshing) {
            setSyncError(null);
            return;
          }
        }

        // Building (or refreshing in the background): poll the server.
        const final = await waitForEdition(first.hash!, first.date!, {
          signal: controller.signal,
          waitForFresh: first.state === "ready",
          after: first.revision,
        });
        if (final.state !== "ready" || !final.digest) {
          throw new Error(final.error ?? "edition failed");
        }
        if (final.revision !== first.revision || first.state !== "ready" || force) {
          deliver(final.digest);
        }
        setSyncError(null);
      })()
        .catch((err) => {
          if (controller.signal.aborted && digestInFlightRef.current !== controller) return;
          console.warn("[edition] failed:", err);
          // The overlay swaps the animation for a retry. Once the page is
          // showing, it keeps what's there and says the check failed.
          if (prepActiveRef.current) setPrep("failed");
          else setSyncError(controller.signal.aborted ? "the server took too long" : err instanceof TypeError ? "the server didn't answer" : err instanceof Error ? err.message : "the server didn't answer");
        })
        .finally(() => {
          clearTimeout(timer);
          if (digestInFlightRef.current === controller) {
            digestInFlightRef.current = null;
            setRetrying(false);
          }
        });
    },
    [isArchive, edition.isoDate, applyDigest, revealEdition],
  );

  const runDigestRef = useRef(runDigest);
  useEffect(() => {
    runDigestRef.current = runDigest;
  }, [runDigest]);

  // Stories are waiting for Gemini, or the last rebuild or check failed: keep
  // asking while the page is in view, so the fix lands without a reload.
  const writing = appliedDigest?.writing;
  const awaitingFix =
    !isArchive &&
    (Boolean(syncError) || Boolean(writing && !writing.disabled && !writing.gaveUp && (writing.unwritten > 0 || writing.selectionFailed || writing.rebuildFailed)));
  useEffect(() => {
    if (isArchive) return;
    const check = () => {
      if (!document.hidden && !digestInFlightRef.current) runDigestRef.current(false);
    };
    const timer = awaitingFix ? setInterval(check, REPAIR_RECHECK_MS) : undefined;
    const onReturn = () => {
      if (Date.now() - lastCheckRef.current >= (awaitingFix ? REPAIR_RECHECK_MS : RETURN_RECHECK_MS)) check();
    };
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [isArchive, awaitingFix]);

  const retryNow = useCallback(() => {
    setRetrying(true);
    runDigestRef.current(false, true);
  }, []);

  // Decide at mount whether this visit needs the pressroom overlay at all.
  // Runs before paint effects matter: a warm cache, an archive view, or a
  // not-yet-onboarded reader (the onboarding gate owns the screen then)
  // skips straight to revealed; a cold visit starts cooking.
  useEffect(() => {
    if (isArchive) return;
    // Read the one-shot refresh marker first so it can never linger into a
    // later, unrelated visit.
    const deliberateRefresh = consumeEditionRefresh();
    forceRebuildRef.current = deliberateRefresh;
    // The server already printed today's edition into the page.
    if (initialDigest && !deliberateRefresh) return;
    if (!loadPersonalization().onboarded) {
      // Browser-only saved state is read after the first render so it matches the server HTML.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrep("revealed");
      return;
    }
    const cached = readDigestCache(
      initialEdition.isoDate,
      hashPreferences(loadDigestPreferences()),
    );
    if (cached) {
      // runDigest's own mount effect applies the cached digest silently.
      setPrep("revealed");
      return;
    }
    if (deliberateRefresh) setPrepReason("refresh");
    setPrep("cooking");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isArchive]);

  // Kick the digest off as soon as the edition mounts — forcing a server
  // rebuild only after "Refresh edition". A settings edit fires the changed
  // event; new preferences are a different edition, so no force is needed.
  useEffect(() => {
    if (isArchive) return;
    runDigestRef.current(forceRebuildRef.current);
    forceRebuildRef.current = false;
    const onPrefsChanged = () => runDigestRef.current(false);
    window.addEventListener(PREFERENCES_CHANGED_EVENT, onPrefsChanged);
    return () => {
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, onPrefsChanged);
      digestInFlightRef.current?.abort();
      digestInFlightRef.current = null;
    };
  }, [isArchive]);



  // Kick off once reader memory is loaded. A one-shot flag left behind by
  // "Refresh edition" forces a from-scratch pass on the fresh edition.
  useEffect(() => {
    if (isArchive || memory === null) return;
    const force = consumeForcedSummarize();
    runSummarizeRef.current(force);
    return () => {
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isArchive, memory === null]);

  // Pressroom overlay actions: retry re-runs the whole digest pipeline from
  // scratch (RSS → collate → AI); skipping lifts the overlay and prints the
  // raw wires knowingly.
  const handlePrepRetry = useCallback(() => {
    setPrep("cooking");
    runDigestRef.current(true);
  }, []);
  const handlePrepSkip = useCallback(() => revealEdition(), [revealEdition]);

  // --- assemble -----------------------------------------------------------
  const rank = useCallback(
    <T extends Story>(stories: T[]) => (memory ? rankForReader(stories, memory) : stories),
    [memory],
  );
  // A section that lent the front page its lead prints its spare story in
  // its place; the others keep the spare back, so every section shows the
  // reader's full count.
  const without = (stories: Story[]) => {
    const rest = stories.filter((s) => s.id !== hero?.id);
    return rank(rest.length < stories.length ? rest : rest.filter((s) => !s.reserve));
  };

  const accentColor = personalization.favoriteF1Team
    ? F1_TEAM_COLORS[personalization.favoriteF1Team]
    : undefined;
  const weatherState: WeatherState = isArchive
    ? "failed"
    : weatherResult?.city === personalization.homeCity
      ? weatherResult.state
      : "loading";
  const liveWeather = weatherResult?.city === personalization.homeCity ? weatherResult.data : null;
  const weather = liveWeather ?? edition.weather ?? null;

  const paddockSports: Array<"f1"> = ["f1"];

  // --- severe-weather alerts near the reader's places (NDMA Sachet) ----------
  const alertPlaces = [weather, ...otherWeather]
    .filter((w): w is WeatherNow => !!w && typeof w.latitude === "number" && typeof w.longitude === "number")
    .map((w) => `${w.city},${w.latitude!.toFixed(2)},${w.longitude!.toFixed(2)}`)
    .join("|");
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlert[]>([]);
  useEffect(() => {
    if (isArchive || !alertPlaces) return;
    const controller = new AbortController();
    fetch(`/api/alerts?p=${encodeURIComponent(alertPlaces)}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ alerts: WeatherAlert[] }>) : null))
      .then((d) => d && setWeatherAlerts(d.alerts))
      .catch(() => {});
    return () => controller.abort();
  }, [isArchive, alertPlaces]);

  // --- Straw Poll: the reader's own odds (lib/odds-pick.ts) ------------------
  const oddsFollows = useMemo<OddsFollow[]>(() => {
    const standings = edition.f1?.standings ?? [];
    const driverName = (id: string) =>
      standings.find((s) => s.code.toLowerCase() === id.toLowerCase() || s.driverId === id)?.name ?? (id.length > 3 ? id.replace(/_/g, " ") : "");
    const valTeams = edition.valorant?.teams ?? [];
    const list: OddsFollow[] = [
      ...personalization.favoriteF1Drivers.map((id) => ({ name: driverName(id), subject: "f1" as const })),
      { name: personalization.favoriteF1Team, subject: "f1" },
      { name: personalization.favoriteFootballClub, subject: "football" },
      { name: personalization.favoriteFootballPlayer, subject: "football" },
      { name: personalization.favoriteFootballNationalTeam, subject: "football" },
      { name: personalization.favoriteTennisPlayer, subject: "tennis" },
      ...personalization.valorantTeams.map((code) => ({ name: valTeams.find((t) => t.code === code)?.name ?? "", subject: "valorant" as const })),
      { name: personalization.hateWatchF1, subject: "f1", rival: true },
      { name: personalization.hateWatchFootball, subject: "football", rival: true },
      { name: personalization.hateWatchTennis, subject: "tennis", rival: true },
    ];
    return list.filter((f) => f.name.trim().length >= 3);
  }, [personalization, edition.f1?.standings, edition.valorant?.teams]);
  // The reader's watchlist (searches) and stars (ids) are read alongside.
  const oddsWatch = (personalization.oddsWatch ?? []).slice(0, 12);
  const oddsPins = (personalization.oddsPins ?? []).map((p) => p.id).slice(0, 12);
  const oddsQuery = [
    oddsFollows.filter((f) => !f.rival).map((f) => f.name).slice(0, 8).join("|"),
    oddsWatch.join("|"),
    oddsPins.join(","),
  ];
  // The next Grand Prix, searched by its country ("Singapore Grand Prix"),
  // so the pit wall always has its winner market.
  const nextRace = edition.f1?.nextRace ?? null;
  const raceQuery = nextRace && personalization.sports.includes("f1") ? `${nextRace.country} Grand Prix` : "";
  const oddsUrl = `/api/odds?${new URLSearchParams({
    ...(oddsQuery[0] ? { f: oddsQuery[0] } : {}),
    ...(oddsQuery[1] ? { w: oddsQuery[1] } : {}),
    ...(oddsQuery[2] ? { p: oddsQuery[2] } : {}),
    ...(raceQuery ? { r: raceQuery } : {}),
  })}`;
  const [odds, setOdds] = useState<OddsUniverse | null>(null);
  useEffect(() => {
    if (isArchive) return;
    const controller = new AbortController();
    fetch(oddsUrl, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<OddsUniverse>) : null))
      .then((u) => u && setOdds(u))
      .catch(() => {});
    return () => controller.abort();
  }, [isArchive, oddsUrl]);
  const pageHeadlines = useMemo(
    () => [
      ...Object.values(edition.sections).flatMap((list) => (list ?? []).map((s) => s.headline)),
      ...f1Stories.map((s) => s.headline),
      ...footballStories.map((s) => s.headline),
      ...tennisStories.map((s) => s.headline),
    ],
    [edition.sections, f1Stories, footballStories, tennisStories],
  );
  const oddsLayout = useMemo(() => {
    if (!odds) return { poll: { money: null, mover: null, moverSpan: "today", moneyMovedMost: false, movers: [], busiest: [] }, sections: {}, stories: new Map() } as OddsLayout & { stories: Map<string, OddsPick> };
    const headlines = [
      ...Object.values(edition.sections).flatMap((list) => (list ?? []).map((s) => s.headline)),
      ...f1Stories.map((s) => s.headline),
      ...footballStories.map((s) => s.headline),
      ...tennisStories.map((s) => s.headline),
    ];
    const sports = [...personalization.sports, ...(personalization.valorantTeams.length ? (["valorant"] as const) : [])];
    const watched = new Set([...Object.values(odds.watched ?? {}).flat(), ...(personalization.oddsPins ?? []).map((p) => p.id)]);
    const picks = scoreOdds(odds.markets, { follows: oddsFollows, sports, subjects: ["money", "world", "india", "tech", "culture"], headlines, watched });
    // Markets about a story print under it; the rest go to Straw Poll and the section feet.
    const stories = storyOdds(picks);
    const under = new Set([...stories.values()].map((p) => p.market.id));
    // Each market prints once on the page.
    return { ...layoutOdds(picks.filter((p) => !under.has(p.market.id)), personalization.hiddenSections, under), stories };
  }, [odds, edition.sections, f1Stories, footballStories, tennisStories, personalization, oddsFollows]);
  const raceOdds = useMemo(() => (odds ? (raceMarket(odds.markets, nextRace) ?? null) : null), [odds, nextRace]);
  // A week's line for every market on the page, in one request.
  const sparks = useSparks([
    ...[oddsLayout.poll.money, oddsLayout.poll.mover, ...oddsLayout.poll.movers, ...oddsLayout.poll.busiest].filter((p): p is OddsPick => !!p).map((p) => p.market),
    ...Object.values(oddsLayout.sections).flatMap((list) => (list ?? []).map((p) => p.market)),
  ]);

  // In Brief: the leading stories each section had no room for (from the
  // digest; a story already on the page anywhere is left out).
  const BRIEF_SLOT: Partial<Record<SectionKey, NewsSlot>> = {
    dateline: "dateline",
    "the-nation": "the-nation",
    ledger: "ledger",
    "circuit-board": "circuit-board",
  };
  const onPage = new Set(Object.values(edition.sections).flatMap((list) => (list ?? []).map((st) => st.sourceUrl)));
  const briefsFor = (key: SectionKey) => {
    const slot = BRIEF_SLOT[key];
    return (slot ? (appliedDigest?.briefs?.[slot] ?? []) : []).filter((b) => !onPage.has(b.url));
  };

  const sectionHasContent: Record<SectionKey, boolean> = {
    dateline: true,
    // Filled only by the digest: hidden until the editor has files for it.
    "the-nation": (edition.sections.nation ?? []).length > 0,
    "two-cities": (edition.sections.twoCities ?? []).length > 0,
    // A sport's pages print only for sports the reader follows.
    "paddock-notes": personalization.sports.includes("f1"),
    sports:
      (personalization.sports.includes("football") && footballStories.length > 0) ||
      (personalization.sports.includes("tennis") && tennisStories.length > 0),
    clutch: !isArchive,
    "straw-poll": !isArchive && !!(oddsLayout.poll.money || oddsLayout.poll.mover),
    "sky-report": true,
    "market-pulse": true,
    "circuit-board": edition.sections.circuitBoard.length > 0,
    ledger: edition.sections.ledger.length > 0,
    grapevine: !isArchive,
  };

  const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
    dateline: () => (
      <DatelineSection stories={without(edition.sections.dateline)} />
    ),
    "the-nation": () => <NationSection stories={without(edition.sections.nation ?? [])} />,
    "two-cities": () => <TwoCitiesSection stories={without(edition.sections.twoCities ?? [])} />,
    "paddock-notes": () => (
      <PaddockNotesSection
        selectedSports={paddockSports}
        f1Stories={without(f1Stories)}
        footballStories={[]}
        tennisStories={[]}
        nextRace={edition.f1?.nextRace ?? null}
        upcoming={edition.f1?.upcoming ?? []}
        standings={edition.f1?.standings ?? []}
        constructorStandings={edition.f1?.constructorStandings ?? []}
        lastRace={edition.f1?.lastRace ?? null}
        qualifyingGrid={edition.f1?.qualifyingGrid ?? []}
        liveResults={edition.f1?.liveResults ?? []}
        currentRace={edition.f1?.currentRace ?? null}
        racePhase={edition.f1?.racePhase ?? "last-race"}
        accentColor={accentColor}
        favoriteF1Team={personalization.favoriteF1Team}
        favoriteDriverIds={personalization.favoriteF1Drivers}
        live={f1Live}
        footballStandings={footballData?.leagues?.[1]?.standings ?? []}
        footballLeague={footballData?.leagues?.[1]?.league ?? "Premier League"}
        favoriteFootballClub={personalization.favoriteFootballClub}
        tennisRankings={tennisData?.rankings ?? []}
        favoriteTennisPlayer={personalization.favoriteTennisPlayer}
        hateWatchStories={hateWatchStories}
      />
    ),
    sports: () => (
      <SportsSection
        footballStories={personalization.sports.includes("football") ? without(footballStories) : []}
        tennisStories={personalization.sports.includes("tennis") ? without(tennisStories) : []}
        footballLeagues={footballData?.leagues ?? []}
        favoriteFootballClub={personalization.favoriteFootballClub}
        tennisRankings={tennisData?.rankings ?? []}
        favoriteTennisPlayer={personalization.favoriteTennisPlayer}
      />
    ),
    "straw-poll": () => <StrawPollSection poll={oddsLayout.poll} readAt={odds?.at ?? null} record={odds?.record ?? null} />,
    clutch: () => <ClutchSection initial={edition.valorant ?? null} follows={personalization.valorantTeams} />,
    "sky-report": () => (
      <SkyReportSection
        weather={weather}
        live={liveWeather !== null}
        status={weatherState}
        city={personalization.homeCity}
        others={otherWeather}
        travelling={travelling}
        alerts={weatherAlerts}
      />
    ),
    "circuit-board": () => <CircuitBoardSection stories={without(edition.sections.circuitBoard)} />,
    ledger: () => <LedgerSection stories={without(edition.sections.ledger)} />,
    "market-pulse": () => (
      <MarketPulseSection
        stories={without(edition.sections.marketPulse)}
        indices={edition.markets.indices}
        mood={edition.markets.mood}
        moods={edition.markets.moods ?? []}
        commodities={edition.markets.commodities ?? []}
        crypto={edition.markets.crypto ?? []}
        holidays={(edition.markets.holidays ?? {}) as HolidayMap}
        oddsMarkets={odds?.markets ?? []}
        updatedAt={marketsAt}
      />
    ),
    grapevine: () => (
      <GrapevineSection data={grapevine} dateKey={edition.isoDate} headlines={pageHeadlines} />
    ),
  };

  const order = isArchive
    ? (Object.keys(sectionRenderers) as SectionKey[]).filter((key) => sectionHasContent[key])
    : personalization.sectionOrder.filter(
        (key) => !personalization.hiddenSections.includes(key) && sectionHasContent[key],
      );
  const visibleStandalone = isArchive ? [] : standaloneDigest;

  // The running order (lib/chapters.ts). Next also carries things that aren't
  // sections: the reader's own sections and the week ahead, after the odds. The
  // day's extras always finish the page, whichever group comes last.
  const extras = {
    note: !isArchive && editorsNote ? editorsNote.text : null,
    history: edition.onThisDay[0] ?? null,
    word: edition.wordOfDay?.word ? edition.wordOfDay : null,
  };
  const chapters = chaptersFor(order).filter((c) => c.printed.length > 0 || (c.id === "next" && (!isArchive || visibleStandalone.length > 0)));
  type Item = { kind: "section"; key: SectionKey } | { kind: "own"; at: number } | { kind: "week" };
  const itemsOf = (c: PrintedChapter): Item[] => {
    const items: Item[] = c.printed.map((key) => ({ kind: "section", key }));
    if (c.id !== "next") return items;
    const poll = c.printed.indexOf("straw-poll");
    const grapevine = c.printed.indexOf("grapevine");
    const place = poll >= 0 ? poll + 1 : grapevine >= 0 ? grapevine : items.length;
    items.splice(place, 0, ...visibleStandalone.map((_, at): Item => ({ kind: "own", at })), ...(isArchive ? [] : [{ kind: "week" } as Item]));
    return items;
  };

  // One menu, in the same words everywhere (chrome/PaperNav.tsx). The side menu
  // prints the day's number beside a section that has one.
  const leadIndex = edition.markets.indices.find((i) => /nifty 50/i.test(i.name)) ?? edition.markets.indices[0];
  const toLights = nextRace ? until(nextRace.date) : null;
  const navNotes: Partial<Record<SectionKey, { text: string; tone?: "up" | "down" }>> = {
    ...(leadIndex
      ? { "market-pulse": { text: `${leadIndex.changePct >= 0 ? "+" : "−"}${Math.abs(leadIndex.changePct).toFixed(2)}%`, tone: leadIndex.changePct >= 0 ? ("up" as const) : ("down" as const) } }
      : {}),
    ...(toLights ? { "paddock-notes": { text: toLights === "this weekend" ? "now" : toLights } } : {}),
    ...(weather ? { "sky-report": { text: `${weather.tempC}°` } } : {}),
  };
  const navChapters: NavChapter[] = chapters.map((c) => ({
    id: `ch-${c.id}`,
    label: c.label,
    sections: itemsOf(c).map((item) => {
      if (item.kind === "section") return { id: SECTION_META[item.key].slug, name: SECTION_META[item.key].name, hue: SECTION_META[item.key].hue, note: navNotes[item.key] };
      if (item.kind === "week") return { id: "week-ahead", name: "The Week Ahead", hue: "var(--hue-money)" };
      const { section } = visibleStandalone[item.at];
      return { id: `digest-${section.id}`, name: section.label, hue: digestHue(section.label) };
    }),
  }));

  // Where each story runs on this page, so the briefing can link down to it.
  const anchorByUrl = new Map<string, string>();
  const note = (stories: Story[]) =>
    stories.forEach((st) => st.sourceUrl && anchorByUrl.set(st.sourceUrl, `story-${st.id}`));
  note(edition.sections.dateline);
  note(edition.sections.nation ?? []);
  note(edition.sections.twoCities ?? []);
  note(f1Stories);
  note(footballStories);
  note(tennisStories);
  note(edition.sections.circuitBoard);
  note(edition.sections.ledger);
  note(edition.sections.marketPulse);
  if (hero) note([hero]);
  visibleStandalone.forEach(({ section, articles }) =>
    articles.forEach((a, i) => anchorByUrl.set(a.url, `story-${digestArticleToStory(section, a, i).id}`)),
  );

  // Before the AI briefing exists, the top story of each desk stands in.
  const fallbackBrief: EditionBrief = {
    bullets: order.flatMap((key) => {
      const lists: Partial<Record<SectionKey, Story[]>> = {
        dateline: edition.sections.dateline,
        "the-nation": edition.sections.nation ?? [],
        "two-cities": edition.sections.twoCities ?? [],
        "paddock-notes": f1Stories,
        "circuit-board": edition.sections.circuitBoard,
        ledger: edition.sections.ledger,
      };
      const top = (lists[key] ?? []).find((st) => st.id !== hero?.id);
      return top ? [{ section: SECTION_META[key].short, text: top.headline, url: top.sourceUrl }] : [];
    }),
  };

  // While the pressroom overlay holds the page it also speaks for the digest
  // pipeline (progress + retry), so the floating pill stays out of the way.
  const prepBlocking = prep === "boot" || prep === "cooking" || prep === "failed";

  // A line pointing at the article the lead already is would say it twice.
  const briefShown = brief ?? (prepBlocking ? null : fallbackBrief);
  const briefLines = briefShown ? { ...briefShown, bullets: briefShown.bullets.filter((b) => !b.url || b.url !== hero?.sourceUrl) } : null;

  // Stories on the page still waiting for Gemini: a spare that isn't printed,
  // or a section the reader hid, is no failure of theirs to read about.
  const printedById = new Map<string, Story>();
  for (const s of [
    ...Object.values(edition.sections).flatMap((list) => list ?? []),
    ...f1Stories,
    ...footballStories,
    ...tennisStories,
    ...visibleStandalone.flatMap(({ section, articles }) => articles.map((a, i) => digestArticleToStory(section, a, i))),
  ]) {
    printedById.set(s.id, s);
  }
  const pendingCount = [...printedById.values()].filter(
    (s) => s.copy === "pending" && (!s.reserve || s.id === hero?.id) && !personalization.hiddenSections.includes(s.section),
  ).length;

  return (
    <main className="flex-1 page-scale edition-page">
      <SparksContext.Provider value={sparks}>
      <RaceOddsContext.Provider value={raceOdds}>
      <StoryOddsContext.Provider value={oddsLayout.stories}>
      {prep !== "revealed" && (
        <EditionPrepOverlay
          failed={prep === "failed"}
          reason={prepReason}
          leaving={prep === "leaving"}
          date={edition.date}
          onRetry={handlePrepRetry}
          onSkip={handlePrepSkip}
        />
      )}
      <PaperNav chapters={navChapters} isArchive={isArchive} date={edition.date} issue={`VOL. ${edition.volume} · NO. ${edition.issue}`} />
      <Masthead edition={edition} weather={(travelling && travelWeather) || weather || undefined} />
      <div className="page-wrap px-4 sm:px-6">
        {!isArchive && !prepBlocking && (
          <WritingNotice
            writing={writing}
            printedAt={appliedDigest?.generatedAt}
            pending={pendingCount}
            note={serverNote}
            syncError={syncError}
            retrying={retrying}
            onRetry={retryNow}
          />
        )}
        {/* The front page: the briefing beside the lead. On a phone the briefing
            comes first: the whole day in a minute, on the first screen. */}
        {hero && (
          <div className="grid grid-cols-1 gap-y-8 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)]">
            <div className="lg:pr-8 lg:border-r hairline min-w-0">
              <Briefing
                brief={briefLines}
                loading={summaryState === "loading"}
                anchorFor={(url) => anchorByUrl.get(url) ?? null}
                actions={
                  !isArchive ? (
                    <>
                      <ListenButton edition={edition} />
                      <PullToRefreshStamp />
                    </>
                  ) : undefined
                }
              />
            </div>
            <div className="lg:pl-9 min-w-0">
              <HeroStory story={hero} />
            </div>
          </div>
        )}
        <div className="edition-body">
          {travelling && travel && (
            <div className="paper-section" style={{ ["--section-hue" as string]: "var(--hue-travel)" }}>
              <PostcardSection travel={travel} weather={travelWeather} />
            </div>
          )}
          {/* One subject on each row at every width (lib/chapters.ts). A wider
              screen shows more of a section at once, never a second one. */}
          {chapters.map((c) => (
            <div key={c.id} id={`ch-${c.id}`} className="chapter">
              {itemsOf(c).map((item) => {
                if (item.kind === "week") return <WeekAhead key="week-ahead" />;
                if (item.kind === "own") {
                  const { section, articles } = visibleStandalone[item.at];
                  return (
                    <div key={`digest-${section.id}`} className="paper-section" style={{ ["--section-hue" as string]: digestHue(section.label) }}>
                      <DigestSectionView section={section} articles={articles} />
                    </div>
                  );
                }
                const { key } = item;
                return (
                  <div key={key} className="paper-section" style={{ ["--section-hue" as string]: SECTION_META[key].hue }}>
                    {sectionRenderers[key]()}
                    {briefsFor(key).length > 0 && <InBrief items={briefsFor(key)} />}
                    {oddsLayout.sections[key] && <OddsStrip picks={oddsLayout.sections[key]!} label={key === "grapevine" ? "Film and the awards" : "What traders expect"} />}
                  </div>
                );
              })}
            </div>
          ))}
          {/* The day's extras finish the paper. */}
          <FrontStrip note={extras.note} then={personalOtd} history={extras.history} word={extras.word} />
        </div>
      </div>
      <footer className="mt-14 border-t hairline">
        <div className="page-wrap px-4 sm:px-6 py-8 grid gap-6 md:grid-cols-[1fr_auto] items-end">
          <div>
            <p className="font-display font-extrabold text-[clamp(3rem,12vw,9rem)] leading-[0.8] text-transparent [-webkit-text-stroke:1px_var(--ink-faint)] select-none" aria-hidden="true">
              The Daily Index
            </p>
            <p className="font-headline italic text-[15px] text-ink-soft mt-4">An index of everything that matters today.</p>
            <p className="font-mono text-[11px] text-ink-soft mt-2">
              VOL. {edition.volume} · NO. {edition.issue} — A PERSONAL DIGEST, NOT A REAL NEWSPAPER.
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-3 text-[13px]">
            <a href="#masthead" className="chip">
              <ArrowUpIcon size={14} weight="bold" aria-hidden="true" />
              Back to the top
            </a>
            <span className="font-mono text-[11px] text-ink-soft max-w-[32ch] md:text-right">
              Everything this paper remembers about you stays on this device.
            </span>
          </div>
        </div>
      </footer>
      </StoryOddsContext.Provider>
      </RaceOddsContext.Provider>
      </SparksContext.Provider>
    </main>
  );
}
