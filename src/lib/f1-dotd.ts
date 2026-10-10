import type { LiveDotd, LivePitStop, LivePrediction, LiveRow } from "./f1-live-types";

// Driver of the Day, the case so far. F1 runs the fans' vote during the race
// but publishes nothing until it names the winner after the flag, so this is
// our read of who is making the case, from what the vote tends to reward:
//   places made up from the grid (worth more the nearer they bring a car to
//   the points and the podium), a recovery after dropping back, a strong
//   opening lap, points or a podium in a car that rarely gets there, leading,
//   and the fastest lap. Built on the server with each read (lib/live/f1-live.ts).

/** What a place is worth: a little for each, more inside the points, more on the podium. */
const worth = (p: number) => Math.max(0, 21 - p) + (p <= 10 ? 4 : 0) + (p <= 3 ? 3 : 0);

export function driverOfTheDay(
  rows: LiveRow[],
  lapPositions: { code: string; positions: number[] }[],
  prediction: LivePrediction | null,
  pitStops: LivePitStop[],
  lap: number,
  over: boolean,
): LiveDotd | null {
  if (lap < 5) return null;
  const field = rows.length || 20;
  const series = new Map(lapPositions.map((d) => [d.code, d.positions]));
  // A team's place in the constructors' table (before this race).
  const teamRank = new Map((prediction?.teams ?? []).map((t) => [t.name, t.position]));

  const contenders = rows.flatMap((r) => {
    const pos = series.get(r.code);
    if (r.out || !pos || pos.length < 2 || r.position > field) return [];
    const grid = pos[0] > 0 ? pos[0] : field; // 0: from the pit lane
    const now = r.position;
    const reasons: { text: string; score: number }[] = [];

    const gained = grid - now;
    const gain = worth(now) - worth(grid);
    if (gained >= 2) reasons.push({ text: `P${grid} → P${now}, ${gained} places up`, score: gain * 0.75 });
    else if (gain < 0) reasons.push({ text: "", score: gain / 2 });

    const opening = grid - (pos[1] || grid);
    if (opening >= 3) reasons.push({ text: `${opening} places on the opening lap`, score: opening * 0.4 });

    // Back from the bottom of the race: the lowest it ran after lap 1, leaving
    // out the laps after its own stops (the field's stops hand those places
    // back by themselves).
    const stops = pitStops.filter((p) => p.code === r.code).map((p) => p.lap);
    const low = Math.max(...pos.flatMap((p, l) => (l >= 2 && p > 0 && !stops.some((s) => l >= s && l <= s + 12) ? [p] : [])), now);
    const back = low - Math.max(now, grid);
    if (back >= 4) reasons.push({ text: `back from P${low}`, score: back * 0.7 });

    const rank = teamRank.get(r.team);
    // The further down the constructors' table, the more a podium or points say.
    if (rank && now <= 3 && rank > 3) reasons.push({ text: `a podium for ${r.team}`, score: Math.min(15, (rank - 3) * 4) });
    else if (rank && now <= 10 && rank >= 7) reasons.push({ text: `points for ${r.team}`, score: rank - 5 });

    if (now === 1) reasons.push({ text: pos.slice(1).every((p) => p === 1) ? "led every lap" : over ? "won" : "leading", score: 4 });
    if (r.bestFastest) reasons.push({ text: "fastest lap", score: 1.5 });

    const score = reasons.reduce((s, x) => s + x.score, 0);
    return score > 2 ? [{ code: r.code, colour: r.colour, team: r.team, grid, position: now, score, reasons: reasons.filter((x) => x.text && x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.text) }] : [];
  });

  contenders.sort((a, b) => b.score - a.score);
  return contenders.length ? { lap, contenders: contenders.slice(0, 5).map((c) => ({ ...c, score: Math.round(c.score * 10) / 10 })) } : null;
}
