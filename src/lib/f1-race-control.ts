import type { LiveRaceControl } from "./f1-live-types";

// Race control, read for people. The feed shouts in capitals and in the
// stewards' own grammar ("CAR 87 (BEA) TIME 1:42.615 DELETED - TRACK LIMITS
// AT TURN 6 LAP 55 18:19:37"); the paper says it plainly ("BEA: lap 55
// deleted (1:42.615), track limits at turn 6"), files each message under
// flags, stewards, track limits or information, folds a yellow and its
// all-clear into one line, and follows each incident from "noted" to the
// decision — the stewards' open and decided cases, and the laps each driver
// has had deleted (the third for track limits brings the black and white
// flag, the next a penalty).

export type RcKind = "flags" | "stewards" | "limits" | "info";
export type RcTone = "yellow" | "red" | "green" | "sc" | "blue" | "chequered" | "bw" | "stewards" | "penalty" | "limits" | "info";

export interface RcItem {
  utc: string;
  lap: number | null;
  kind: RcKind;
  tone: RcTone;
  text: string;
  /** Timing codes the message is about. */
  drivers: string[];
  /** A yellow's all-clear, when it came. */
  cleared?: string;
  /** Noise worth hiding from "All" (blue flags). */
  minor?: boolean;
}

const lower = (s: string) => s.toLowerCase().replace(/ - /g, ", ").replace(/track sector/g, "sector").replace(/\bdrs\b/g, "DRS").replace(/\bvsc\b/g, "VSC").replace(/\bfia\b/g, "FIA").replace(/race directors/g, "race director's");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const codes = (s: string) => [...s.matchAll(/\((\w{3})\)/g)].map((m) => m[1]);
const and = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const stamp = /\s*\(\d{1,2}:\d{2}(?::\d{2})?\)\s*$/;

const STATUS: [RegExp, string][] = [
  [/^NOTED$/, "noted"],
  [/^UNDER INVESTIGATION$/, "under investigation"],
  [/^WILL BE INVESTIGATED AFTER THE (RACE|SESSION|SPRINT)$/, "to be investigated after the $1"],
  [/^REVIEWED NO FURTHER (INVESTIGATION|ACTION)$/, "reviewed, no further action"],
  [/^NO FURTHER (ACTION|INVESTIGATION)$/, "no further action"],
];
const status = (s: string) => {
  for (const [re, out] of STATUS) if (re.test(s)) return s.replace(re, out).toLowerCase();
  return s.toLowerCase();
};

const INCIDENT =
  /^(FIA STEWARDS: )?(?:(.+?) )?INCIDENT INVOLVING CARS? (.+?) (NOTED|UNDER INVESTIGATION|WILL BE INVESTIGATED AFTER THE (?:RACE|SESSION|SPRINT)|REVIEWED NO FURTHER (?:INVESTIGATION|ACTION)|NO FURTHER (?:ACTION|INVESTIGATION)) - (.+)$/;
const PENALTY = /^FIA STEWARDS: (PENALTY SERVED - )?(.+?(?:PENALTY|REPRIMAND|WARNING|DISQUALIFIED|DISQUALIFICATION)) (?:FOR|TO) CARS? \d+ \((\w{3})\)(?: - (.+))?$/;
const DELETED = /^CAR \d+ \((\w{3})\) (?:TIME ([\d:.]+) DELETED|LAP DELETED) - (.+?) AT TURN (\d+) LAP (\d+)/;
const BLUE = /^WAVED BLUE FLAG FOR CAR \d+ \((\w{3})\)/;
const BW = /^BLACK AND WHITE FLAG FOR CAR \d+ \((\w{3})\)(?: - (.+))?$/;
const SECTOR = /^(DOUBLE YELLOW|YELLOW|CLEAR) IN TRACK SECTOR (\d+)$/;

