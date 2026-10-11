import { createHash } from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { getStore } from "@/lib/server/store";
import { joinTurns, writeTurns, type Speaker } from "@/lib/f1-radio-speaker";

// Team radio, written down. Each clip is a short MP3 on F1's server; Gemini
// listens and transcribes it once, and the text is kept for four months, so
// a clip costs its calls once however often it is read.
//
// Which models: radio has its own pool, kept apart from the models the paper
// summarises the news with (GEMINI_MODEL, and Flash-Lite generally), so a
// busy race never eats the morning edition's quota. On the free tier each
// model has its own daily allowance (about 20 calls), so the pool is four
// Flash models in turn plus Google's transcribe model — about 100 calls a
// day: a race's 40–60 clips, most of them listened to twice. First in line
// is gemini-3.1-flash-lite, borrowed from the news (it is the summaries'
// second model, 500 calls a day) and capped at 60 radio calls a day, so the
// paper always keeps most of it; the Flash models take over after that and
// check its work (the second listen is always a different model). A model that
// answers "quota spent" is set aside until Google's midnight (Pacific)
// reset, one that's busy for a minute, one that's overloaded for 30 s.
//
// How near the text is to what was said: models are confident even when
// they are guessing (every one of them rated a muffled line it got wrong at
// 0.9+). So each clip is listened to twice, by two different models, and
// the transcripts are compared word by word: the share of words both heard
// is the confidence shown, and the words only one of them heard are marked
// in the text (as {{word}}) for the page to show as unsure. When the pool is
// down to one model, a clip gets one listen and the model's own (discounted)
// rating.

const KEEP_DAYS = 120;
const hash = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 20);
const key = (url: string) => `f1:radio:v4:${hash(url)}`;
// v3 was labelled before the swap check (below): shown until the clip is written again.
const OLD = (url: string) => `f1:radio:v3:${hash(url)}`;
const BLOCK = (model: string) => `f1:radio:block:${model}`;

interface Slot {
  model: string;
  /** Calls a minute the free tier allows. */
  rpm: number;
  /** Radio's own daily cap, for a model it shares with the news. */
  daily?: number;
}

/** Models that write a labelled transcript (JSON), in the order they're tried. */
const WRITERS: Slot[] = [
  // First (the reader's choice), but it is the summaries' fallback too
  // (lib/server/gemini.ts), so radio stops at 60 calls of it a day.
  { model: "gemini-3.1-flash-lite", rpm: 10, daily: 60 },
  { model: "gemini-3.8-flash", rpm: 5 },
  { model: "gemini-3.6-flash", rpm: 5 },
  { model: "gemini-3.5-flash", rpm: 5 },
  { model: "gemini-3.7-flash", rpm: 5 },
];
/**
 * Google's speech-to-text model: plain words, fast, but it drops whole lines
 * of a noisy clip, so it only checks when no other Flash model has room.
 */
const LISTENER: Slot = { model: "gemini-3.5-transcribe", rpm: 3 };

export interface Transcript {
  /** Speaker turns on their own lines; [unclear]/[bleep] as heard; {{word}} where the second listen differed. */
  text: string;
  /** 0–1: the share of words two listens agreed on (or the model's own rating after one). */
  confidence: number | null;
  /** Which model wrote it. */
  model: string;
  /** The model that listened again, when one did. */
  checkedBy?: string;
  /** Written under older instructions; shown until it is written again. */
  stale?: boolean;
}

let client: GoogleGenAI | null = null;

/** The models radio uses, for the page and the docs. */
export function radioModels(): string[] {
  const own = process.env.GEMINI_RADIO_MODEL;
  return [...(own ? [own] : []), ...WRITERS.map((w) => w.model).filter((m) => m !== own)];
}

export async function cachedTranscripts(urls: string[]): Promise<Record<string, Transcript>> {
  if (urls.length === 0) return {};
  const found = await getStore()
    .getMany<Transcript>([...urls.map(key), ...urls.map(OLD)])
    .catch(() => new Map<string, Transcript>());
  const out: Record<string, Transcript> = {};
  for (const u of urls) {
    const t = found.get(key(u));
    const old = found.get(OLD(u));
    if (t?.text) out[u] = t;
    else if (old?.text) out[u] = { ...old, stale: true };
  }
  return out;
}

