// Copy checks for what the model writes: the tells that make a paragraph
// read as machine-written. The list follows the one The House of 1400 fails
// an edition on (their docs/EDITORIAL.md, "Banned (AI tells)"), minus
// "highlights", which sport uses as a noun.
//
// The writing pass asks for clean copy; this checks it. Items that still
// carry a tell go back to the model once with the problems named, and what
// survives that gets a mechanical fix where one is safe (dashes).

const WORDS = [
  "pivotal", "crucial", "landmark", "testament", "underscores?", "underscored", "underscoring",
  "showcases?", "showcased", "showcasing", "delves?", "delving", "landscape", "navigates?", "navigating",
  "robust", "seamless(?:ly)?", "notably", "game-changer", "amidst", "amid",
];
const WORD_RE = new RegExp(`\\b(${WORDS.join("|")})\\b`, "i");

const PATTERNS: Array<[RegExp, string]> = [
  [/—|\s–\s/, "em dash (use a comma, colon or full stop)"],
  [/, (highlighting|underscoring|signall?ing|reflecting|showcasing|cementing|emphasi[sz]ing|marking a|paving the way)\b/i, '"-ing" tail that fakes analysis'],
  [/\b(it'?s|this is|that'?s) not (just|only|merely)\b|\bnot (just|only|merely) [^.;]{1,60}, but\b/i, '"not just X, but Y" reframe'],
  [/\bexperts (say|believe|warn)\b/i, 'vague attribution ("experts say")'],
  [/\b(in summary|in conclusion|overall,)/i, "summary tag"],
  [/\bas an ai\b/i, "AI tell"],
];

/** Every tell found in one piece of copy, described for the repair prompt. */
export function copyIssues(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  const word = text.match(WORD_RE);
  if (word) out.push(`the word "${word[1]}"`);
  for (const [re, label] of PATTERNS) if (re.test(text)) out.push(label);
  return out;
}

/** The safe mechanical fixes: dashes become commas, a leading "Notably," goes. */
export function fixCopy(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s–\s/g, ", ")
    .replace(/(^|[.!?]\s+)Notably,\s+(\w)/g, (_, lead: string, c: string) => lead + c.toUpperCase())
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}
