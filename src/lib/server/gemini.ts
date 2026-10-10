import { GoogleGenAI, Type, type Schema } from "@google/genai";

// The one place that talks to Gemini (Google's current SDK, @google/genai —
// the old @google/generative-ai package is deprecated). Every caller asks
// for JSON; a response schema, when given, makes the model answer in
// exactly that shape so nothing needs cleaning before JSON.parse.

export { Type };
export type { Schema };

// The paper's own models — the free tier's most generous (Flash-Lite: 15 a
// minute, 500 a day each), kept for the news and nothing else (F1 radio has
// its own pool, lib/live/f1-radio.ts). The newest first; when it's spent or
// busy, the call goes to the other, so the paper has ~1,000 calls a day.
// GEMINI_MODEL, if set, goes first; GEMINI_FALLBACK_MODEL replaces the second.
const SUMMARY_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

export function summaryModels(): string[] {
  const list = [process.env.GEMINI_MODEL, ...SUMMARY_MODELS.slice(0, 1), process.env.GEMINI_FALLBACK_MODEL || SUMMARY_MODELS[1]].filter((m): m is string => Boolean(m));
  return [...new Set(list)];
}

/** Errors worth trying the next model for: spent, busy, or not offered. */
const handOn = (err: unknown) => /"code":\s*(429|503|500|404)|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|high demand/i.test(err instanceof Error ? err.message : String(err));

export function aiEnabled(): boolean {
  return process.env.AI_SUMMARIZE !== "false" && Boolean(process.env.GEMINI_API_KEY);
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/**
 * Run one prompt and return the model's JSON text. Throws on a missing key,
 * an API error, an empty answer or the timeout — callers decide the fallback.
 */
export async function generateJson(
  prompt: string,
  opts: { schema?: Schema; temperature?: number; timeoutMs?: number; label?: string } = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined;
  try {
    const models = summaryModels();
    for (let i = 0; ; i++) {
      try {
        const response = await getClient().models.generateContent({
          model: models[i],
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            ...(opts.schema ? { responseSchema: opts.schema } : {}),
            ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
            abortSignal: controller.signal,
          },
        });
        const text = response.text;
        if (!text) throw new Error(`${opts.label ?? "gemini"}: empty response`);
        return text;
      } catch (err) {
        if (i + 1 >= models.length || controller.signal.aborted || !handOn(err)) throw err;
        console.warn(`[gemini] ${models[i]} unavailable, trying ${models[i + 1]}`);
      }
    }
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`${opts.label ?? "gemini"} timeout`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