/** Seconds until midnight in California, when the free tier's daily counts reset. */
function untilPacificMidnight(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Math.max(60, 86_400 - (n("hour") * 3600 + n("minute") * 60 + n("second")) + 120);
}

/** Takes one call's room on a model if it has any this minute — and today, if radio is capped on it. */
async function claim({ model, rpm, daily }: Slot): Promise<boolean> {
  const store = getStore();
  if (await store.get(BLOCK(model)).catch(() => null)) return false;
  if (daily) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const usedToday = await store.get<number>(`f1:radio:day:${model}:${today}`).catch(() => 0);
    if ((usedToday ?? 0) >= daily) return false;
  }
  const minute = Math.floor(Date.now() / 60_000);
  const used = await store.incr(`f1:radio:rpm:${model}:${minute}`, 90).catch(() => 1);
  if (used > rpm) return false;
  if (daily) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    await store.incr(`f1:radio:day:${model}:${today}`, 2 * 86_400).catch(() => 0);
  }
  return true;
}

/** After a refusal: spent for the day, busy for a minute, or gone. */
async function setAside(model: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const status = /"code":\s*(\d{3})/.exec(msg)?.[1] ?? "";
  const seconds =
    status === "429" ? (/PerDay/i.test(msg) ? untilPacificMidnight() : 65) : status === "503" ? 30 : status === "404" || status === "400" || status === "403" ? 86_400 : 0;
  if (seconds) await getStore().set(BLOCK(model), status, { ttlSeconds: seconds }).catch(() => {});
}

async function pick(pool: Slot[], not?: string): Promise<string | null> {
  for (const p of pool) if (p.model !== not && (await claim(p))) return p.model;
  return null;
}

/** Whether any writer has room — the page stops asking when none has. */
export async function radioPaused(): Promise<boolean> {
  const blocks = await getStore()
    .getMany(WRITERS.map((w) => BLOCK(w.model)))
    .catch(() => new Map());
  return blocks.size >= WRITERS.length;
}

function writers(): Slot[] {
  const own = process.env.GEMINI_RADIO_MODEL;
  return own ? [{ model: own, rpm: 5 }, ...WRITERS.filter((w) => w.model !== own)] : WRITERS;
}

// Who is speaking is the model's call: it hears the voices and the whole
// exchange, which no rule over the written words can. These are its
// instructions for telling the two apart — sound first, then words, then
// the flow of the conversation — and for saying "unsure" instead of guessing.
const SPEAKERS = (first: string | null) =>
  [
    'Label every turn "driver" or "engineer", or "unsure" when you cannot tell. A wrong label is worse than "unsure".',
    "",
    "1. Listen first. The driver speaks from the cockpit at speed: behind the voice there is engine roar, wind, gear shifts,",
    "kerb rattle or heavy breathing, and the voice is often raised, strained, breathless, clipped or distorted by the helmet",
    "mic. The engineer speaks from the pit wall on a close studio-like microphone: clean, level, calm, with little or no noise",
    "behind it. A change in the background noise or in the voice's quality marks a change of speaker. After the race, the",
    "driver's side is quieter (cool-down lap), but the helmet mic still sounds rougher and more wind-blown than the pit wall.",
    "",
    "2. Then the words. The driver typically: says how the car feels (grip, balance, tyres going off, brakes, understeer,",
    "oversteer, a problem with the car or himself); complains about another driver or an incident (he pushed me off, he hit",
    "me, unbelievable); asks for information (what's the gap, are we boxing, what tyres is he on, how many laps); swears",
    "(bleeped words are nearly always the driver); celebrates or thanks the team (thank you guys, get in, vamos).",
    "The engineer typically: gives instructions (box box, box this lap, stay out, push now, plan B, strat or engine modes,",
    "lift and coast, manage the tyres, let him by, hold position, bring it home); gives numbers (gaps in seconds, deltas,",
    "lap counts, positions such as you're P4, lap times, targets); relays race control (penalties, investigations, track",
    "limits, safety car, VSC, flags); asks how the car or the driver is (how are the tyres, you OK, any damage); calls the",
    `driver by name${first ? ` (here "${first}")` : ""} or "mate"; runs the routine after the flag (that's P2, cool-down lap,`,
    "stop the car, weighbridge). Both sides say copy, yeah, okay, mate, well done and let's go, so those alone decide nothing.",
    "",
    "3. Then the flow. A question is usually answered by the other side: what's the gap? is answered by the engineer, how",
    "are the tyres? by the driver. A bare copy, yeah, okay or understood answers whoever spoke just before it. Many clips",
    "hold only one speaker, most often the engineer alone (an instruction, or a message after the flag), so don't invent a",
    "second voice; equally, don't merge two voices into one turn when you hear the sound change.",
    "",
    "After the chequered flag the cockpit is quiet, so sound tells you less and the words decide. The engineer reports the",
    "result and why (that's P9, he got a ten-second penalty, so we're up one), passes on other cars' penalties, gives the",
    "routine (switch positions, P1 then P0, cool-down, stop at the weighbridge) and thanks the driver for the drive or the",
    "pace. The driver thanks the team, the strategists, the guys in the garage, asks where he finished (was I P3?), and",
    "reacts to the result.",
    "",
    "4. When sound and words disagree, go with what you hear. When neither settles it, say unsure.",
    "",
    "5. Check the whole exchange before you answer. For each turn, note in `cue` the one or two things that decided it",
    "(e.g. 'engine noise behind', 'gives the position', 'thanks the strategists'). Then read the conversation again with",
    "every driver and engineer label swapped. The most common mistake is getting the first speaker wrong and every label",
    "after it with it. If the swapped version reads more like a real driver–engineer exchange (the one reporting results,",
    "penalties and instructions is the engineer; the one thanking the team and asking about the car or the result is the",
    "driver), answer with the swapped labels.",
  ].join("\n");

