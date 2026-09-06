import type { FootballLeaderCategory, FootballStanding } from "@/lib/types";

export interface FootballLeagueData {
  league: string;
  standings: FootballStanding[];
  leaders: FootballLeaderCategory[];
}

export async function getFootballStandings(): Promise<{
  leagues: FootballLeagueData[];
}> {
  const fetchLeague = async (league: string, code: string) => {
    try {
      const [standingsRes, leadersRes] = await Promise.all([
        fetch(
          `https://site.api.espn.com/apis/v2/sports/soccer/${code}/standings`,
          { next: { revalidate: 3600 } },
        ),
        fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/leaders`,
          { next: { revalidate: 3600 } },
        ),
      ]);
      if (!standingsRes.ok) return { league, standings: [] as FootballStanding[], leaders: [] };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await standingsRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadersData: any = leadersRes.ok ? await leadersRes.json() : null;
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

      // ESPN exposes categories such as goals and assists under `leaders`.
      // Keep all useful categories so the sidebar can show new provider stats
      // without another code change.
      const leaders: FootballLeaderCategory[] = (leadersData?.leaders ?? [])
        .filter((category: { leaders?: unknown[] }) => Array.isArray(category.leaders))
        .map((category: {
          name?: string;
          displayName?: string;
          leaders: Array<{
            athlete?: { displayName?: string };
            team?: { displayName?: string };
            value?: number;
            displayValue?: string;
          }>;
        }) => ({
          name: category.name ?? "stat",
          label: category.displayName ?? category.name ?? "Stat leaders",
          leaders: category.leaders.slice(0, 3).map((leader) => ({
            name: leader.athlete?.displayName ?? "Unknown player",
            team: leader.team?.displayName ?? "",
            value: Number(leader.value ?? 0),
            displayValue: leader.displayValue ?? String(leader.value ?? 0),
          })),
        }))
        .filter((category: FootballLeaderCategory) => category.leaders.length > 0);

      return { league, standings, leaders };
    } catch {
      return { league, standings: [], leaders: [] };
    }
  };

  const [laLiga, premierLeague] = await Promise.all([
    fetchLeague("La Liga", "esp.1"),
    fetchLeague("Premier League", "eng.1"),
  ]);
  return { leagues: [laLiga, premierLeague] };
}
