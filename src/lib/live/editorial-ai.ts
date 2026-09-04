import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ReaderProfile, SectionKey } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";

// Small, grounded editorial helpers layered on top of Gemini. Every prompt
// here is constrained to material we already hold — the model is allowed to
// rephrase, never to report.

function aiEnabled(): boolean {
  return process.env.AI_SUMMARIZE !== "false" && Boolean(process.env.GEMINI_API_KEY);
}

function jsonModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key).getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
  });
}

export interface PickInput {
  id: string;
  title: string;
  snippet: string;
  domain: string;
  why: string;
}

/**
 * One witty, factual line per pick. The model sees only title + snippet and is
 * told not to add anything. If the output can't be parsed or looks padded, the
 * caller keeps the deterministic `why` line instead.
 */
export async function writePickBlurbs(picks: PickInput[]): Promise<Record<string, string>> {
  if (!aiEnabled() || picks.length === 0) return {};
  const model = jsonModel();
  if (!model) return {};

  const blocks = picks
    .map(
      (p, i) =>
        `[${i}] source: ${p.domain}\ntitle: ${p.title}\nsnippet: ${p.snippet || "(none)"}`,
    )
    .join("\n\n");

  const prompt = `You are the wry, well-read editor of "The Daily Index", a one-reader newspaper.
For each item below, write ONE sentence (max 26 words) that tells the reader why this real story is worth a look — in the voice of a smart friend forwarding a link, dry and precise, no exclamation marks, no hashtags, no emoji.

HARD RULES:
- Use ONLY facts present in the title or snippet. Do not add names, numbers, places or outcomes that are not there.
- If the snippet is empty or thin, comment on the headline itself rather than speculating.
- Never claim something is "trending", "viral" or "everyone is talking about it".
- Plain text only.

Return JSON: [{"i": 0, "line": "..."}, ...] in the same order.

${blocks}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text()) as Array<{ i: number; line: string }>;
    const out: Record<string, string> = {};
    for (const item of parsed) {
      const pick = picks[item.i];
      const line = typeof item.line === "string" ? item.line.trim() : "";
      if (pick && line.length > 12 && line.length < 260 && !/#\w+/.test(line)) out[pick.id] = line;
    }
    return out;
  } catch (err) {
    console.error("[writePickBlurbs] Gemini error:", err);
    return {};
  }
}

function sectionLabel(key: SectionKey | null): string | null {
  if (!key) return null;
  return SECTION_META[key]?.label ?? key;
}

/** Deterministic fallback so the desk note is never blank. */
export function fallbackEditorsNote(profile: ReaderProfile, ctx: { weekday: string; heroHeadline?: string }): string {
  const fav = sectionLabel(profile.favouriteSection);
  const bits: string[] = [];
  if (profile.totalIssues <= 1) {
    bits.push("First edition. The paper will get to know you from here — every issue you open and every story you unfold is remembered, locally, on this device only.");
  } else if (profile.streak >= 7) {
    bits.push(`${profile.streak} mornings in a row. That's a habit, not a streak.`);
  } else if (profile.streak >= 2) {
    bits.push(`Good ${ctx.weekday}. Day ${profile.streak} of your current run.`);
  } else {
    bits.push(`Welcome back. Issue ${profile.totalIssues} of yours.`);
  }
  if (fav && profile.engagementsThisWeek >= 3) {
    bits.push(`You've been spending most of your time in ${fav} lately, so we've nudged its stories up the page a touch.`);
  }
  if (profile.weekdayHabit) {
    bits.push(`You rarely miss a ${profile.weekdayHabit}.`);
  }
  return bits.join(" ");
}

/**
 * Two or three sentences from the editor, referencing the reader's own habits.
 * Inputs are aggregate counts only — no story text leaves the device beyond
 * headline titles the reader already engaged with.
 */
export async function writeEditorsNote(
  profile: ReaderProfile,
  ctx: { weekday: string; heroHeadline?: string; recentHeadlines: string[]; dateLabel: string },
): Promise<string | null> {
  if (!aiEnabled()) return null;
  const model = jsonModel();
  if (!model) return null;

  const facts = [
    `date: ${ctx.dateLabel} (${ctx.weekday})`,
    `issues opened so far: ${profile.totalIssues}`,
    `current streak: ${profile.streak} days (longest ${profile.longestStreak})`,
    profile.favouriteSection ? `section they open most: ${sectionLabel(profile.favouriteSection)}` : null,
    profile.favouriteSource ? `source they click most: ${profile.favouriteSource}` : null,
    profile.topTags.length ? `recurring themes: ${profile.topTags.join(", ")}` : null,
    profile.weekdayHabit ? `weekday they rarely miss: ${profile.weekdayHabit}` : null,
    `stories expanded in the last 7 days: ${profile.engagementsThisWeek}`,
    ctx.recentHeadlines.length ? `headlines they unfolded recently: ${ctx.recentHeadlines.slice(0, 4).join(" | ")}` : null,
    ctx.heroHeadline ? `today's lead: ${ctx.heroHeadline}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are the editor of "The Daily Index", a newspaper printed for exactly one reader. Write a short "From the Editor's Desk" note: 2–3 sentences, max 70 words, warm but dry, British-newspaper register, second person. Reference at least one concrete fact from the reader data below (streak, favourite section, a theme, a habit). Do not invent facts, statistics or news. No greeting like "Dear reader", no sign-off, no emoji, no exclamation marks.

READER DATA
${facts}

Return JSON: {"note": "..."}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text()) as { note?: string };
    const note = parsed.note?.trim();
    return note && note.length > 20 ? note : null;
  } catch (err) {
    console.error("[writeEditorsNote] Gemini error:", err);
    return null;
  }
}
