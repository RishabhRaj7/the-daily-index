import { GoogleGenerativeAI } from "@google/generative-ai";
import type { WordOfDay } from "@/lib/types";

const FALLBACK: WordOfDay = {
  word: "serendipity",
  pronunciation: "/ˌser.ənˈdɪp.ɪ.ti/",
  partOfSpeech: "noun",
  definition: "The occurrence of pleasant or useful things by chance.",
  example: "Finding that ₹500 note in an old jacket was pure serendipity.",
};

export async function getWordOfDay(): Promise<WordOfDay> {
  if (!process.env.GEMINI_API_KEY || process.env.AI_SUMMARIZE === "false") {
    return FALLBACK;
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Today is ${today}. Pick one genuinely interesting, uncommon English word — something a well-read person might not know. Return ONLY a JSON object with exactly these fields: {"word": "...", "pronunciation": "approximate phonetic like /ˈwɜːrd/", "partOfSpeech": "noun or verb or adjective etc", "definition": "clear 1-sentence definition", "example": "a vivid, modern example sentence"}`;

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());

    if (parsed.word && parsed.definition && parsed.example) {
      return parsed as WordOfDay;
    }
    return FALLBACK;
  } catch {
    return FALLBACK;
  }
}
