import type { LiveSnapshot } from "@/lib/f1-live-types";

// What Gemini is told when it writes up a finished session (lib/live/f1-insights.ts).
// The facts are worked out here, so the model is handed what makes a session
// interesting (who gained most, the margin, what the stewards did) rather than left
// to find it in a table, which is what made its first drafts flat. Practice has no
// result to report, so it gets the long runs and team-mates' gaps. Left to itself it
// then starts inventing motives and causes, so the rules are strict about what it may
// claim, and f1-insights.ts rejects a story whose figures aren't in these facts.

const num = (v: string | null | undefined) => {
  const m = /[\d.]+/.exec(v ?? "");
  return m ? Number(m[0]) : null;
};

/** What stands out in a race, worked out from the classification. */
function raceNotes(snap: LiveSnapshot): string[] {
  const rows = snap.rows;
  const winner = rows[0];
  const notes: string[] = [];
  if (winner?.grid) notes.push(`${winner.name} won from P${winner.grid}.`);
  const pole = rows.find((r) => r.grid === 1);
  if (pole && pole !== winner) notes.push(`${pole.name} started on pole and ${pole.out ? `retired after lap ${pole.laps}` : `finished P${pole.position}`}.`);
  const second = rows[1];
  if (second?.gap) notes.push(`The winning margin over ${second.name} was ${second.gap.replace(/^\+/, "")} s.`);
  const moved = rows.filter((r) => r.grid && !r.out).map((r) => ({ r, by: r.grid! - r.position }));
  const up = [...moved].sort((a, b) => b.by - a.by)[0];
  const down = [...moved].sort((a, b) => a.by - b.by)[0];
  if (up && up.by >= 3) notes.push(`Biggest climb: ${up.r.name}, P${up.r.grid} to P${up.r.position}.`);
  if (down && down.by <= -3) notes.push(`Biggest fall: ${down.r.name}, P${down.r.grid} to P${down.r.position}.`);
  const out = rows.filter((r) => r.out);
  if (out.length) notes.push(`Retired: ${out.map((r) => `${r.name} (after lap ${r.laps})`).join(", ")}.`);
  const fastest = rows.find((r) => r.bestFastest);
  if (fastest?.best) notes.push(`Fastest lap: ${fastest.name}, ${fastest.best}.`);
  return notes;
}

/** "1:15.39" from seconds. */
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

/** Seconds from "1:15.467". */
const seconds = (t: string | null | undefined) => {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t ?? "");
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

const LONG_RUN_LAPS = 8;
const TIMED_LAPS = 4;
/** Wider than this says one of the pair had a problem, or is a stand-in for the day. */
const TEAM_MATE_GAP_S = 1.5;

/** Each car's longest stint with enough timed laps, as far as the kept lap times show one. */
function longRuns(snap: LiveSnapshot) {
  const name = new Map(snap.rows.map((r) => [r.code, r.name]));
  return (snap.stints ?? []).flatMap((car) => {
    const times = snap.lapTimes?.times?.[car.code];
    if (!times) return [];
    let start = 0;
    const stints = car.stints.map((st) => {
      const from = start;
      start += st.laps;
      return { ...st, from };
    });
    const longest = [...stints].sort((a, b) => b.laps - a.laps)[0];
    if (!longest || longest.laps < LONG_RUN_LAPS) return [];
    // A repeated value is one lap read twice. Slow laps are traffic, cool-downs or the pit lane.
    const laps = times.slice(longest.from, longest.from + longest.laps).filter((t, i, all): t is number => t !== null && t !== all[i - 1]);
    const middle = [...laps].sort((a, b) => a - b)[Math.floor(laps.length / 2)];
    const clean = laps.filter((t) => t <= middle * 1.02);
    if (clean.length < TIMED_LAPS) return [];
    return [{ name: name.get(car.code) ?? car.code, compound: longest.compound, count: clean.length, average: clean.reduce((sum, t) => sum + t, 0) / clean.length }];
  });
}

