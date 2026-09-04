"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [summaryState, setSummaryState] = useState<"idle" | "loading" | "done">("idle");
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

  const handleApplySummaries = useCallback(() => {
    const today = edition.isoDate;
    try {
      const cached = sessionStorage.getItem(`daily-index:summaries:v2:${today}`);
      if (cached) applyMap(JSON.parse(cached) as Record<string, string>);
      const cachedBrief = sessionStorage.getItem(`daily-index:brief:${today}`);
      if (cachedBrief) setBrief(JSON.parse(cachedBrief));
    } catch {}
    setSummaryState("idle");
  }, [applyMap, edition.isoDate]);

  useEffect(() => {
    if (isArchive || memory === null) return;
    const today = edition.isoDate;
    const cacheKey = `daily-index:summaries:v2:${today}`;
    const briefKey = `daily-index:brief:${today}`;
    const picksKey = `daily-index:picks:${today}`;
    const noteKey = `daily-index:note:${today}`;

    // Deterministic desk note shows immediately; the AI one replaces it if/when it arrives.
    const prof = buildProfile(memory);
    const weekday = new Date().toLocaleDateString("en-GB", { weekday: "long" });
    setEditorsNote((cur) => cur ?? { text: fallbackEditorsNote(prof, { weekday, heroHeadline: hero?.headline }), source: "desk" });

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        applyMap(JSON.parse(cached) as Record<string, string>);
        const cachedBrief = sessionStorage.getItem(briefKey);
        if (cachedBrief) setBrief(JSON.parse(cachedBrief));
        const cachedPicks = sessionStorage.getItem(picksKey);
        if (cachedPicks) applyPickBlurbs(JSON.parse(cachedPicks));
        const cachedNote = sessionStorage.getItem(noteKey);
        if (cachedNote) setEditorsNote({ text: cachedNote, source: "ai" });
        return;
      }
    } catch {}

    if (summaryArticles.length === 0 && grapevine.picks.length === 0) return;

    setSummaryState("loading");
    fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articles: summaryArticles,
        picks: grapevine.picks.map((p) => ({
          id: p.id,
          title: p.title,
          snippet: p.snippet,
          domain: p.domain,
          why: p.why,
        })),
        reader: {
          profile: prof,
          weekday,
          dateLabel: edition.date,
          heroHeadline: hero?.headline,
          recentHeadlines: engagementsSince(memory, 7).slice(-6).map((e) => e.headline),
        },
      }),
    })
      .then((r) => r.json())
      .then(
        ({
          summaries,
          brief: apiBrief,
          pickBlurbs,
          editorsNote: apiNote,
        }: {
          summaries: Record<string, string>;
          brief: EditionBrief | null;
          pickBlurbs?: Record<string, string>;
          editorsNote?: string | null;
        }) => {
          const idToUrl = new Map(summaryArticles.map((a) => [a.id, a.url]));
          const byUrl: Record<string, string> = {};
          for (const [id, text] of Object.entries(summaries ?? {})) {
            const url = idToUrl.get(id);
            if (url && text) byUrl[url] = text;
          }
          // Not applied yet — the reader taps the banner so text never shifts
          // under them mid-read. handleApplySummaries reads this cache.
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(byUrl));
            if (apiBrief) sessionStorage.setItem(briefKey, JSON.stringify(apiBrief));
            if (pickBlurbs) sessionStorage.setItem(picksKey, JSON.stringify(pickBlurbs));
            if (apiNote) sessionStorage.setItem(noteKey, apiNote);
          } catch {}
          if (apiBrief) setBrief(apiBrief);
          if (pickBlurbs) applyPickBlurbs(pickBlurbs);
          if (apiNote) setEditorsNote({ text: apiNote, source: "ai" });
          setSummaryState("done");
        },
      )
      .catch(() => setSummaryState("done"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory === null]);

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
      />
    ),
  };

  const order = isArchive
    ? (Object.keys(sectionRenderers) as SectionKey[]).filter((key) => sectionHasContent[key])
    : personalization.sectionOrder.filter((key) => sectionHasContent[key]);

  return (
    <main className="flex-1">
      {summaryState !== "idle" && (
        <SummaryBanner state={summaryState} onApply={handleApplySummaries} />
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
