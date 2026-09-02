import type { TennisRanking } from "@/lib/types";

export default function TennisSidebar({
  rankings,
  favoritePlayer = "",
}: {
  rankings: TennisRanking[];
  favoritePlayer?: string;
}) {
  const top8 = rankings.slice(0, 8);
  const favPlayer = favoritePlayer.toLowerCase();

  return (
    <div className="border hairline rounded-sm p-4 bg-card-bg">
      <div className="font-label text-[10px] text-ink-soft mb-2">ATP RANKINGS</div>
      {top8.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-soft font-label text-[10px]">
              <th className="font-normal pb-1 w-6">#</th>
              <th className="font-normal pb-1">Player</th>
              <th className="font-normal pb-1">Country</th>
            </tr>
          </thead>
          <tbody>
            {top8.map((row) => {
              const isHighlighted =
                favPlayer.length > 0 &&
                row.name.toLowerCase().includes(favPlayer);
              return (
                <tr
                  key={row.rank}
                  className={`border-t hairline first:border-t-0${isHighlighted ? " text-masthead-red font-semibold" : ""}`}
                >
                  <td className="py-1 font-mono">{row.rank}</td>
                  <td className="py-1">{row.name}</td>
                  <td className="py-1 text-ink-soft">{row.country}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-ink-soft italic">Rankings unavailable.</p>
      )}
    </div>
  );
}