async function write(model: string, data: string, who: string, first: string | null): Promise<{ text: string; confidence: number | null }> {
  const name = first ? `${first} (${who})` : who;
  const res = await client!.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "audio/mpeg", data } },
          {
            text:
              `This is a Formula 1 team radio clip between the driver ${name} and their race engineer.\n\n` +
              "Transcribe exactly what is said, in English, as turns in order, a new turn whenever the speaker changes. " +
              "Keep F1 terms as said (box, delta, deg, DRS). " +
              'Write any word you cannot make out as "[unclear]" rather than guessing, and bleeped words as "[bleep]".\n\n' +
              SPEAKERS(first) +
              "\n\nThen give your confidence that the transcript matches what was said, from 0 (guesswork) to 1 (every word clear). " +
              "If nothing intelligible is said, return no turns.",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          turns: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              // the words, then what gives the speaker away, then the speaker
              properties: { text: { type: Type.STRING }, cue: { type: Type.STRING }, speaker: { type: Type.STRING, enum: ["driver", "engineer", "unsure"] } },
              required: ["text", "cue", "speaker"],
              propertyOrdering: ["text", "cue", "speaker"],
            },
          },
          confidence: { type: Type.NUMBER },
        },
        required: ["turns", "confidence"],
      },
      temperature: 0.1,
      abortSignal: AbortSignal.timeout(40_000),
    },
  });
  const parsed = JSON.parse(res.text ?? "{}") as { turns?: { speaker?: string; text?: string }[]; confidence?: number };
  const turns = (parsed.turns ?? [])
    .map((t) => ({ who: (["driver", "engineer"].includes(t.speaker ?? "") ? t.speaker : "unsure") as Speaker, said: (t.text ?? "").replace(/\s+/g, " ").trim() }))
    .filter((t) => t.said);
  return { text: turns.length ? writeTurns(joinTurns(turns), who) : "", confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : null };
}

/** The second listen: plain words. The transcribe model answers in an audio-transcription part. */
async function listen(model: string, data: string): Promise<string> {
  const plain = model === LISTENER.model;
  const res = await client!.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "audio/mpeg", data } },
          { text: plain ? "Formula 1 team radio, English." : "Formula 1 team radio. Write down exactly the words said, in English, as plain text with no speaker names." },
        ],
      },
    ],
    config: { temperature: 0.1, abortSignal: AbortSignal.timeout(40_000) },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const heard = parts.map((p) => (p as { audioTranscription?: { text?: string } }).audioTranscription?.text ?? p.text ?? "").join(" ");
  return heard.trim();
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
// Hesitations: one listener writes them, the other doesn't; neither is wrong.
const FILLER = new Set(["uh", "um", "er", "erm", "ah", "eh", "hmm", "mm", "oh"]);

