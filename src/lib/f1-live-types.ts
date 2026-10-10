// The shape of a live F1 session as the paper prints it — built on the server
// from F1's live timing (lib/live/f1-live.ts), read by the Pit wall's timing
// card and the /f1/live page.

export type TyreCompound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN";

/** A lap or sector against the field: purple (session best), green (own best) or neither. */
export type LapMark = "fastest" | "personal" | "none";

/** One mini-sector light, as the timing screens colour them. */
export type SegmentMark = "fastest" | "personal" | "slower" | "pit" | "none";

export interface LiveTyre {
  compound: TyreCompound;
  /** Fitted new, not a used set. */
  fresh: boolean;
  /** Laps run on this set (including any before it was fitted). */
  laps: number;
}

export interface LiveSector {
  value: string;
  mark: LapMark;
  segments: SegmentMark[];
}

export interface LiveRow {
  position: number;
  number: string;
  code: string;
  name: string;
  team: string;
  /** "#00D7B6" — the team's colour from the feed. */
  colour: string;
  /** Race: to the leader; practice and qualifying: to the fastest lap. */
  gap: string;
  /** To the car ahead. */
  interval: string;
  /** Closing on the car ahead (races). */
  catching: boolean;
  last: string;
  lastMark: LapMark;
  best: string;
  /** Holds the session's fastest lap. */
  bestFastest: boolean;
  laps: number;
  stops: number;
  inPit: boolean;
  pitOut: boolean;
  /** Retired or stopped. */
  out: boolean;
  /** Eliminated in an earlier part of qualifying. */
  knockedOut: boolean;
  tyre: LiveTyre | null;
  sectors: LiveSector[];
}

export type TrackTone = "green" | "yellow" | "sc" | "vsc" | "red";

export interface LiveRaceControl {
  utc: string;
  lap: number | null;
  category: string;
  flag: string | null;
  message: string;
}

export interface LiveRadio {
  utc: string;
  number: string;
  code: string;
  colour: string;
  url: string;
}

export interface LiveStints {
  number: string;
  code: string;
  colour: string;
  stints: { compound: TyreCompound; laps: number; fresh: boolean }[];
}

export interface LivePrediction {
  drivers: { code: string; colour: string; position: number; predicted: number; points: number; predictedPoints: number }[];
  teams: { name: string; colour: string; position: number; predicted: number; points: number; predictedPoints: number }[];
}

export interface LiveSnapshot {
  /** When the feed was read. */
  at: string;
  /** When the server answered (the read may be a few seconds older). */
  servedAt?: string;
  /** Browser time (ms) the read corresponds to — set on arrival, so motion never trusts two clocks agreeing. */
  localAt?: number;
  sessionKey: number;
  /** F1's circuit key (the track map's key, /api/f1/track). */
  circuitKey: number | null;
  /** F1's archive folder for this session ("2026/2026-10-11_…/2026-10-10_Qualifying/"). */
  path: string | null;
  /** A typical lap split into its three sectors, in seconds (places mini-sectors on the map). */
  sectorRef: [number, number, number] | null;
  meeting: string;
  location: string;
  /** "Practice 2", "Sprint Qualifying", "Race". */
  session: string;
  type: "Practice" | "Qualifying" | "Race";
  /** Started, Finished, Finalised, Aborted, Inactive… */
  status: string;
  /** The session is running now (false once the flag has fallen). */
  running: boolean;
  /** Qualifying part (1–3) and its label ("Q3", "SQ2"). */
  part: number | null;
  partLabel: string | null;
  /** In a qualifying part, positions below this one drop out. */
  cutoff: number | null;
  track: { tone: TrackTone; label: string };
  lap: { current: number; total: number } | null;
  /** Time left on the session clock at `clockAt`, and whether it is running. */
  remaining: string | null;
  clockAt: string | null;
  clockRunning: boolean;
  weather: { air: number; track: number; humidity: number; wind: number; rain: boolean } | null;
  rows: LiveRow[];
  /** The full read only (the /f1/live page). */
  raceControl?: LiveRaceControl[];
  radio?: LiveRadio[];
  stints?: LiveStints[];
  prediction?: LivePrediction | null;
  /** Portraits by timing code. */
  photos?: Record<string, string>;
  /** Races: each driver's position at the end of every lap. */
  lapPositions?: { code: string; colour: string; positions: number[] }[];
  /** Team radio transcripts, by clip address (filled in as they are written). */
  transcripts?: Record<string, string>;
}

/** What /api/f1/live answers. */
export type LiveAnswer =
  | { live: false; next: string | null; last?: LiveSnapshot | null }
  | { live: true; snapshot: LiveSnapshot };

/** A circuit as a vector, in a box of `width` × `height` (lib/live/f1-track.ts). */
export interface TrackModel {
  circuitKey: number;
  year: number;
  name: string;
  width: number;
  height: number;
  /** The outline as an SVG path, starting at the line, in racing direction. */
  path: string;
  points: [number, number][];
  /** For each point, how far through a reference lap (0–1) a car is there. */
  fraction: number[];
  corners: { number: number; x: number; y: number }[];
  /** The reference lap's time, in seconds. */
  lapTime: number | null;
  /** Time lost to a pit stop under green, in seconds. */
  pitLoss: number | null;
  /** Where sectors 1 and 2 end, as shares of a lap (remembered from sessions run here). */
  sectors?: [number, number] | null;
}
