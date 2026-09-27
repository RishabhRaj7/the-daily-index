import { GoogleGenAI, Type, type Schema } from "@google/genai";

// The one place that talks to Gemini (Google's current SDK, @google/genai —
// the old @google/generative-ai package is deprecated). Every caller asks
// for JSON; a response schema, when given, makes the model answer in
// exactly that shape so nothing needs cleaning before JSON.parse.

export { Type };
export type { Schema };

/** Override with GEMINI_MODEL; this is only the fallback. */
const DEFAULT_MODEL = "gemini-3.1-flash-lite";

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
    const response = await getClient().models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
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
    if (controller.signal.aborted) throw new Error(`${opts.label ?? "gemini"} timeout`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
