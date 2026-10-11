import type { LiveRaceControl } from "./f1-live-types";

// Where each driver stands with the stewards, read from race control in the
// order it was sent:
//
//   "INCIDENT INVOLVING CAR 44 (HAM) NOTED - SAFETY CAR INFRINGEMENT"
//   "FIA STEWARDS: INCIDENT INVOLVING CAR 44 (HAM) UNDER INVESTIGATION - …"
//   "FIA STEWARDS: … WILL BE INVESTIGATED AFTER THE RACE - …"
//   "FIA STEWARDS: … NO FURTHER ACTION - …"            clears that incident
//   "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 10 (GAS) - …"
//   "FIA STEWARDS: PENALTY SERVED - 5 SECOND TIME PENALTY FOR CAR 44 (HAM) - …"
//   "BLACK AND WHITE FLAG FOR CAR 44 (HAM) - TRACK LIMITS"
//   "CAR 41 (LIN) TIME 1:18.393 DELETED - TRACK LIMITS AT TURN 10 …"
//
// An incident is one reason (the text after the dash, without its clock
// time), so a driver can be under investigation for one thing and cleared of
// another; a penalty for a reason closes its investigation.

export type IncidentState = "noted" | "investigating" | "after";

export interface Stewards {
  /** Penalties not yet served: "+5s", "+10s", "DT" (drive-through), "SG" (stop-and-go), "Grid". */
  penalties: { label: string; why: string }[];
  /** Open incidents, most serious first. */
  incidents: { state: IncidentState; why: string }[];
  /** The black-and-white flag (a warning), with what for. */
  blackWhite: string | null;
  /** Laps or times deleted for track limits. */
  trackLimits: number;
}

const RANK: Record<IncidentState, number> = { investigating: 0, after: 1, noted: 2 };

/** What the message is about: the text after the first " - ", without a trailing clock time. */
function reasonOf(msg: string): string {
  const i = msg.indexOf(" - ");
  return (i >= 0 ? msg.slice(i + 3) : "").replace(/\s*\(\d{1,2}:\d{2}:\d{2}\)\s*$/, "").trim();
}

const nice = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function penaltyOf(msg: string): string | null {
  const t = /(\d+) SECOND (?:TIME )?PENALTY/.exec(msg);
  if (t) return `+${t[1]}s`;
  if (/DRIVE THROUGH PENALTY/.test(msg)) return "DT";
  if (/STOP AND GO PENALTY|STOP\/GO PENALTY|10 SECOND STOP/.test(msg)) return "SG";
  if (/GRID (?:PLACE )?PENALTY|DROP OF \d+ GRID/.test(msg)) return "Grid";
  return null;
}

/** Race control up to `upToLap` (a replay holds the session's later messages too). */
export function stewardsByCode(rc: LiveRaceControl[] | undefined, upToLap?: number | null): Map<string, Stewards> {
  const out = new Map<string, Stewards>();
  const open = new Map<string, Map<string, IncidentState>>();
  const get = (code: string) => {
    let s = out.get(code);
    if (!s) {
      s = { penalties: [], incidents: [], blackWhite: null, trackLimits: 0 };
      out.set(code, s);
    }
    return s;
  };
  const messages = [...(rc ?? [])].filter((m) => !upToLap || m.lap === null || m.lap <= upToLap).sort((a, b) => a.utc.localeCompare(b.utc));
  for (const m of messages) {
    const msg = m.message.toUpperCase();
    if (m.flag === "BLUE" || /BLUE FLAG/.test(msg)) continue;
    const codes = [...msg.matchAll(/\b\d{1,2} \(([A-Z]{3})\)/g)].map((x) => x[1]);
    if (!codes.length) continue;
    const why = reasonOf(msg);
    for (const code of codes) {
      const s = get(code);
      const mine = open.get(code) ?? new Map<string, IncidentState>();
      open.set(code, mine);
      if (m.flag === "BLACK AND WHITE" || /BLACK AND WHITE FLAG/.test(msg)) {
        s.blackWhite = nice(why || "Warning");
      } else if (/DELETED/.test(msg) && /TRACK LIMITS/.test(msg)) {
        s.trackLimits++;
      } else if (/PENALTY SERVED/.test(msg)) {
        const label = penaltyOf(msg);
        const i = s.penalties.findIndex((p) => p.label === label);
        if (i >= 0) s.penalties.splice(i, 1);
      } else if (penaltyOf(msg) && /PENALTY|GRID/.test(msg) && !/UNDER INVESTIGATION|NOTED|INVESTIGATED|NO FURTHER/.test(msg)) {
        // A time penalty not served correctly becomes this one: it replaces it.
        if (/FAILING TO SERVE/.test(msg)) {
          const i = s.penalties.findIndex((p) => /^\+\d+s$/.test(p.label));
          if (i >= 0) s.penalties.splice(i, 1);
        }
        s.penalties.push({ label: penaltyOf(msg)!, why: nice(why) });
        mine.delete(why);
      } else if (/NO FURTHER ACTION|NO FURTHER INVESTIGATION|NO INVESTIGATION NECESSARY|REVIEWED|NO ACTION/.test(msg)) {
        mine.delete(why);
      } else if (/WILL BE INVESTIGATED AFTER THE (RACE|SESSION)/.test(msg)) {
        mine.set(why, "after");
      } else if (/UNDER INVESTIGATION/.test(msg)) {
        mine.set(why, "investigating");
      } else if (/\bNOTED\b/.test(msg) && !mine.has(why)) {
        mine.set(why, "noted");
      }
    }
  }
  // Time penalties add up: two +5s read as +10s (each reason kept).
  for (const s of out.values()) {
    const time = s.penalties.filter((p) => /^\+\d+s$/.test(p.label));
    if (time.length > 1) {
      const total = time.reduce((n, p) => n + Number(p.label.slice(1, -1)), 0);
      s.penalties = [{ label: `+${total}s`, why: time.map((p) => `${p.label} ${p.why.toLowerCase()}`).join("; ") }, ...s.penalties.filter((p) => !time.includes(p))];
    }
  }
  for (const [code, mine] of open) {
    const s = get(code);
    s.incidents = [...mine].map(([why, state]) => ({ state, why: nice(why) })).sort((a, b) => RANK[a.state] - RANK[b.state]);
  }
  for (const [code, s] of out) if (!s.penalties.length && !s.incidents.length && !s.blackWhite && !s.trackLimits) out.delete(code);
  return out;
}
