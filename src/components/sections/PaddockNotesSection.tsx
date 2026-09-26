import type {
  Story,
  F1Race,
  F1Standing,
  F1LastRace,
  F1GridResult,
  F1LiveResult,
  F1ConstructorStanding,
  FootballStanding,
  TennisRanking,
} from "@/lib/types";
import { SECTION_META } from "@/lib/sections";
import { teamAbbrev, isLightTeamColor } from "@/lib/personalization";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";
import F1Sidebar from "@/components/widgets/F1Sidebar";
import FootballSidebar from "@/components/widgets/FootballSidebar";
import TennisSidebar from "@/components/widgets/TennisSidebar";

const SPORT_LABELS: Record<"f1" | "football" | "tennis", string> = {
  f1: "FORMULA 1",
  football: "FOOTBALL",
  tennis: "TENNIS",
};

// Square badge showing the team's abbreviation on their brand color.
function TeamBadge({ team, color }: { team: string; color: string }) {
  const abbr = teamAbbrev(team);
  const textColor = isLightTeamColor(color) ? "#111111" : "#ffffff";
  return (
    <div
      className="flex items-center justify-center rounded-sm font-mono font-black text-[11px] tracking-wider shrink-0"
      style={{ backgroundColor: color, color: textColor, width: 40, height: 40 }}
    >
      {abbr}
    </div>
  );
}

