import type { FootballStanding } from "@/lib/types";

export async function getFootballStandings(): Promise<{
  league: string;
  standings: FootballStanding[];
}> {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings",
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return { league: "Premier League", standings: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = data?.children?.[0]?.standings?.entries ?? [];

    const standings: FootballStanding[] = entries
      .map((entry) => {
        const stat = (name: string): number => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const found = (entry.stats as any[])?.find((s: any) => s.name === name);
          return (found?.value as number) ?? 0;
        };
        return {
          rank: stat("rank"),
          club: (entry.team?.displayName as string) ?? "",
          abbreviation: (entry.team?.abbreviation as string) ?? "",
          played: stat("gamesPlayed"),
          wins: stat("wins"),
          draws: stat("ties"),
          losses: stat("losses"),
          points: stat("points"),
        };
      })
      .sort((a, b) => a.rank - b.rank);

    return { league: "Premier League", standings };
  } catch {
    return { league: "Premier League", standings: [] };
  }
}