function read(m: LiveRaceControl, numbers: Map<string, string>): RcItem {
  const raw = m.message.trim().replace(stamp, "");
  const base = { utc: m.utc, lap: m.lap };
  let x: RegExpExecArray | null;

  if ((x = DELETED.exec(raw))) {
    const [, code, time, why, turn, lap] = x;
    return { ...base, kind: "limits", tone: "limits", drivers: [code], text: `${code}: lap ${lap} deleted${time ? ` (${time})` : ""}, ${lower(why)} at turn ${turn}` };
  }
  if ((x = INCIDENT.exec(raw))) {
    const [, , where, cars, st, why] = x;
    const ds = codes(cars);
    return { ...base, kind: "stewards", tone: "stewards", drivers: ds, text: `${and(ds)}${where ? `, ${lower(where)}` : ""}, ${lower(why)}: ${status(st)}` };
  }
  if ((x = PENALTY.exec(raw))) {
    const [, served, what, code, why] = x;
    return { ...base, kind: "stewards", tone: "penalty", drivers: [code], text: `${code}: ${lower(what)}${served ? " served" : ""}${why ? `, ${lower(why)}` : ""}` };
  }
  if ((x = BW.exec(raw))) {
    const [, code, why] = x;
    return { ...base, kind: why && /TRACK LIMITS/.test(why) ? "limits" : "stewards", tone: "bw", drivers: [code], text: `${code}: black and white flag${why ? `, ${lower(why)}` : ""}` };
  }
  if ((x = BLUE.exec(raw))) return { ...base, kind: "flags", tone: "blue", drivers: [x[1]], text: `${x[1]}: blue flag`, minor: true };
  if ((x = SECTOR.exec(raw))) {
    const [, what, sector] = x;
    return { ...base, kind: "flags", tone: what === "CLEAR" ? "green" : "yellow", drivers: [], text: `${what === "CLEAR" ? "Clear" : what === "YELLOW" ? "Yellow" : "Double yellow"} in sector ${sector}` };
  }
  if ((x = /^FIRST CAR TO TAKE THE FLAG - CAR \d+ \((\w{3})\)/.exec(raw))) return { ...base, kind: "info", tone: "chequered", drivers: [x[1]], text: `First to take the flag: ${x[1]}` };
  if ((x = /^LAPPED CARS MAY NOW OVERTAKE THE SAFETY CAR: (.+)$/.exec(raw))) {
    const ds = x[1].split(/,\s*/).map((n) => numbers.get(n.trim()) ?? n.trim());
    return { ...base, kind: "flags", tone: "sc", drivers: ds, text: `Lapped cars may now pass the safety car: ${and(ds)}` };
  }

  const f = (m.flag ?? "").toUpperCase();
  const flagTone: RcTone | null =
    f === "CHEQUERED" ? "chequered" : f === "RED" ? "red" : f.includes("YELLOW") ? "yellow" : f === "GREEN" || f === "CLEAR" ? "green" : f === "BLUE" ? "blue" : f.includes("BLACK") ? "bw" : null;
  const sc = /SafetyCar/i.test(m.category) || /^(VSC|SAFETY CAR) /.test(raw);
  const kind: RcKind = m.category === "Flag" || sc ? "flags" : /STEWARDS|PENALTY|REPRIMAND|INVESTIGAT/.test(raw) ? "stewards" : "info";
  const tone: RcTone = flagTone ?? (sc ? "sc" : kind === "stewards" ? "stewards" : "info");
  const text = cap(lower(raw).replace(/ - /g, ", ").replace(/\((\w{3})\)/g, (_, c: string) => `(${c.toUpperCase()})`));
  return { ...base, kind, tone, drivers: codes(raw), text };
}

