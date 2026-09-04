"use client";

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
  WeatherNow,
} from "@/lib/types";
import { pickHeroStory } from "@/lib/format";
import {
  DEFAULT_PERSONALIZATION,
  loadPersonalization,
  F1_TEAM_COLORS,
} from "@/lib/personalization";
import { getLiveWeather } from "@/lib/live/weather";
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
  readBrief,
  readNote,
  readPickBlurbs,
  readSummaryRecord,
  writeBrief,
  writeNote,
  writePickBlurbs,
} from "@/lib/summary-cache";
import Masthead from "@/components/masthead/Masthead";
import HeroStory from "@/components/story/HeroStory";
import EditorsDesk from "@/components/widgets/EditorsDesk";
import DatelineSection from "@/components/sections/DatelineSection";
import PaddockNotesSection from "@/components/sections/PaddockNotesSection";
import SkyReportSection from "@/components/sections/SkyReportSection";
import CircuitBoardSection from "@/components/sections/CircuitBoardSection";
import LedgerSection from "@/components/sections/LedgerSection";
import PlasticPointsSection from "@/components/sections/PlasticPointsSection";
import MarketPulseSection from "@/components/sections/MarketPulseSection";
import GrapevineSection from "@/components/sections/GrapevineSection";
import SummaryBanner from "@/components/widgets/SummaryBanner";
import EditionBriefPanel from "@/components/widgets/EditionBriefPanel";

type WeatherState = "loading" | "ready" | "failed";
const WEATHER_TIMEOUT_MS = 9000;

