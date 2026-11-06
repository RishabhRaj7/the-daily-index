import { createHash } from "node:crypto";
import { aiEnabled, generateJson, Type } from "@/lib/server/gemini";
import { getStore } from "@/lib/server/store";
import { sessionFinishedSince } from "./f1-live";

// "While you were away": a headline and two sentences on what changed since the
// reader last looked, from what the page sends (the new headlines and the numbers that
// moved) and the F1 session that has finished since. On the paper's key and light
// models, kept for six hours per set of changes, with a daily ceiling because anyone
// can ask. The page prints its own plain line when there's no answer.

const KEEP_S = 6 * 3600;
const DAILY_CAP = 150;

export interface CatchUpAsk {
  since: number;
  stories: { section: string; headline: string }[];
  moves: string[];
}

export interface CatchUpAnswer {
  headline: string | null;
  story: string | null;
  /** The F1 session finished since then: "FP1 · Norris", "1:11.717". */
  session: { label: string; value: string } | null;
}

async function write(ask: CatchUpAsk, session: CatchUpAnswer["session"]): Promise<{ headline: string; story: string } | null> {
  const text = await generateJson(
    `You are the front-page editor of a sharp daily newspaper, telling one reader what changed since they last looked. Use only these facts. Never add a cause, a reason or anything not stated.

New stories, the reader's sections first:
${ask.stories.map((s) => `- ${s.section}: ${s.headline}`).join("\n")}
${ask.moves.length ? `\nNumbers that moved since then:\n${ask.moves.map((m) => `- ${m}`).join("\n")}` : ""}
${session ? `\nF1 session that finished: ${session.label}, ${session.value}.` : ""}

Write:
- headline: at most 8 words, present tense, naming the two most important changes, joined by a comma or "and". They are usually unrelated, so never link them with "as", "after", "amid" or "while". A number rises or falls: no "surge", "soar", "plunge" or "crash". No full stop.
- story: 2 short sentences on what else matters, in plain English. Name who and what. Don't restate the headline, don't count the stories, don't say "the reader" or "you".`,
    {
      schema: { type: Type.OBJECT, properties: { headline: { type: Type.STRING }, story: { type: Type.STRING } }, required: ["headline", "story"] },
      temperature: 0.3,
      timeoutMs: 15_000,
      label: "catch-up",
      light: true,
    },
  );
  const out = JSON.parse(text) as { headline?: string; story?: string };
  const headline = (out.headline ?? "").trim().replace(/\.$/, "");
  const story = (out.story ?? "").trim();
  return headline.length >= 8 && headline.length <= 80 && story.length >= 20 && story.length <= 320 ? { headline, story } : null;
}

export async function catchUp(ask: CatchUpAsk): Promise<CatchUpAnswer> {
  const session = await sessionFinishedSince(ask.since).catch(() => null);
  // Only when the page will show a card: at least three stories, two moves or a session.
  const worth = ask.stories.length >= 3 || ask.moves.length >= 2 || session;
  if (!aiEnabled() || !worth || ask.stories.length === 0) return { headline: null, story: null, session };
  const store = getStore();
  const hash = createHash("sha1").update(JSON.stringify([ask.stories.map((s) => s.headline), ask.moves, session])).digest("hex").slice(0, 20);
  const key = `catchup:v1:${hash}`;
  const kept = await store.get<{ headline: string; story: string }>(key).catch(() => null);
  if (kept) return { ...kept, session };
  const used = await store.incr(`catchup:day:${new Date().toISOString().slice(0, 10)}`, 2 * 86_400).catch(() => 0);
  if (used > DAILY_CAP) return { headline: null, story: null, session };
  const made = await write(ask, session).catch((err) => {
    console.error("[catch-up] failed:", err instanceof Error ? err.message.slice(0, 200) : err);
    return null;
  });
  if (!made) return { headline: null, story: null, session };
  await store.set(key, made, { ttlSeconds: KEEP_S }).catch(() => {});
  return { ...made, session };
}
