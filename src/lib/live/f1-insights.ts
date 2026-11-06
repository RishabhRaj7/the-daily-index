import { Type } from "@google/genai";
import type { LiveRaceControl, LiveSnapshot } from "@/lib/f1-live-types";
import { getStore } from "@/lib/server/store";
import { latestRaceSession, lastSession, pastSession } from "./f1-live";
import { cachedTranscripts, f1Json } from "./f1-radio";

// What a finished session comes to, written from what's already held: its
// classification, race control and radio transcripts. Two pieces, both on radio's
// own Gemini key (f1Json), written once and kept:
//   the recap     a headline, a few sentences, and for a race the turning points by
//                 lap. The lap bar's flag stretches come from race control itself
//   the moments   the three to five radio clips that mattered. The quote must be
//                 the transcript's own words, or the clip is dropped
// The model may only use the facts it's given. Whatever it can't do, nothing shows.

const KEEP_S = 400 * 86_400;
// One attempt at a time, and a pause after one that fails: a busy minute on the
// radio models shouldn't hold a session's write-up back for long.
const RETRY_S = 5 * 60;
const MIN_TRANSCRIPTS = 4;
/** More transcripts than this since the moments were chosen: choose again. */
const NEW_CLIPS = 5;

export type TurnKind = "safety-car" | "red-flag" | "penalty" | "lead" | "retirement";
export type BandKind = "vsc" | "sc" | "red";

export interface SessionRecap {
  meeting: string;
  session: string;
  end: string;
  path: string;
  headline: string;
  story: string;
  /** Races: the turning points, in order. */
  turns: { lap: number; kind: TurnKind; text: string }[];
  /** Races: the laps under a flag, for the bar. */
  bands: { kind: BandKind; from: number; to: number }[];
  /** Races: the distance. */
  laps: number | null;
}

export interface RadioMoment {
  url: string;
  code: string;
  name: string;
  colour: string;
  lap: number | null;
  quote: string;
  why: string;
}

export interface Insights {
  recap: SessionRecap | null;
  moments: RadioMoment[];
}

/** F1's clock is UTC, though its race control times don't always say so. */
const whenUtc = (utc: string) => Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(utc) ? utc : `${utc}Z`) || 0;
const oldestFirst = (rc: LiveRaceControl[] | undefined) => [...(rc ?? [])].sort((a, b) => whenUtc(a.utc) - whenUtc(b.utc));

/** The laps spent under each kind of flag, from race control. */
function flagBands(snap: LiveSnapshot): SessionRecap["bands"] {
  const total = snap.lap?.total ?? 0;
  if (!total) return [];
  const out: SessionRecap["bands"] = [];
  let open: { kind: BandKind; from: number } | null = null;
  const close = (lap: number | null) => {
    if (open) out.push({ ...open, to: Math.max(open.from, lap ?? open.from + 1) });
    open = null;
  };
  for (const m of oldestFirst(snap.raceControl)) {
    const s = m.message.toUpperCase();
    if (/^VIRTUAL SAFETY CAR DEPLOYED|^VSC DEPLOYED/.test(s)) {
      close(m.lap);
      if (m.lap) open = { kind: "vsc", from: m.lap };
    } else if (/VIRTUAL SAFETY CAR ENDING|VSC ENDING/.test(s)) close(m.lap);
    else if (/^SAFETY CAR DEPLOYED/.test(s)) {
      close(m.lap);
      if (m.lap) open = { kind: "sc", from: m.lap };
    } else if (/SAFETY CAR IN THIS LAP/.test(s)) close(m.lap);
    else if (/^RED FLAG/.test(s)) {
      close(m.lap);
      if (m.lap) open = { kind: "red", from: m.lap };
    } else if (/RESTART|TRACK CLEAR/.test(s) && (open as { kind: BandKind } | null)?.kind === "red") close(m.lap);
  }
  close(total);
  return out;
}

const plain = (t: string) => t.replace(/\{\{|\}\}/g, "").replace(/\s+/g, " ").trim();

