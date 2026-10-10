import { createHash } from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { getStore } from "@/lib/server/store";

// Team radio, written down. Each clip is a short MP3 on F1's server; Gemini
// (the paper's existing key) listens and transcribes it once, and the text is
// kept for four months, so a clip costs one call however often it is read.

const KEEP_DAYS = 120;
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const key = (url: string) => `f1:radio:v1:${createHash("sha1").update(url).digest("hex").slice(0, 20)}`;

let client: GoogleGenAI | null = null;

export async function cachedTranscripts(urls: string[]): Promise<Record<string, string>> {
  if (urls.length === 0) return {};
  const found = await getStore()
    .getMany<string>(urls.map(key))
    .catch(() => new Map<string, string>());
  const out: Record<string, string> = {};
  for (const u of urls) {
    const t = found.get(key(u));
    if (t) out[u] = t;
  }
  return out;
}

/** Transcribe one clip (or read the kept text). Null when it can't be heard. */
export async function transcribe(url: string, who: string): Promise<string | null> {
  const store = getStore();
  const kept = await store.get<string>(key(url)).catch(() => null);
  if (kept) return kept;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.AI_SUMMARIZE === "false") return null;
  // One writer per clip at a time.
  if (!(await store.setIfAbsent(`${key(url)}:lock`, 1, 60).catch(() => true))) return null;
  try {
    const audio = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!audio.ok) return null;
    const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
    client ??= new GoogleGenAI({ apiKey });
    const res = await client.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "audio/mpeg", data } },
            {
              text:
                `This is a Formula 1 team radio clip between ${who} and their race engineer. ` +
                "Transcribe exactly what is said, in English, as plain text. Put each speaker's turn on a new line, " +
                `starting "${who}:" for the driver and "Engineer:" for the team. Keep F1 terms as said (box, delta, deg, DRS). ` +
                'Bleeped words stay as "[bleep]". If nothing intelligible is said, answer with an empty text.',
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.OBJECT, properties: { text: { type: Type.STRING } }, required: ["text"] },
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(25_000),
      },
    });
    const text = (JSON.parse(res.text ?? "{}") as { text?: string }).text?.trim() ?? "";
    if (!text) return null;
    await store.set(key(url), text, { ttlSeconds: KEEP_DAYS * 86_400 }).catch(() => {});
    return text;
  } catch (err) {
    console.error("[f1/radio] transcription failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await store.del(`${key(url)}:lock`).catch(() => {});
  }
}
