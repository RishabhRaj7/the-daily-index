import type {
  Story,
  F1Race,
  F1Standing,
  F1LastRace,
  F1ConstructorStanding,
  FootballStanding,
  TennisRanking,
} from "@/lib/types";
import { SECTION_META } from "@/lib/sections";
import { teamColor, teamAbbrev, isLightTeamColor } from "@/lib/personalization";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";
import StartingGrid from "@/components/widgets/StartingGrid";
import LiveBadge from "@/components/widgets/LiveBadge";
import FavoriteDriverCard from "@/components/widgets/FavoriteDriverCard";
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
  accentColor,
  favoriteF1Team = "",
  favoriteDriverIds = [],
  live = false,
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
  const favoriteDrivers = favoriteDriverIds
    .map((id) =>
      standings.find(
        (s) =>
          s.driverId === id.toLowerCase() ||
          s.code.toLowerCase() === id.toLowerCase() ||
          s.name.toLowerCase().includes(id.toLowerCase()),
      ),
    )
    .filter((s): s is F1Standing => s !== undefined);

  const top5drivers = standings.slice(0, 5);
  const top5constructors = constructorStandings.slice(0, 5);
  const multiSport = selectedSports.length > 1;

  // Normalized team name for comparison against constructor standings rows.
  const normFavTeam = favoriteF1Team.replace(/\s*F1 Team$/i, "").trim();

  function storiesForSport(sport: "f1" | "football" | "tennis"): Story[] {
    if (sport === "f1") return f1Stories;
    if (sport === "football") return footballStories;
    return tennisStories;
  }

  function f1Sidebar() {
    return (
      <div className="space-y-4">
        {/* Team badge card — only shown when a team is selected */}
        {accentColor && favoriteF1Team && (
          <div
            className="rounded-sm p-4 flex items-center gap-3"
            style={{ backgroundColor: accentColor + "18", borderLeft: `3px solid ${accentColor}` }}
          >
            <TeamBadge team={favoriteF1Team} color={accentColor} />
            <div>
              <div className="font-label text-[10px] text-ink-soft">Following</div>
              <div
                className="font-headline text-sm font-semibold leading-tight"
                style={{ color: accentColor }}
              >
                {normFavTeam || favoriteF1Team}
              </div>
            </div>
          </div>
        )}

        {favoriteDrivers.map((driver) => (
          <FavoriteDriverCard
            key={driver.driverId}
            standing={driver}
            accentColor={teamColor(driver.team)}
          />
        ))}

        {nextRace ? (
          <StartingGrid
            nextRace={nextRace}
            upcoming={upcoming}
            lastRace={lastRace}
            accentColor={accentColor}
            live={live}
          />
        ) : (
          <div className="paper-box text-xs text-ink-soft italic">
            Race schedule unavailable.
          </div>
        )}

        {/* Drivers' Championship */}
        <div className="paper-box">
          <div className="flex items-center justify-between mb-2">
            <div className="font-label text-[10px] text-ink-soft">
              Drivers&rsquo; Championship
            </div>
            {live && <LiveBadge />}
          </div>
          {top5drivers.length > 0 ? (
            <table className="w-full text-xs">
              <tbody>
                {top5drivers.map((s) => {
                  const driverTeamColor = teamColor(s.team);
                  return (
                    <tr key={s.position} className="border-t hairline first:border-t-0">
                      <td className="py-1 font-mono w-6">{s.position}</td>
                      <td className="py-1">
                        {driverTeamColor && (
                          <span
                            className="inline-block w-[3px] h-3 rounded-full mr-1.5 align-middle"
                            style={{ backgroundColor: driverTeamColor }}
                          />
                        )}
                        {s.name}
                      </td>
                      <td className="py-1 text-ink-soft text-[10px]">{s.code}</td>
                      <td className="py-1 text-right font-mono">{s.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-ink-soft italic">Standings unavailable.</p>
          )}
        </div>

        {/* Constructors' Championship */}
        {top5constructors.length > 0 && (
          <div className="paper-box">
            <div className="font-label text-[10px] text-ink-soft mb-2">
              Constructors&rsquo; Championship
            </div>
            <table className="w-full text-xs">
              <tbody>
                {top5constructors.map((cs) => {
                  const csNorm = cs.team.replace(/\s*F1 Team$/i, "").trim();
                  const csColor = teamColor(cs.team);
                  const isFav = normFavTeam.length > 0 && csNorm === normFavTeam;
                  return (
                    <tr
                      key={cs.position}
                      className={`border-t hairline first:border-t-0 ${isFav ? "font-semibold" : ""}`}
                      style={isFav && accentColor ? { color: accentColor } : {}}
                    >
                      <td className="py-1 font-mono w-6">{cs.position}</td>
                      <td className="py-1">
                        {csColor && (
                          <span
                            className="inline-block w-[3px] h-3 rounded-full mr-1.5 align-middle"
                            style={{ backgroundColor: csColor }}
                          />
                        )}
                        {csNorm}
                      </td>
                      <td className="py-1 text-right font-mono">{cs.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function sidebarForSport(sport: "f1" | "football" | "tennis") {
    if (sport === "f1") return f1Sidebar();
    if (sport === "football") {
      return (
        <FootballSidebar
          standings={footballStandings}
          league={footballLeague}
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
    <section id="paddock-notes" className="pb-8">
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