/** Long runs on the tyre most cars ran them on, quickest first: other tyres aren't comparable. */
function longRunNote(snap: LiveSnapshot): string | null {
  const runs = longRuns(snap);
  const counts = new Map<string, number>();
  for (const r of runs) counts.set(r.compound, (counts.get(r.compound) ?? 0) + 1);
  const tyre = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (!tyre || tyre[1] < 3) return null;
  const best = runs.filter((r) => r.compound === tyre[0]).sort((a, b) => a.average - b.average).slice(0, 2);
  const [a, b] = best;
  const margin = b ? ` That is ${(b.average - a.average).toFixed(2)} s a lap quicker than ${b.name}, on ${clock(b.average)}.` : "";
  return `Best long run on the ${tyre[0].toLowerCase()} tyre, of ${tyre[1]} cars: ${a.name}, averaging ${clock(a.average)} over ${a.count} timed laps.${margin}`;
}

/** The widest gap between two team-mates' best laps. */
function teamMateNote(snap: LiveSnapshot): string | null {
  const teams = new Map<string, LiveSnapshot["rows"]>();
  for (const r of snap.rows) teams.set(r.team, [...(teams.get(r.team) ?? []), r]);
  const gaps = [...teams.values()].flatMap((pair) => {
    const [a, b] = pair;
    const [ta, tb] = [seconds(a?.best), seconds(b?.best)];
    return pair.length === 2 && ta !== null && tb !== null ? [{ quick: ta <= tb ? a : b, slow: ta <= tb ? b : a, by: Math.abs(ta - tb) }] : [];
  });
  const widest = gaps.filter((g) => g.by <= TEAM_MATE_GAP_S).sort((a, b) => b.by - a.by)[0];
  return widest ? `Widest gap between team-mates: ${widest.quick.name} ${widest.by.toFixed(3)} s quicker than ${widest.slow.name}.` : null;
}

/** What stands out in practice or qualifying. */
function timedNotes(snap: LiveSnapshot): string[] {
  const rows = snap.rows;
  const notes: string[] = [];
  const first = rows[0];
  const second = rows[1];
  if (first?.best) notes.push(`${first.name} set the pace with ${first.best}.`);
  if (second?.gap) notes.push(`${second.name} was ${second.gap.replace(/^\+/, "")} s behind.`);
  if (snap.type === "Qualifying") {
    const third = rows[2];
    if (third?.gap) notes.push(`${third.name} was ${third.gap.replace(/^\+/, "")} s behind in third.`);
    const out = rows.filter((r) => r.knockedOut);
    if (out[0]) notes.push(`${out.length} drivers missed the last part, the highest placed ${out[0].name} in P${out[0].position}.`);
  }
  if (snap.type === "Practice") {
    const runs = longRunNote(snap);
    if (runs) notes.push(runs);
  }
  // Practice 1 is when teams run their rookies, so its gaps say little.
  const mates = snap.session === "Practice 1" ? null : teamMateNote(snap);
  if (mates) notes.push(mates);
  return notes;
}

function titleNote(snap: LiveSnapshot): string | null {
  const drivers = [...(snap.prediction?.drivers ?? [])].sort((a, b) => a.predicted - b.predicted);
  if (drivers.length < 2) return null;
  const [a, b] = drivers;
  const points = (d: (typeof drivers)[number]) => d.predictedPoints ?? d.points;
  return `Championship after this session: ${a.code} leads ${b.code} by ${Math.round(points(a) - points(b))} points.`;
}

const iso = (utc: string) => (/Z|[+-]\d{2}:?\d{2}$/.test(utc) ? utc : `${utc}Z`);

