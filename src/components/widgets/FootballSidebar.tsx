import type { FootballLeagueData } from "@/lib/live/football-stats";

export default function FootballSidebar({
  leagues,
  favoriteClub = "",
}: {
  leagues: FootballLeagueData[];
  favoriteClub?: string;
}) {
  const favClub = favoriteClub.toLowerCase();

  return (
    <div className="paper-box">
      {leagues.map((leagueData) => {
        const { league, standings } = leagueData;
        const top8 = standings.slice(0, 8);
        return (
          <div key={league} className="first:pt-0 pt-4 first:border-t-0 border-t hairline">
            <div className="font-label text-[10px] text-ink-soft mb-2">
              {league.toUpperCase()}
            </div>
            {top8.length > 0 ? (
              <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-soft font-label text-[10px]">
              <th className="font-normal pb-1 w-6">#</th>
              <th className="font-normal pb-1">Club</th>
              <th className="font-normal pb-1 text-right w-6">P</th>
              <th className="font-normal pb-1 text-right w-8">Pts</th>
            </tr>
          </thead>
                <tbody>
                  {top8.map((row) => {
              const isHighlighted =
                favClub.length > 0 &&
                (row.club.toLowerCase().includes(favClub) ||
                  row.abbreviation.toLowerCase().includes(favClub));
                    return (
                      <tr
                        key={row.rank}
                        className={`border-t hairline first:border-t-0${isHighlighted ? " text-masthead-red font-semibold" : ""}`}
                      >
                        <td className="py-1 font-mono">{row.rank}</td>
                        <td className="py-1">{row.abbreviation}</td>
                        <td className="py-1 text-right font-mono">{row.played}</td>
                        <td className="py-1 text-right font-mono">{row.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-ink-soft italic">Standings unavailable.</p>
            )}
            {leagueData.leaders.length > 0 && (
              <div className="mt-4 pt-3 border-t hairline space-y-3">
                {leagueData.leaders.slice(0, 3).map((category) => (
                  <div key={category.name}>
                    <div className="font-label text-[10px] text-ink-soft mb-1">
                      {category.label.toUpperCase()}
                    </div>
                    <ol className="space-y-1 text-[11px]">
                      {category.leaders.map((leader, index) => (
                        <li key={`${category.name}-${leader.name}`} className="flex items-baseline gap-2">
                          <span className="font-mono text-ink-soft w-3">{index + 1}</span>
                          <span className="flex-1 truncate">{leader.name}</span>
                          <span className="font-mono text-ink-soft">{leader.displayValue}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
