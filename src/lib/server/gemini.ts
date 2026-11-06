import { GoogleGenAI, FinishReason, Type, type Schema } from "@google/genai";

// The one place that talks to Gemini (Google's current SDK, @google/genai —
// the old @google/generative-ai package is deprecated). Every caller asks
// for JSON; a response schema, when given, makes the model answer in
// exactly that shape so nothing needs cleaning before JSON.parse.
//
// A busy model is normal, so a call tries both models, waits a moment and
// tries them again (three rounds, inside the caller's timeout) before it
// gives up. geminiFailure() turns whatever finally went wrong into words the
// paper can show its reader.

export { Type };
export type { Schema };

// The paper's order of models is set in the environment: GEMINI_MODEL first, then
// GEMINI_FALLBACK_MODEL; either can list several, separated by commas. When a model
// is spent or busy, the call goes to the next. With no fallback set, these two
// stand in: the free tier's most generous (Flash-Lite: 15 a minute, 500 a day
// each), so the paper can't run dry once a Flash model's 20 a day have gone. F1
// radio's order is in code, on its own key (lib/live/f1-radio.ts).
const DEFAULT_FALLBACKS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const listed = (value: string | undefined) => (value ?? "").split(",").map((m) => m.trim()).filter(Boolean);

/**
 * For the page's small one-liners, so they don't use up the first model's few calls:
 * GEMINI_LIGHT_MODEL (one or several), then Flash-Lite. A wrong name only
 * means the next one is tried.
 */
export function lightModels(): string[] {
  return [...new Set([...listed(process.env.GEMINI_LIGHT_MODEL), ...DEFAULT_FALLBACKS])];
}

/** Waits between rounds of trying every model; a round more than there are waits. */
const ROUND_WAITS_MS = [1500, 4000];

export function summaryModels(): string[] {
  const fallbacks = listed(process.env.GEMINI_FALLBACK_MODEL);
  return [...new Set([...listed(process.env.GEMINI_MODEL), ...(fallbacks.length ? fallbacks : DEFAULT_FALLBACKS)])];
}

/** Errors worth trying again for: spent, busy, not offered, or the line dropped. */
const handOn = (err: unknown) =>
  /"code":\s*(429|503|500|404)|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|high demand|empty response|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(
    err instanceof Error ? err.message : String(err),
  );

/**
 * What went wrong with a Gemini call, as a clause the page can print after
 * "Gemini failed on 3 of 36 summaries:". Never the raw error.
 */
export function geminiFailure(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/"code":\s*429|RESOURCE_EXHAUSTED|quota/i.test(m)) return "its quota ran out (429)";
  if (/"code":\s*503|UNAVAILABLE|overloaded|high demand/i.test(m)) return "it was overloaded (503)";
  if (/"code":\s*500|INTERNAL/i.test(m)) return "it had a server error (500)";
  if (/timeout/i.test(m)) return "it took too long to answer";
  if (/cut off/i.test(m)) return "its reply was cut off";
  if (/"code":\s*40[13]|PERMISSION_DENIED|API key|GEMINI_API_KEY/i.test(m)) return "it refused the API key";
  if (/JSON|empty response|Unexpected/i.test(m)) return "its reply could not be read";
  if (/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(m)) return "it could not be reached";
  return "the call to it failed";
}

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

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });
}

/**
 * Run one prompt and return the model's JSON text. Throws on a missing key,
 * an API error that survived the retries, an empty answer, a reply cut off by
 * the token limit, or the timeout — callers decide the fallback.
 */
export async function generateJson(
  prompt: string,
  opts: { schema?: Schema; temperature?: number; timeoutMs?: number; label?: string; light?: boolean } = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined;
  try {
    const models = opts.light ? lightModels() : summaryModels();
    for (let round = 0; ; round++) {
      let last: unknown;
      for (const model of models) {
        try {
          const response = await getClient().models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              ...(opts.schema ? { responseSchema: opts.schema } : {}),
              ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
              abortSignal: controller.signal,
            },
          });
          // Half a JSON reply never parses; say why rather than "bad JSON".
          if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
            throw new Error(`${opts.label ?? "gemini"}: reply cut off at the token limit`);
          }
          const text = response.text;
          if (!text) throw new Error(`${opts.label ?? "gemini"}: empty response`);
          return text;
        } catch (err) {
          if (controller.signal.aborted || !handOn(err)) throw err;
          console.warn(`[gemini] ${model} unavailable (round ${round + 1}):`, err instanceof Error ? err.message.slice(0, 120) : err);
          last = err;
        }
      }
      if (round >= ROUND_WAITS_MS.length) throw last;
      await pause(ROUND_WAITS_MS[round], controller.signal);
    }
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`${opts.label ?? "gemini"} timeout`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