/** Who was who at the end, and what race control said that mattered. */
function factsOf(snap: LiveSnapshot): string {
  const race = snap.type === "Race";
  const rows = snap.rows
    .map((r) => (race ? `P${r.position} ${r.name} (${r.team}), started ${r.grid ? `P${r.grid}` : "unknown"}, ${r.out ? `out after lap ${r.laps}` : r.position === 1 ? "winner" : `${r.gap} behind`}, ${r.stops} stops` : `P${r.position} ${r.name} (${r.team}), best ${r.best || "none"}, ${r.gap || "fastest"}, ${r.laps} laps${r.knockedOut ? ", knocked out" : ""}`))
    .join("\n");
  const said = oldestFirst(snap.raceControl)
    .filter((m) => /SAFETY CAR|RED FLAG|PENALTY|VSC|DISQUAL|BLACK AND/i.test(m.message))
    .map((m) => `${m.lap ? `lap ${m.lap}` : "no lap"}: ${m.message}`)
    .slice(0, 40)
    .join("\n");
  const title = snap.prediction?.drivers?.length
    ? `Championship after this session: ${[...snap.prediction.drivers].sort((a, b) => a.predicted - b.predicted).slice(0, 3).map((d) => d.code).join(", ")} lead, in that order.`
    : "";
  return [`Classification:\n${rows}`, said ? `Race control:\n${said}` : "", title].filter(Boolean).join("\n\n");
}

const RECAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    story: { type: Type.STRING },
    turns: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { lap: { type: Type.INTEGER }, kind: { type: Type.STRING, enum: ["safety-car", "red-flag", "penalty", "lead", "retirement"] }, text: { type: Type.STRING } },
        required: ["lap", "kind", "text"],
      },
    },
  },
  required: ["headline", "story", "turns"],
};

async function writeRecap(snap: LiveSnapshot): Promise<SessionRecap | null> {
  const race = snap.type === "Race";
  const text = await f1Json(
    `You write for a newspaper's Formula 1 page. Here are the facts of the ${snap.session} at the ${snap.meeting}. Use ONLY these facts. Don't invent causes, feelings, tactics or anything not stated, and don't mention a source of the facts.

${factsOf(snap)}

Write:
- headline: at most 9 words, leading with what made this session different: a comeback, a penalty that changed the result, a championship settled. Not just "X wins Y". Never vague words like "chaos" or "drama".
- story: 3 or 4 short plain sentences, in the past tense. Lead with the result and the gaps, then what shaped it (penalties, stoppages, stops, places gained or lost). Don't repeat the headline, and leave out facts that don't matter.
- turns: ${race ? 'the 3 to 5 moments that changed the race, in lap order, each at most 6 plain words, using only laps stated above. kind is what the moment was: "safety-car" for a safety car or virtual safety car, "red-flag" only for a red flag. Name each once and leave out the lap number, as "Safety car after a crash", not "deployed and ending". Never list the start or the chequered flag.' : "an empty list."}`,
    RECAP_SCHEMA,
  );
  if (!text) return null;
  const out = JSON.parse(text) as { headline?: string; story?: string; turns?: { lap?: number; kind?: TurnKind; text?: string }[] };
  const headline = plain(out.headline ?? "");
  const story = plain(out.story ?? "");
  if (headline.length < 8 || headline.length > 90 || story.length < 40 || story.length > 900) return null;
  const total = snap.lap?.total ?? 0;
  const turns = race
    ? (out.turns ?? [])
        .filter((t) => t.lap && t.lap >= 1 && t.lap <= total && plain(t.text ?? "").length >= 3 && !/chequered/i.test(t.text ?? ""))
        .map((t) => ({ lap: t.lap!, kind: t.kind === "red-flag" && !/red flag/i.test(t.text ?? "") ? ("lead" as const) : (t.kind ?? "lead"), text: plain(t.text!).replace(/\s+on lap \d+\.?$/i, "") }))
        .sort((a, b) => a.lap - b.lap)
        .slice(0, 5)
    : [];
  // The day it ran, from its archive path: `at` is only when this copy was read.
  const end = /(\d{4}-\d{2}-\d{2})_[^/]*\/?$/.exec(snap.path ?? "")?.[1] ?? snap.at;
  return { meeting: snap.meeting, session: snap.session, end, path: snap.path ?? "", headline, story, turns, bands: race ? flagBands(snap) : [], laps: race ? total || null : null };
}

/** A copy from F1's archive can stop short of the flag, and a story of part of a race would mislead. */
const cutShort = (snap: LiveSnapshot) => snap.type === "Race" && !!snap.lap && snap.lap.current < snap.lap.total && snap.status !== "Finalised" && snap.status !== "Finished";

async function recapFor(snap: LiveSnapshot): Promise<SessionRecap | null> {
  const store = getStore();
  const key = `f1:recap:v1:${snap.sessionKey}`;
  const kept = await store.get<SessionRecap>(key).catch(() => null);
  if (kept) return kept;
  if (cutShort(snap)) return null;
  if (!(await store.setIfAbsent(`${key}:try`, 1, RETRY_S).catch(() => false))) return null;
  const made = await writeRecap(snap).catch((err) => {
    console.error("[f1/insights] recap failed:", err instanceof Error ? err.message.slice(0, 200) : err);
    return null;
  });
  if (made) await store.set(key, made, { ttlSeconds: KEEP_S }).catch(() => {});
  return made;
}

