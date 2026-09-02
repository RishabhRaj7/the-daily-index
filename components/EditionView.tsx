"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Edition,
  FootballStanding,
  Personalization,
  SectionKey,
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
import Masthead from "@/components/masthead/Masthead";
import HeroStory from "@/components/story/HeroStory";
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

export default function EditionView({
  edition: initialEdition,
  isArchive = false,
  f1Live = false,
  redditLive = false,
  hateWatchStories: initialHateWatchStories = [],
  summaryArticles = [],
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
  hateWatchStories?: import("@/lib/types").Story[];
  summaryArticles?: Array<{ id: string; url: string; snippet: string }>;
  f1Stories?: import("@/lib/types").Story[];
  footballStories?: import("@/lib/types").Story[];
  tennisStories?: import("@/lib/types").Story[];
  footballData?: { league: string; standings: FootballStanding[] } | null;
  tennisData?: { rankings: TennisRanking[] } | null;
}) {
  const [edition, setEdition] = useState(initialEdition);
  const [hateWatchStories, setHateWatchStories] = useState(initialHateWatchStories);
  const [f1Stories, setF1Stories] = useState(initialF1Stories);
  const [footballStories, setFootballStories] = useState(initialFootballStories);
  const [tennisStories, setTennisStories] = useState(initialTennisStories);
  const [summaryState, setSummaryState] = useState<"idle" | "loading" | "done">("idle");
  const [brief, setBrief] = useState<import("@/lib/types").EditionBrief | null>(null);
  const [personalization, setPersonalization] = useState<Personalization>(
    DEFAULT_PERSONALIZATION,
  );
  const [liveWeather, setLiveWeather] = useState<WeatherNow | null>(null);

  useEffect(() => {
    setPersonalization(loadPersonalization());
  }, []);

  useEffect(() => {
    if (isArchive) return;
    let cancelled = false;
    getLiveWeather(personalization.homeCity).then((w) => {
      if (!cancelled && w) setLiveWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [isArchive, personalization.homeCity]);

  // Applies a summaries map to all story sections in-place.
  const applyMap = useCallback((summaries: Record<string, string>) => {
    const enrich = (stories: import("@/lib/types").Story[]) =>
      stories.map((s) =>
        summaries[s.id] ? { ...s, body: [summaries[s.id]] } : s,
      );
    setEdition((prev) => ({
      ...prev,
      sections: {
        dateline:      enrich(prev.sections.dateline),
        paddockNotes:  enrich(prev.sections.paddockNotes),
        skyReport:     prev.sections.skyReport,
        circuitBoard:  enrich(prev.sections.circuitBoard),
        ledger:        enrich(prev.sections.ledger),
        plasticPoints: enrich(prev.sections.plasticPoints),
        marketPulse:   prev.sections.marketPulse,
        grapevine:     prev.sections.grapevine,
      },
    }));
    setHateWatchStories((prev) =>
      prev.map((s) => (summaries[s.id] ? { ...s, body: [summaries[s.id]] } : s)),
    );
    setF1Stories((prev) => enrich(prev));
    setFootballStories((prev) => enrich(prev));
    setTennisStories((prev) => enrich(prev));
  }, []);

  // Called when the user taps the "Summaries ready" banner button.
  // Reads from sessionStorage and applies in-place — no page reload needed.
  const handleApplySummaries = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const cached = sessionStorage.getItem(`daily-index:summaries:${today}`);
      if (cached) applyMap(JSON.parse(cached) as Record<string, string>);
      const cachedBrief = sessionStorage.getItem(`daily-index:brief:${today}`);
      if (cachedBrief) setBrief(JSON.parse(cachedBrief));
    } catch {}
    setSummaryState("idle");
  }, [applyMap]);

  // Background summarization — fires after initial render so the page loads
  // immediately with raw snippets. Summaries are cached in sessionStorage and
  // applied in-place when the user taps the banner button.
  useEffect(() => {
    if (isArchive || summaryArticles.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `daily-index:summaries:${today}`;
    const briefKey = `daily-index:brief:${today}`;

    // Already cached from an earlier visit today — apply silently, no badge.
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        applyMap(JSON.parse(cached) as Record<string, string>);
        const cachedBrief = sessionStorage.getItem(briefKey);
        if (cachedBrief) setBrief(JSON.parse(cachedBrief));
        return;
      }
    } catch {}

    // First visit of the day: fetch from the AI summarization endpoint.
    setSummaryState("loading");
    fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articles: summaryArticles }),
    })
      .then((r) => r.json())
      .then(({ summaries, brief: apiBrief }: { summaries: Record<string, string>; brief: import("@/lib/types").EditionBrief | null }) => {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(summaries));
          if (apiBrief) sessionStorage.setItem(briefKey, JSON.stringify(apiBrief));
        } catch {}
        if (apiBrief) setBrief(apiBrief);
        setSummaryState("done");
      })
      .catch(() => setSummaryState("done"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hero = pickHeroStory(edition);
  const without = (stories: typeof edition.sections.dateline) =>
    stories.filter((s) => s.id !== hero?.id);
  const accentColor = personalization.favoriteF1Team
    ? F1_TEAM_COLORS[personalization.favoriteF1Team]
    : undefined;
  const weather = liveWeather ?? edition.weather ?? null;

  const sectionHasContent: Record<SectionKey, boolean> = {
    // Dateline always carries the On This Day / Word of the Day fillers even
    // if a total live-fetch failure leaves it with zero stories.
    dateline: true,
    // These always show a graceful "unavailable" message when their live
    // source comes back empty, rather than disappearing outright.
    "paddock-notes": true,
    "sky-report": true,
    "plastic-points": true,
    "market-pulse": true,
    "circuit-board": edition.sections.circuitBoard.length > 0,
    ledger: edition.sections.ledger.length > 0,
    grapevine: edition.trending.length > 0,
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
        f1Stories={f1Stories.filter((s) => s.id !== hero?.id)}
        footballStories={footballStories.filter((s) => s.id !== hero?.id)}
        tennisStories={tennisStories.filter((s) => s.id !== hero?.id)}
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
      <SkyReportSection weather={weather} live={liveWeather !== null} />
    ),
    "circuit-board": () => (
      <CircuitBoardSection
        stories={without(edition.sections.circuitBoard)}
      />
    ),
    ledger: () => (
      <LedgerSection
        stories={without(edition.sections.ledger)}
      />
    ),
    "plastic-points": () => (
      <PlasticPointsSection
        stories={without(edition.sections.plasticPoints)}
        cards={edition.creditCards}
        cardFollowing={personalization.cardFollowing}
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
        trending={edition.trending}
        redditLive={redditLive}
      />
    ),
  };

  const order = isArchive
    ? Object.keys(sectionRenderers).filter(
        (key) => sectionHasContent[key as SectionKey],
      )
    : personalization.sectionOrder.filter((key) => sectionHasContent[key]);

  return (
    <main className="flex-1">
      {summaryState !== "idle" && (
        <SummaryBanner state={summaryState} onApply={handleApplySummaries} />
      )}
      {!isArchive && (
        <EditionBriefPanel
          brief={brief}
          date={edition.date}
          isLoading={summaryState === "loading"}
        />
      )}
      <Masthead
        edition={edition}
        isArchive={isArchive}
        weather={weather ?? undefined}
        weatherLive={liveWeather !== null}
      />
      <div className="max-w-5xl mx-auto px-4">
        {hero && <HeroStory story={hero} />}
        <div>
          {order.map((key) => (
            <div key={key} className="mt-10">
              {sectionRenderers[key as SectionKey]()}
            </div>
          ))}
        </div>
      </div>
      <footer className="max-w-5xl mx-auto px-4 py-8 text-xs text-ink-soft font-label">
        The Daily Index — Vol. {edition.volume}, No. {edition.issue} — a personal
        digest, not a real newspaper.
      </footer>
    </main>
  );
}
