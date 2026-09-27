import { getLiveMarkets } from "@/lib/live/indices";
import { getF1DriverStandings, getF1Results, getF1Schedule } from "@/lib/live/f1";

// The numbers that were true on an edition's day — the archive shows them
// next to the stored stories. Captured once per date (the first build of the
// day), independent of any reader's preferences. Every part is optional: a
// source that fails at capture time is simply absent from that day's page.

export interface EditionSnapshot {
  capturedAt: string;
  markets: Array<{ name: string; level: number; changePct: number }>;
  f1: {
    standings: Array<{ position: number; name: string; team: string; points: number }>;
    lastRace: { name: string; podium: Array<{ position: number; driver: string; team: string }> } | null;
    nextRace: { name: string; date: string } | null;
  };
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export async function captureSnapshot(): Promise<EditionSnapshot> {
  const [markets, standings, results, schedule] = await Promise.allSettled([
    getLiveMarkets(),
    getF1DriverStandings(),
    getF1Results(),
    getF1Schedule(),
  ]);

  const last = settled(results)?.lastRace ?? null;
  const next = settled(schedule)?.nextRace ?? null;

  return {
    capturedAt: new Date().toISOString(),
    markets: (settled(markets)?.indices ?? []).map((i) => ({
      name: i.name,
      level: i.level,
      changePct: i.changePct,
    })),
    f1: {
      standings: (settled(standings)?.standings ?? []).slice(0, 10).map((s) => ({
        position: s.position,
        name: s.name,
        team: s.team,
        points: s.points,
      })),
      lastRace: last
        ? {
            name: last.name,
            podium: last.results
              .filter((r) => r.position !== null && r.position <= 3)
              .map((r) => ({ position: r.position as number, driver: r.driver, team: r.team })),
          }
        : null,
      nextRace: next ? { name: next.name, date: next.date } : null,
    },
  };
}
