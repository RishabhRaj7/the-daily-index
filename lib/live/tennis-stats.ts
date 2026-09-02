import type { TennisRanking } from "@/lib/types";

export async function getTennisRankings(): Promise<TennisRanking[]> {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/tennis/rankings",
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ranks: any[] = data?.rankings?.[0]?.ranks ?? [];

    return ranks.map((r) => ({
      rank: (r.current as number) ?? 0,
      name: `${(r.athlete?.firstName as string) ?? ""} ${(r.athlete?.lastName as string) ?? ""}`.trim(),
      country: (r.athlete?.flag?.alt as string) ?? "",
      points: (r.points as number) ?? 0,
    }));
  } catch {
    return [];
  }
}
