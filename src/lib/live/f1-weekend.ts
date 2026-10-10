import { getStore } from "@/lib/server/store";
import { pastSession, seasonSessions } from "./f1-live";
import { circuitHistory, type CircuitHistory } from "./f1-season";

// A race weekend at a glance, for the Weekend view on /f1/live: every
// finished session's classification (from the kept copies of F1's archive),
// its fastest lap and whether it rained, and the circuit's history (who won,
// took pole and set the fastest lap in recent years). Kept ten minutes, so a
// session that has just finished joins quickly.

export interface WeekendRow {
  pos: number;
  code: string;
  name: string;
  team: string;
  colour: string;
  /** Best lap (practice, qualifying) or gap to the winner (races). */
  time: string;
  laps: number;
  out: boolean;
}

export interface WeekendSession {
  name: string;
  path: string;
  end: string;
  type: "Practice" | "Qualifying" | "Race";
  rows: WeekendRow[];
  fastest: { code: string; time: string } | null;
  rain: boolean;
  air: number | null;
  track: number | null;
}

export interface WeekendData {
  meeting: string;
  location: string;
  round: number;
  sessions: WeekendSession[];
  history: CircuitHistory | null;
}

export async function getWeekend(meeting: string, year = new Date().getUTCFullYear()): Promise<WeekendData | null> {
  const store = getStore();
  const k = `f1:weekend:v1:${year}:${meeting.toLowerCase().replace(/\W+/g, "-")}`;
  const kept = await store.get<WeekendData>(k).catch(() => null);
  if (kept) return kept;
  const m = (await seasonSessions(year)).find((x) => x.meeting === meeting);
  const [snaps, history] = await Promise.all([Promise.all((m?.sessions ?? []).map((s) => pastSession(s.path).catch(() => null))), circuitHistory(meeting, year).catch(() => null)]);
  if (!m && !history) return null;
  const sessions: WeekendSession[] = (m?.sessions ?? []).flatMap((s, i) => {
    const snap = snaps[i];
    if (!snap) return [];
    const race = snap.type === "Race";
    const fast = snap.rows.find((r) => r.bestFastest && r.best);
    return [
      {
        name: s.name,
        path: s.path,
        end: s.end,
        type: snap.type,
        rows: snap.rows.map((r) => ({
          pos: r.position,
          code: r.code,
          name: r.name,
          team: r.team,
          colour: r.colour,
          time: race ? (r.position === 1 ? "Winner" : r.out ? "DNF" : r.gap || "") : r.best || "",
          laps: r.laps,
          out: r.out,
        })),
        fastest: fast ? { code: fast.code, time: fast.best } : null,
        rain: !!snap.weather?.rain,
        air: snap.weather?.air ?? null,
        track: snap.weather?.track ?? null,
      },
    ];
  });
  const out: WeekendData = { meeting, location: m?.location ?? history?.locality ?? "", round: m?.round ?? 0, sessions, history };
  await store.set(k, out, { ttlSeconds: 600 }).catch(() => {});
  return out;
}