/** Every message, newest first, read plainly; a yellow carries its all-clear. */
export function readRaceControl(items: LiveRaceControl[], numbers: Map<string, string> = new Map()): RcItem[] {
  const read_ = items.map((m) => read(m, numbers));
  // Oldest first, to fold each sector's clear into the yellow before it.
  const out: RcItem[] = [];
  const open = new Map<string, RcItem>();
  for (const it of [...read_].reverse()) {
    const sector = /in sector (\d+)$/.exec(it.text)?.[1];
    if (sector && it.tone === "green") {
      const y = open.get(sector);
      if (y) {
        y.cleared = it.utc;
        open.delete(sector);
        continue;
      }
    }
    if (sector && it.tone === "yellow") {
      // A double yellow after a yellow in the same sector: the newer one stands.
      open.set(sector, it);
    }
    out.push(it);
  }
  return out.reverse();
}

// ---- the stewards ---------------------------------------------------------------

export interface StewardsCase {
  drivers: string[];
  /** "Turn 5", "Q2", or null. */
  where: string | null;
  reason: string;
  /** The latest word on it. */
  status: string;
  decided: boolean;
  /** A penalty, when that was the decision (and whether it's been served). */
  penalty: string | null;
  served: boolean;
  utc: string;
}

/** Each incident followed from "noted" to the decision, newest first. */
export function stewardsCases(items: LiveRaceControl[]): StewardsCase[] {
  const cases = new Map<string, StewardsCase>();
  for (const m of [...items].reverse()) {
    const raw = m.message.trim().replace(stamp, "");
    let x: RegExpExecArray | null;
    if ((x = INCIDENT.exec(raw))) {
      const [, , where, cars, st, why] = x;
      const ds = codes(cars);
      const key = `${[...ds].sort().join(",")}|${lower(why)}`;
      const c = cases.get(key) ?? { drivers: ds, where: where ? cap(lower(where)) : null, reason: lower(why), status: "", decided: false, penalty: null, served: false, utc: m.utc };
      c.status = status(st);
      c.decided = /no further/.test(c.status);
      c.utc = m.utc;
      cases.set(key, c);
    } else if ((x = PENALTY.exec(raw))) {
      const [, served, what, code, why] = x;
      const reason = why ? lower(why) : "";
      const found = [...cases.entries()].find(([, c]) => c.drivers.includes(code) && (!reason || c.reason === reason));
      const c = found?.[1] ?? { drivers: [code], where: null, reason, status: "", decided: true, penalty: null, served: false, utc: m.utc };
      c.penalty = lower(what);
      c.decided = true;
      c.served = c.served || Boolean(served);
      c.status = c.served ? `${c.penalty}, served` : c.penalty;
      c.utc = m.utc;
      cases.set(found?.[0] ?? `${code}|${reason}|${m.utc}`, c);
    }
  }
  return [...cases.values()].sort((a, b) => b.utc.localeCompare(a.utc));
}

export interface Deleted {
  code: string;
  /** Laps deleted for track limits (they count towards the black and white flag). */
  limits: number;
  /** Every deletion, newest first ("Track limits, turn 16, lap 16"). */
  laps: string[];
  blackAndWhite: boolean;
}

/** Laps each driver has had deleted, most first. */
export function deletedLaps(items: LiveRaceControl[]): Deleted[] {
  const by = new Map<string, Deleted>();
  for (const m of items) {
    const raw = m.message.trim();
    const x = DELETED.exec(raw);
    const bw = BW.exec(raw);
    const code = x?.[1] ?? bw?.[1];
    if (!code) continue;
    const d = by.get(code) ?? { code, limits: 0, laps: [], blackAndWhite: false };
    if (x) {
      if (/TRACK LIMITS/.test(x[3])) d.limits++;
      d.laps.push(`${cap(lower(x[3]))}, turn ${x[4]}, lap ${x[5]}`);
    }
    if (bw) d.blackAndWhite = true;
    by.set(code, d);
  }
  return [...by.values()].filter((d) => d.laps.length).sort((a, b) => b.limits - a.limits || b.laps.length - a.laps.length);
}
