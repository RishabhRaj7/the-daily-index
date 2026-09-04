import type { FootballStanding } from "@/lib/types";

export default function FootballSidebar({
  standings,
  league = "Premier League",
  favoriteClub = "",
}: {
  standings: FootballStanding[];
  league?: string;
  favoriteClub?: string;
}) {
  const top8 = standings.slice(0, 8);
  const favClub = favoriteClub.toLowerCase();

  return (
    <div className="paper-box">
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
    </div>
  );
}