export function sessionFacts(snap: LiveSnapshot, radio: string[] = []): string {
  const race = snap.type === "Race";
  const rows = snap.rows
    .map((r) =>
      race
        ? `P${r.position} ${r.name} (${r.team}), started ${r.grid ? `P${r.grid}` : "unknown"}, ${r.out ? `out after lap ${r.laps}` : r.position === 1 ? "winner" : `${r.gap} behind`}, ${r.stops} stops`
        : `P${r.position} ${r.name} (${r.team}), best ${r.best || "none"}, ${r.gap || "fastest"}, ${r.laps} laps${r.knockedOut ? ", knocked out" : ""}`,
    )
    .join("\n");
  const said = [...(snap.raceControl ?? [])]
    .sort((a, b) => Date.parse(iso(a.utc)) - Date.parse(iso(b.utc)))
    .filter((m) => /SAFETY CAR|RED FLAG|TIME PENALTY|VSC|DISQUAL|BLACK AND/i.test(m.message))
    .map((m) => `${m.lap ? `lap ${m.lap}` : "no lap"}: ${m.message}`)
    .slice(0, 40)
    .join("\n");
  const notes = [...(race ? raceNotes(snap) : timedNotes(snap)), titleNote(snap)].filter(Boolean).join("\n");
  return [
    `What stands out:\n${notes}`,
    `Classification:\n${rows}`,
    said ? `Race control:\n${said}` : "",
    radio.length ? `Team radio, as heard (context only, don't quote it):\n${radio.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function recapPrompt(snap: LiveSnapshot, radio: string[] = []): string {
  const race = snap.type === "Race";
  const practice = snap.type === "Practice";
  return `You are the Formula 1 writer on a sharp daily newspaper. Write up the ${snap.session} at the ${snap.meeting} for a reader who follows the sport closely and didn't see it.

${sessionFacts(snap, radio)}

Rules:
- Every claim must be checkable against these facts. Never say why something happened, what anyone tried, chose or intended, or that a strategy worked, unless the facts say so. Link two facts with "after" or "despite" only if the facts link them. No words like "tried to", "thanks to", "held firm", "dominant", "crushes", "surged" or "charge", which claim more than a result shows.
- The energy comes from choosing the right fact and putting it first: the climb, the margin, the penalty. Plain, confident English. Vary your sentences. Use surnames.
- Name at most four drivers in the story, one fact each. Never run several names together in a list: give the count instead, or the one that matters.
- Say what happened, not what the session contained. Don't write "featured", "saw", "secured victory", "took the win", "conquer", "it was a race of", "chaos", "chaotic", "drama", "showcase", "afternoon" or how many laps the race ran. Don't restate the headline.
- For rhythm only, these are not facts: "Senna gained eight places, more than anyone, and finished 4.2 s behind Prost. The only safety car came on lap 31. Berger, fifth on the grid, retired after lap 12, which leaves Prost 14 points clear."

Write:
- headline: at most 9 words, present tense, in a newspaper's voice, with a strong verb and the thing that made this session different from any other: a climb through the field, a title settled, a margin, a costly penalty. Not just who won and where.${practice ? " In practice, lead on the pace or the best long run, not on team-mates." : ""}
  Good: "Verstappen climbs from fifth to beat Hamilton by eight tenths". Bad: "Verstappen wins Mexico City Grand Prix".
- story: ${practice ? "2 or 3" : "3 or 4"} sentences, past tense. Open on the decisive fact and the number that proves it, then what shaped the ${race ? "race" : "session"}${practice ? ": the best long run and its margin if the facts give them, a red flag, the gap between team-mates. Don't list times one after another, walk down the timesheet or name a driver only for where they finished. Copy times exactly as given. Nobody knows the fuel loads, so don't say a long run shows who is faster on Sunday. Stop when the facts worth telling run out." : ", then the one thing beyond the top three a follower would want to know."}
- turns: ${race ? 'the 3 to 5 moments that changed the race, in lap order, each at most 6 plain words, using only laps stated above. kind is what the moment was: "safety-car" for a safety car or virtual safety car, "red-flag" only for a red flag. Name each once and leave out the lap number, as "Safety car bunches the field", not "deployed and ending". Never list the start or the chequered flag.' : "an empty list."}`;
}

export function momentsPrompt(snap: LiveSnapshot, list: string): string {
  return `These are team radio transcripts from the ${snap.session} at the ${snap.meeting}. You pick what a follower of the sport would most want to hear.

${sessionFacts(snap)}

Transcripts:
${list}

Pick the 3 to 5 most revealing: a decision, damage, a dispute, a strategy call, a driver's frustration, or the championship. Prefer different drivers. At most one may be a message after the flag, and only if it's about more than the finishing place. Skip routine congratulations, and skip any transcript that doesn't read as clear English or makes no sense on its own.

For each pick:
- i: its number
- quote: the most telling short line from that transcript, copied word for word, at most 14 words, without its speaker label
- why: at most 9 plain words giving the one fact the quote doesn't: "Retired six laps later", "Five-second penalty followed on lap 12", "Gained four places from the grid". Only from the facts above. Never diagnose or interpret ("severe mechanical issues", "contentious"), never repeat the quote, and never just give the finishing place. When no such fact exists, leave it empty.`;
}
