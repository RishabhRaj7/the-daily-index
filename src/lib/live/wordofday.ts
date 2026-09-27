import type { WordOfDay } from "@/lib/types";

// Merriam-Webster's free Word of the Day feed — one real word per day, the
// same for every reader, with a dictionary definition and example. It used
// to be a Gemini call on every page render (~1.2s of each load, and a
// different "word of the day" on every refresh).

const FEED = "https://www.merriam-webster.com/wotd/feed/rss2";

const FALLBACK: WordOfDay = {
  word: "serendipity",
  pronunciation: "/ˌser.ənˈdɪp.ɪ.ti/",
  partOfSpeech: "noun",
  definition: "The occurrence of pleasant or useful things by chance.",
  example: "Finding that ₹500 note in an old jacket was pure serendipity.",
};

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Inline tags (<em>, <strong>, <a>, <font>) vanish without a gap so
// "<em>word</em>." stays "word."; anything else becomes a space.
function plain(html: string): string {
  return decode(
    html
      .replace(/<\/?(em|strong|a|font|i|b)\b[^>]*>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull the fields out of one feed item's HTML description. */
export function parseWordOfDay(itemXml: string): WordOfDay | null {
  const word = plain(itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? "");
  const html = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? "";
  if (!word || !html) return null;

  // "<strong>word</strong> &#149; \kun-FAB-yuh-layt\&nbsp; &#149; <em>verb</em>"
  const pronunciation = decode(html.match(/\\([^\\]+)\\/)?.[1] ?? "").trim();
  const partOfSpeech = plain(html.match(/&#149;[^<]*<em>([^<]+)<\/em>/)?.[1] ?? "");

  // The feed nests <p> inside <p>, so split on every paragraph boundary
  // instead of matching pairs. The heading line ("word • \pron\ • verb")
  // is the only segment carrying the backslashed pronunciation.
  const paragraphs = html
    .split(/<\/?p[^>]*>/i)
    .map(plain)
    .filter((p) => p && !/\\[^\\]+\\/.test(p));
  const exampleIdx = paragraphs.findIndex((p) => p.startsWith("//"));
  const definition =
    paragraphs.find((p, i) => (exampleIdx < 0 || i < exampleIdx) && p.length > 40 && !/Word of the Day for/i.test(p)) ?? "";
  const example = exampleIdx >= 0 ? paragraphs[exampleIdx].replace(/^\/\/\s*/, "") : "";

  if (!definition) return null;
  return {
    word,
    pronunciation: pronunciation ? `\\${pronunciation}\\` : "",
    partOfSpeech: partOfSpeech || "word",
    definition,
    example,
  };
}

export async function getWordOfDay(): Promise<WordOfDay> {
  try {
    const res = await fetch(FEED, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TheDailyIndex/1.0; personal RSS reader)" },
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return FALLBACK;
    const xml = await res.text();
    const first = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1];
    return (first && parseWordOfDay(first)) || FALLBACK;
  } catch {
    return FALLBACK;
  }
}
