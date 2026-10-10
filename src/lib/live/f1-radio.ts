import { createHash } from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { getStore } from "@/lib/server/store";

// Team radio, written down. Each clip is a short MP3 on F1's server; Gemini
// (the paper's existing key) listens and transcribes it once, and the text is
// kept for four months, so a clip costs one call however often it is read.
//
// It also says how sure it is: a confidence from 0 to 1 for the whole clip,
// and any word it couldn't make out comes back as "[unclear]". Radio is
// noisy and engineers talk over engines, so the page shows both.
//
// The model: GEMINI_RADIO_MODEL if set, else the paper's GEMINI_MODEL.

const KEEP_DAYS = 120;
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const key = (url: string) => `f1:radio:v2:${createHash("sha1").update(url).digest("hex").slice(0, 20)}`;

export interface Transcript {
  text: string;
  /** 0–1: how sure the transcriber is of the whole clip. */
  confidence: number | null;
  /** Which model wrote it. */
  model: string;
}

let client: GoogleGenAI | null = null;

export function radioModel(): string {
  return process.env.GEMINI_RADIO_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export async function cachedTranscripts(urls: string[]): Promise<Record<string, Transcript>> {
  if (urls.length === 0) return {};
  const found = await getStore()
    .getMany<Transcript>(urls.map(key))
    .catch(() => new Map<string, Transcript>());
  const out: Record<string, Transcript> = {};
  for (const u of urls) {
    const t = found.get(key(u));
    if (t?.text) out[u] = t;
  }
  return out;
}

/** Transcribe one clip (or read the kept text). Null when it can't be heard. */
export async function transcribe(url: string, who: string): Promise<Transcript | null> {
  const store = getStore();
  const kept = await store.get<Transcript>(key(url)).catch(() => null);
  if (kept?.text) return kept;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.AI_SUMMARIZE === "false") return null;
  // One writer per clip at a time.
  if (!(await store.setIfAbsent(`${key(url)}:lock`, 1, 60).catch(() => true))) return null;
  try {
    const audio = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!audio.ok) return null;
    const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
    client ??= new GoogleGenAI({ apiKey });
    const model = radioModel();
    const res = await client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "audio/mpeg", data } },
            {
              text:
                `This is a Formula 1 team radio clip between ${who} and their race engineer. ` +
                "Transcribe exactly what is said, in English. Start each speaker's turn on a new line, " +
                `beginning "${who}:" for the driver and "Engineer:" for the team. Keep F1 terms as said (box, delta, deg, DRS). ` +
                'Write any word you cannot make out as "[unclear]" rather than guessing, and bleeped words as "[bleep]". ' +
                "Then give your confidence that the transcript matches what was said, from 0 (guesswork) to 1 (every word clear). " +
                "If nothing intelligible is said, return an empty text.",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { text: { type: Type.STRING }, confidence: { type: Type.NUMBER } },
          required: ["text", "confidence"],
        },
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(25_000),
      },
    });
    const parsed = JSON.parse(res.text ?? "{}") as { text?: string; confidence?: number };
    const text = parsed.text?.trim() ?? "";
    if (!text) return null;
    // Each word it couldn't hear takes a little off however sure it says it is.
    const unclear = (text.match(/\[unclear\]/gi) ?? []).length;
    const words = text.split(/\s+/).length || 1;
    const said = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : null;
    const confidence = said === null ? null : Math.round(Math.max(0, said - (unclear / words) * 0.8) * 100) / 100;
    const out: Transcript = { text, confidence, model };
    await store.set(key(url), out, { ttlSeconds: KEEP_DAYS * 86_400 }).catch(() => {});
    return out;
  } catch (err) {
    console.error("[f1/radio] transcription failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await store.del(`${key(url)}:lock`).catch(() => {});
  }
}