export default function PaddockNotesSection({
  selectedSports,
  f1Stories,
  footballStories,
  tennisStories,
  nextRace,
  upcoming,
  standings,
  constructorStandings = [],
  lastRace = null,
  qualifyingGrid = [],
  liveResults = [],
  currentRace = null,
  racePhase = "last-race",
  accentColor,
  favoriteF1Team = "",
  favoriteDriverIds = [],
  footballStandings = [],
  footballLeague = "Premier League",
  favoriteFootballClub,
  tennisRankings = [],
  favoriteTennisPlayer,
  hateWatchStories = [],
}: {
  selectedSports: ("f1" | "football" | "tennis")[];
  f1Stories: Story[];
  footballStories: Story[];
  tennisStories: Story[];
  nextRace: F1Race | null;
  upcoming: F1Race[];
  standings: F1Standing[];
  constructorStandings?: F1ConstructorStanding[];
  lastRace?: F1LastRace | null;
  qualifyingGrid?: F1GridResult[];
  liveResults?: F1LiveResult[];
  currentRace?: F1Race | null;
  racePhase?: "last-race" | "qualifying" | "race";
  accentColor?: string;
  favoriteF1Team?: string;
  favoriteDriverIds?: string[];
  live?: boolean;
  footballStandings?: FootballStanding[];
  footballLeague?: string;
  favoriteFootballClub?: string;
  tennisRankings?: TennisRanking[];
  favoriteTennisPlayer?: string;
  hateWatchStories?: Story[];
}) {
  const multiSport = selectedSports.length > 1;

  function storiesForSport(sport: "f1" | "football" | "tennis"): Story[] {
    if (sport === "f1") return f1Stories;
    if (sport === "football") return footballStories;
    return tennisStories;
  }

  // The F1 sidebar is a self-updating client island: it seeds itself from
  // whatever the server already printed, streams the remaining parts in via
  // /api/f1, retries per block on failure and refreshes in place — see
  // components/widgets/F1Sidebar.tsx.
  function f1Sidebar() {
    return (
      <F1Sidebar
        nextRace={nextRace}
        upcoming={upcoming}
        standings={standings}
        constructorStandings={constructorStandings}
        lastRace={lastRace}
        qualifyingGrid={qualifyingGrid}
        liveResults={liveResults}
        currentRace={currentRace}
        racePhase={racePhase}
        accentColor={accentColor}
        favoriteF1Team={favoriteF1Team}
        favoriteDriverIds={favoriteDriverIds}
      />
    );
  }

  function sidebarForSport(sport: "f1" | "football" | "tennis") {
    if (sport === "f1") return f1Sidebar();
    if (sport === "football") {
      return (
        <FootballSidebar
            leagues={[{ standings: footballStandings, league: footballLeague, leaders: [] }]}
          favoriteClub={favoriteFootballClub}
        />
      );
    }
    return (
      <TennisSidebar
        rankings={tennisRankings}
        favoritePlayer={favoriteTennisPlayer}
      />
    );
  }

  // Returns the border/label style for the F1 sub-section when a team is chosen.
  function f1SubSectionStyle(): React.CSSProperties {
    if (!accentColor) return {};
    return { borderColor: accentColor };
  }

  const sectionLabel = SECTION_META["paddock-notes"].label;

  return (
    <section id="paddock-notes">
      <SectionHeader label={sectionLabel} sectionKey="paddock-notes" />

      {!multiSport ? (
        // ── Single sport layout ──────────────────────────────────────────
        (() => {
          const sport = selectedSports[0] ?? "f1";
          const stories = storiesForSport(sport);

          // F1: show a team-color accent bar below the section header
          const f1Accent = sport === "f1" && accentColor && favoriteF1Team;

          return (
            <>
              {f1Accent && (
                <div
                  className="h-[2px] w-full mb-5 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
              )}
              <div className="grid md:grid-cols-[1fr_280px] gap-6">
                <div>
                  {stories.length > 0 && (
                    <div className="divide-y hairline">
                      {stories.map((s) => (
                        <StoryArticle key={s.id} story={s} />
                      ))}
                    </div>
                  )}

                  {hateWatchStories.length > 0 && (
                    <div className="mt-6 pt-4 border-t hairline">
                      <div className="font-label text-[10px] tracking-widest text-ink-soft uppercase mb-3">
                        Schadenfreude
                      </div>
                      <div className="divide-y hairline">
                        {hateWatchStories.map((s) => (
                          <StoryArticle key={s.id} story={s} />
                        ))}
                      </div>
                    </div>
                  )}

                  {stories.length === 0 && hateWatchStories.length === 0 && (
                    <p className="text-sm text-ink-soft italic">
                      No sports news found in the last day.
                    </p>
                  )}
                </div>
                <div>{sidebarForSport(sport)}</div>
              </div>
            </>
          );
        })()
      ) : (
        // ── Multi-sport layout ───────────────────────────────────────────
        <>
          {selectedSports.map((sport, i) => {
            const stories = storiesForSport(sport);
            const isF1 = sport === "f1";
            const hasTeam = isF1 && accentColor && favoriteF1Team;

            return (
              <div key={sport} className={i === 0 ? "" : "mt-8"}>
                {/* Sub-section label — team-colored for F1 when a team is selected */}
                <div
                  className="flex items-center justify-between pb-1 mb-3 border-b"
                  style={hasTeam ? f1SubSectionStyle() : {}}
                >
                  <span
                    className={`font-label text-[11px] ${hasTeam ? "" : "text-ink-soft"}`}
                    style={hasTeam ? { color: accentColor } : {}}
                  >
                    {SPORT_LABELS[sport]}
                  </span>
                  {hasTeam && (
                    <TeamBadge team={favoriteF1Team} color={accentColor!} />
                  )}
                </div>

                <div className="grid md:grid-cols-[1fr_280px] gap-6">
                  <div>
                    {stories.length > 0 && (
                      <div className="divide-y hairline">
                        {stories.map((s) => (
                          <StoryArticle key={s.id} story={s} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div>{sidebarForSport(sport)}</div>
                </div>
              </div>
            );
          })}

          {hateWatchStories.length > 0 && (
            <div className="mt-6 pt-4 border-t hairline">
              <div className="font-label text-[10px] tracking-widest text-ink-soft uppercase mb-3">
                Schadenfreude
              </div>
              <div className="divide-y hairline">
                {hateWatchStories.map((s) => (
                  <StoryArticle key={s.id} story={s} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