/**
 * Compare the written transcript with a second listen, word by word (longest
 * common subsequence). Returns the share of words both heard and the text
 * with the words only the writer heard wrapped as {{word}}.
 */
export function agree(written: string, heard: string): { share: number; marked: string } {
  // The writer's words, keeping speaker labels and [marks] out of the count.
  const tokens = written.split(/(\s+)/);
  const idx: number[] = [];
  const a: string[] = [];
  let lineStart = true;
  tokens.forEach((t, i) => {
    if (/^\s+$/.test(t)) {
      if (t.includes("\n")) lineStart = true;
      return;
    }
    const label = /:$/.test(t) && (lineStart || /^(Engineer|Driver|Unsure|[A-Z]{2,4}):$/.test(t));
    lineStart = false;
    if (label || /^\[.*\]$/.test(t)) return;
    const n = norm(t);
    if (n && !FILLER.has(n)) {
      idx.push(i);
      a.push(n);
    }
  });
  const b = heard
    .split(/\s+/)
    .map(norm)
    .filter((w) => w && !FILLER.has(w));
  if (a.length === 0 || b.length === 0) return { share: 0, marked: written };
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const matched = new Set<number>();
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      matched.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const out = [...tokens];
  idx.forEach((ti, k) => {
    if (!matched.has(k)) out[ti] = `{{${tokens[ti]}}}`;
  });
  // Neighbouring unsure words read as one phrase.
  const marked = out.join("").replace(/\}\}(\s+)\{\{/g, "$1");
  return { share: Math.round(((2 * dp[0][0]) / (a.length + b.length)) * 100) / 100, marked };
}

/** Transcribe one clip (or read the kept text). Null when it can't be heard or no model has room. */
export async function transcribe(url: string, who: string, first: string | null = null): Promise<Transcript | null> {
  const store = getStore();
  const kept = await store.get<Transcript>(key(url)).catch(() => null);
  if (kept?.text) return kept;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.AI_SUMMARIZE === "false") return null;
  // One writer per clip at a time.
  if (!(await store.setIfAbsent(`${key(url)}:lock`, 1, 90).catch(() => true))) return null;
  try {
    let model = await pick(writers());
    if (!model) return null;
    const audio = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!audio.ok) return null;
    const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
    client ??= new GoogleGenAI({ apiKey });

    // Both listens at once, the second from a different model. A writer that
    // is busy or spent hands the clip to the next one (twice at most).
    const second = (await pick(writers(), model)) ?? (await pick([LISTENER], model));
    const heard = second
      ? listen(second, data).catch(async (err) => {
          await setAside(second, err);
          return null;
        })
      : Promise.resolve(null);
    let w: { text: string; confidence: number | null } | null = null;
    for (let attempt = 0; attempt < 3 && model; attempt++) {
      try {
        w = await write(model, data, who, first);
        break;
      } catch (err) {
        console.error(`[f1/radio] ${model} refused:`, err instanceof Error ? err.message.slice(0, 160) : err);
        await setAside(model, err);
        model = await pick(writers().filter((x) => x.model !== second), model);
      }
    }
    const h = await heard;
    if (!w?.text || !model) return null;

    let out: Transcript;
    // A second listen that heard nothing isn't a disagreement, just no check.
    if (h && second && h.split(/\s+/).length >= 2) {
      const { share, marked } = agree(w.text, h);
      out = { text: marked, confidence: share, model, checkedBy: second };
    } else {
      // One listen: the model's own rating, less a little for each word it couldn't hear,
      // and capped — a lone model's word isn't worth "every word clear".
      const unclear = (w.text.match(/\[unclear\]/gi) ?? []).length;
      const words = w.text.split(/\s+/).length || 1;
      const confidence = w.confidence === null ? null : Math.round(Math.min(0.8, Math.max(0, w.confidence - (unclear / words) * 0.8)) * 100) / 100;
      out = { text: w.text, confidence, model };
    }
    await store.set(key(url), out, { ttlSeconds: KEEP_DAYS * 86_400 }).catch(() => {});
    return out;
  } catch (err) {
    console.error("[f1/radio] transcription failed:", err instanceof Error ? err.message.slice(0, 300) : err);
    return null;
  } finally {
    await store.del(`${key(url)}:lock`).catch(() => {});
  }
}