// idle      — nothing to show
// loading   — /api/summarize in flight
// done      — new summaries are waiting; the reader taps the banner to apply
// unchanged — the model had nothing new to add (auto-dismisses)
// failed    — the call errored; banner offers a retry
export type SummaryState = "idle" | "loading" | "done" | "unchanged" | "failed";
const SUMMARIZE_TIMEOUT_MS = 90_000;
const UNCHANGED_DISMISS_MS = 3500;

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
  summaryArticles = [],
  f1Stories: initialF1Stories = [],
  footballStories: initialFootballStories = [],
  tennisStories: initialTennisStories = [],
  footballData = null,
  tennisData = null,
  redditUser = null,
  feedSubreddits,
}: {
  edition: Edition;
  isArchive?: boolean;
  f1Live?: boolean;
  redditLive?: boolean;
  hateWatchStories?: Story[];
  summaryArticles?: Array<{ id: string; url: string; snippet: string; title?: string }>;
  f1Stories?: Story[];
  footballStories?: Story[];
  tennisStories?: Story[];
  footballData?: { league: string; standings: FootballStanding[] } | null;
  tennisData?: { rankings: TennisRanking[] } | null;
  redditUser?: string | null;
  feedSubreddits?: string[];
}) {
  const [edition, setEdition] = useState(initialEdition);
  const [hateWatchStories, setHateWatchStories] = useState(initialHateWatchStories);
  const [f1Stories, setF1Stories] = useState(initialF1Stories);
  const [footballStories, setFootballStories] = useState(initialFootballStories);
  const [tennisStories, setTennisStories] = useState(initialTennisStories);
  const [summaryState, setSummaryState] = useState<SummaryState>("idle");
  // Freshly fetched summaries that the reader hasn't applied yet. Held in
  // memory (not just sessionStorage) so "tap to update" always has something
  // concrete to apply even if storage is full or disabled.
  const pendingRef = useRef<Record<string, string>>({});
  const inFlightRef = useRef<AbortController | null>(null);
  const [brief, setBrief] = useState<EditionBrief | null>(null);
  const [personalization, setPersonalization] = useState<Personalization>(DEFAULT_PERSONALIZATION);
  const [liveWeather, setLiveWeather] = useState<WeatherNow | null>(null);
  const [weatherState, setWeatherState] = useState<WeatherState>("loading");
  const [grapevine, setGrapevine] = useState<GrapevineData>(initialEdition.grapevine ?? EMPTY_GRAPEVINE);

  // Reader memory (local only)
  const [memory, setMemory] = useState<ReaderMemory | null>(null);
  const [editorsNote, setEditorsNote] = useState<{ text: string; source: "ai" | "desk" } | null>(null);

  const hero = useMemo(() => pickHeroStory(edition), [edition]);

  // --- mount: personalization + reader memory -----------------------------
  useEffect(() => {
    setPersonalization(loadPersonalization());
    if (isArchive) {
      setMemory(loadMemory());
      return;
    }
    const mem = recordIssueOpened({
      isoDate: initialEdition.isoDate,
      issue: initialEdition.issue,
      hero,
    });
    setMemory(mem);
    const onMemory = () => setMemory(loadMemory());
    window.addEventListener("daily-index:memory", onMemory);
    return () => window.removeEventListener("daily-index:memory", onMemory);
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

  // --- weather: always resolves to ready or failed, never spins forever ----
  useEffect(() => {
    if (isArchive) {
      setWeatherState("failed");
      return;
    }
    let cancelled = false;
    setWeatherState("loading");
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), WEATHER_TIMEOUT_MS));
    Promise.race([getLiveWeather(personalization.homeCity), timeout])
      .then((w) => {
        if (cancelled) return;
        if (w) {
          setLiveWeather(w);
          setWeatherState("ready");
        } else {
          setWeatherState("failed");
        }
      })
      .catch(() => {
        if (!cancelled) setWeatherState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [isArchive, personalization.homeCity]);

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
        paddockNotes: enrich(prev.sections.paddockNotes),
        skyReport: prev.sections.skyReport,
        circuitBoard: enrich(prev.sections.circuitBoard),
        ledger: enrich(prev.sections.ledger),
        plasticPoints: enrich(prev.sections.plasticPoints),
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

  // "Tap to update" — swap the RSS snippets for the summaries we are holding.
  // Reads from memory first; sessionStorage is only a fallback so a full
  // storage (or Safari private mode) can never turn the tap into a no-op.
  const handleApplySummaries = useCallback(() => {
    let map = pendingRef.current;
    if (Object.keys(map).length === 0) {
      map = readSummaryRecord(edition.isoDate)?.byUrl ?? {};
    }
    if (Object.keys(map).length > 0) applyMap(map);
    pendingRef.current = {};
    setSummaryState("idle");
  }, [applyMap, edition.isoDate]);

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
      const currentUrls = new Set(summaryArticles.map((a) => a.url));

      // If we already asked for the brief / blurbs / note once today, don't
      // ask again on every reload just because the model returned nothing.
      const extrasDone = cached?.extrasAsked === true;
      let haveBrief = extrasDone;
      let havePicks = extrasDone;
      let haveNote = extrasDone;

      if (cached) {
        // Silently re-apply what the reader already accepted for these URLs.
        const hit: Record<string, string> = {};
        for (const url of currentUrls) if (cached.byUrl[url]) hit[url] = cached.byUrl[url];
        if (Object.keys(hit).length > 0) applyMap(hit);

        const cachedBrief = readBrief<EditionBrief>(today);
        if (cachedBrief) {
          setBrief(cachedBrief);
          haveBrief = true;
        }
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
        ? summaryArticles
        : summaryArticles.filter((a) => !cachedUrls.has(a.url) && !askedUrls.has(a.url));
      const picksToAsk = force || !havePicks ? grapevine.picks : [];
      const wantNote = force || !haveNote;
      const wantBrief = force || !haveBrief;

      if (toAsk.length === 0 && picksToAsk.length === 0 && !wantNote && !wantBrief) {
        setSummaryState("idle");
        return;
      }
      // Nothing new to summarise and the brief/note are already on the page.
      if (toAsk.length === 0 && picksToAsk.length === 0 && summaryArticles.length === 0) {
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
      const currentBody = new Map(summaryArticles.map((a) => [a.url, (a.snippet ?? "").trim()]));

      fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          // When only the brief is missing we still need the article list so
          // the server can write it; summaries for already-asked URLs are
          // simply ignored below.
          articles: toAsk.length > 0 ? toAsk : wantBrief ? summaryArticles : [],
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
            brief?: EditionBrief | null;
            pickBlurbs?: Record<string, string>;
            editorsNote?: string | null;
          };
        })
        .then(({ summaries, brief: apiBrief, pickBlurbs, editorsNote: apiNote }) => {
          if (controller.signal.aborted) return;
          const idToUrl = new Map(summaryArticles.map((a) => [a.id, a.url]));
          const askedNow = new Set((toAsk.length > 0 ? toAsk : summaryArticles).map((a) => a.url));

          const byUrl: Record<string, string> = {};
          const changed: Record<string, string> = {};
          for (const [id, text] of Object.entries(summaries ?? {})) {
            const url = idToUrl.get(id);
            if (!url || typeof text !== "string" || !text.trim()) continue;
            if (!force && !askedNow.has(url)) continue;
            byUrl[url] = text;
            if (text.trim() !== currentBody.get(url)) changed[url] = text;
          }

          // Persist everything we learned (including "asked, got snippet back")
          // so the next load doesn't re-request it; keep only the entries that
          // would visibly change the page for the reader to apply.
          mergeSummaryRecord(today, byUrl, Array.from(askedNow), {
            extrasAsked: force || picksToAsk.length > 0 || wantNote || wantBrief,
          });
          if (apiBrief) writeBrief(today, apiBrief);
          if (pickBlurbs && Object.keys(pickBlurbs).length > 0) writePickBlurbs(today, pickBlurbs);
          if (apiNote) writeNote(today, apiNote);

          if (apiBrief) setBrief(apiBrief);
          if (pickBlurbs) applyPickBlurbs(pickBlurbs);
          if (apiNote) setEditorsNote({ text: apiNote, source: "ai" });

          pendingRef.current = changed;
          setSummaryState(Object.keys(changed).length > 0 ? "done" : "unchanged");
        })
        .catch((err) => {
          if (controller.signal.aborted && inFlightRef.current !== controller) return; // superseded
          console.warn("[summarize] failed:", err);
          pendingRef.current = {};
          setSummaryState("failed");
        })
        .finally(() => {
          clearTimeout(timer);
          if (inFlightRef.current === controller) inFlightRef.current = null;
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isArchive, memory, edition.isoDate, edition.date, hero?.headline, summaryArticles, grapevine.picks, applyMap, applyPickBlurbs],
  );

  const runSummarizeRef = useRef(runSummarize);
  useEffect(() => {
    runSummarizeRef.current = runSummarize;
  }, [runSummarize]);

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

  const handleRetrySummaries = useCallback(() => runSummarizeRef.current(true), []);

  // "Nothing new" pill dismisses itself.
  useEffect(() => {
    if (summaryState !== "unchanged") return;
    const t = setTimeout(() => setSummaryState("idle"), UNCHANGED_DISMISS_MS);
    return () => clearTimeout(t);
  }, [summaryState]);

  // --- assemble -----------------------------------------------------------
  const rank = useCallback(
    <T extends Story>(stories: T[]) => (memory ? rankForReader(stories, memory) : stories),
    [memory],
  );
  const without = (stories: Story[]) => rank(stories.filter((s) => s.id !== hero?.id));

  const accentColor = personalization.favoriteF1Team
    ? F1_TEAM_COLORS[personalization.favoriteF1Team]
    : undefined;
  const weather = liveWeather ?? edition.weather ?? null;
  const isSunday = new Date().getDay() === 0;

  const sectionHasContent: Record<SectionKey, boolean> = {
    dateline: true,
    "paddock-notes": true,
    "sky-report": true,
    "plastic-points": true,
    "market-pulse": true,
    "circuit-board": edition.sections.circuitBoard.length > 0,
    ledger: edition.sections.ledger.length > 0,
    grapevine: !isArchive,
  };

  const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
    dateline: () => (
      <DatelineSection
        stories={without(edition.sections.dateline)}
        onThisDay={edition.onThisDay}
        wordOfDay={edition.wordOfDay}
      />
    ),
    "paddock-notes": () => (
      <PaddockNotesSection
        selectedSports={personalization.sports}
        f1Stories={without(f1Stories)}
        footballStories={without(footballStories)}
        tennisStories={without(tennisStories)}
        nextRace={edition.f1?.nextRace ?? null}
        upcoming={edition.f1?.upcoming ?? []}
        standings={edition.f1?.standings ?? []}
        constructorStandings={edition.f1?.constructorStandings ?? []}
        lastRace={edition.f1?.lastRace ?? null}
        accentColor={accentColor}
        favoriteF1Team={personalization.favoriteF1Team}
        favoriteDriverIds={personalization.favoriteF1Drivers}
        live={f1Live}
        footballStandings={footballData?.standings ?? []}
        footballLeague={footballData?.league ?? "Premier League"}
        favoriteFootballClub={personalization.favoriteFootballClub}
        tennisRankings={tennisData?.rankings ?? []}
        favoriteTennisPlayer={personalization.favoriteTennisPlayer}
        hateWatchStories={hateWatchStories}
      />
    ),
    "sky-report": () => (
      <SkyReportSection
        weather={weather}
        live={liveWeather !== null}
        status={weatherState}
        city={personalization.homeCity}
      />
    ),
    "circuit-board": () => <CircuitBoardSection stories={without(edition.sections.circuitBoard)} />,
    ledger: () => <LedgerSection stories={without(edition.sections.ledger)} />,
    "plastic-points": () => (
      <PlasticPointsSection
        stories={without(edition.sections.plasticPoints)}
        cards={edition.creditCards}
        cardsFollowing={personalization.cardsFollowing}
      />
    ),
    "market-pulse": () => (
      <MarketPulseSection
        stories={without(edition.sections.marketPulse)}
        indices={edition.markets.indices}
        mood={edition.markets.mood}
      />
    ),
    grapevine: () => (
      <GrapevineSection
        data={grapevine}
        subreddits={feedSubreddits ?? personalization.subreddits}
        redditUser={redditUser}
        dateKey={edition.isoDate}
      />
    ),
  };

  const order = isArchive
    ? (Object.keys(sectionRenderers) as SectionKey[]).filter((key) => sectionHasContent[key])
    : personalization.sectionOrder.filter((key) => sectionHasContent[key]);

  return (
    <main className="flex-1">
      {summaryState !== "idle" && (
        <SummaryBanner
          state={summaryState}
          onApply={handleApplySummaries}
          onRetry={handleRetrySummaries}
        />
      )}
      {!isArchive && (
        <EditionBriefPanel brief={brief} date={edition.date} isLoading={summaryState === "loading"} />
      )}
      <Masthead
        edition={edition}
        isArchive={isArchive}
        weather={weather ?? undefined}
        weatherLive={liveWeather !== null}
      />
      <div className="max-w-5xl mx-auto px-4">
        {/* Front page: the lead story runs two-thirds wide; the Editor's Desk
            sits in the right-hand column like a standing front-page box. */}
        {hero && (
          <div
            className={
              !isArchive && profile && editorsNote
                ? "grid md:grid-cols-[minmax(0,1fr)_280px] gap-x-8 gap-y-8 pt-8 pb-10"
                : "pt-8 pb-10"
            }
          >
            <HeroStory story={hero} />
            {!isArchive && profile && editorsNote && (
              <EditorsDesk
                note={editorsNote.text}
                noteSource={editorsNote.source}
                profile={profile}
                onThisDay={personalOtd}
                isSunday={isSunday}
              />
            )}
          </div>
        )}
        <div>
          {order.map((key, i) => (
            <div key={key} className="paper-section">
              <span className="section-folio" aria-hidden="true">
                § {i + 1} / {order.length}
              </span>
              {sectionRenderers[key]()}
            </div>
          ))}
        </div>
      </div>
      <footer className="max-w-5xl mx-auto px-4 py-8 border-t hairline mt-6 flex flex-wrap justify-between gap-2 text-xs text-ink-soft font-label">
        <span>
          The Daily Index — Vol. {edition.volume}, No. {edition.issue} — a personal digest, not a real newspaper.
        </span>
        <span className="font-mono normal-case tracking-normal">
          Everything this paper remembers about you stays on this device.
        </span>
      </footer>
    </main>
  );
}
