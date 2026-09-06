import type { Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";
import FootballSidebar from "@/components/widgets/FootballSidebar";
import TennisSidebar from "@/components/widgets/TennisSidebar";
import type { FootballStanding, TennisRanking } from "@/lib/types";
import type { FootballLeagueData } from "@/lib/live/football-stats";

export default function SportsSection({
  footballStories,
  tennisStories,
  footballLeagues,
  favoriteFootballClub,
  tennisRankings,
  favoriteTennisPlayer,
}: {
  footballStories: Story[];
  tennisStories: Story[];
  footballLeagues: FootballLeagueData[];
  favoriteFootballClub?: string;
  tennisRankings: TennisRanking[];
  favoriteTennisPlayer?: string;
}) {
  const groups = [
    { label: "Football", stories: footballStories },
    { label: "Tennis", stories: tennisStories },
  ].filter((group) => group.stories.length > 0);

  return (
    <section id="sports">
      <SectionHeader sectionKey="sports" />
      {groups.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="font-label text-[11px] text-ink-soft border-b hairline pb-1 mb-1">
                {group.label}
              </div>
              <div className="grid md:grid-cols-[1fr_280px] gap-6">
                <div className="divide-y hairline">
                  {group.stories.map((story) => (
                    <StoryArticle key={story.id} story={story} />
                  ))}
                </div>
                <div>
                  {group.label === "Football" ? (
                    <FootballSidebar
                      leagues={footballLeagues}
                      favoriteClub={favoriteFootballClub}
                    />
                  ) : (
                    <TennisSidebar
                      rankings={tennisRankings}
                      favoritePlayer={favoriteTennisPlayer}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-soft italic">No football or tennis news found.</p>
      )}
    </section>
  );
}