const MOMENTS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    picks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { i: { type: Type.INTEGER }, quote: { type: Type.STRING }, why: { type: Type.STRING } },
        required: ["i", "quote", "why"],
      },
    },
  },
  required: ["picks"],
};

const words = (t: string) => plain(t).replace(/\b(Engineer|Unsure|[A-Z]{3}):\s*/g, " ").toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();

interface KeptMoments {
  from: number;
  moments: RadioMoment[];
}

async function momentsFor(snap: LiveSnapshot): Promise<RadioMoment[]> {
  const clips = snap.radio ?? [];
  if (clips.length < MIN_TRANSCRIPTS) return [];
  const store = getStore();
  const key = `f1:moments:v1:${snap.sessionKey}`;
  const kept = await store.get<KeptMoments>(key).catch(() => null);
  const written = await cachedTranscripts(clips.map((c) => c.url));
  const usable = clips.filter((c) => written[c.url]?.text);
  if (usable.length < MIN_TRANSCRIPTS) return kept?.moments ?? [];
  if (kept && usable.length < kept.from + NEW_CLIPS) return kept.moments;
  if (!(await store.setIfAbsent(`${key}:try`, 1, RETRY_S).catch(() => false))) return kept?.moments ?? [];

  const list = usable.map((c, i) => `[${i}] ${c.code}: ${plain(written[c.url].text).replace(/\n/g, " / ")}`).join("\n");
  const text = await f1Json(
    `These are team radio transcripts from the ${snap.session} at the ${snap.meeting}. Pick the 3 to 5 most revealing: decisions, damage, disputes, strategy calls, a driver's frustration, or the championship. At most one may be a message after the flag, and only if it's about more than the finishing place. Skip routine congratulations. Use only what's written here and these facts.

${factsOf(snap)}

Transcripts:
${list}

For each pick: i, its number; quote, the most telling short line from that transcript, copied word for word, at most 14 words, without its speaker label; why, at most 9 plain words on what it led to or what it reveals, stated only from the facts. Don't just restate the driver's finishing place.`,
    MOMENTS_SCHEMA,
  ).catch((err) => {
    console.error("[f1/insights] moments failed:", err instanceof Error ? err.message.slice(0, 200) : err);
    return null;
  });
  if (!text) return kept?.moments ?? [];
  const rows = new Map(snap.rows.map((r) => [r.code, r]));
  const marks = oldestFirst(snap.raceControl).filter((m) => m.lap !== null);
  const lapAt = (utc: string) => {
    const t = whenUtc(utc);
    let lap: number | null = null;
    for (const m of marks) {
      if (whenUtc(m.utc) > t) break;
      lap = m.lap;
    }
    return lap;
  };
  const seen = new Set<string>();
  const moments = ((JSON.parse(text) as { picks?: { i?: number; quote?: string; why?: string }[] }).picks ?? []).flatMap((p) => {
    const c = usable[p.i ?? -1];
    const quote = plain(p.quote ?? "").replace(/^["“]|["”]$/g, "");
    const why = plain(p.why ?? "");
    // The driver's words stay his: a quote not in the transcript is dropped.
    if (!c || seen.has(c.url) || quote.length < 6 || why.length < 6 || !words(written[c.url].text).includes(words(quote))) return [];
    seen.add(c.url);
    return [{ url: c.url, code: c.code, name: rows.get(c.code)?.name || c.code, colour: c.colour, lap: lapAt(c.utc), quote, why }];
  });
  if (moments.length < 2) return kept?.moments ?? [];
  const picked = moments.slice(0, 5);
  await store.set(key, { from: usable.length, moments: picked } satisfies KeptMoments, { ttlSeconds: KEEP_S }).catch(() => {});
  return picked;
}

/** A finished session's recap and moments: the one at `path`, or else the latest. */
export async function insightsFor(path: string | null): Promise<Insights> {
  const snap = await (path ? pastSession(path) : lastSession()).catch(() => null);
  if (!snap || snap.running) return { recap: null, moments: [] };
  const [recap, moments] = await Promise.all([recapFor(snap), momentsFor(snap)]);
  return { recap, moments };
}

/** The latest race's recap, for the main page's result card. */
export async function latestRaceRecap(): Promise<SessionRecap | null> {
  const snap = await latestRaceSession().catch(() => null);
  return snap && !snap.running ? recapFor(snap) : null;
}
