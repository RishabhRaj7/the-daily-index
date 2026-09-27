// Coarse pre-filter for *party / electoral* politics, applied only to the
// World feeds (see `politicsFilter` in feeds.ts). Judgement calls — is this
// geopolitics the reader wants, or a campaign story they don't? — belong to
// the AI editor, via the reader's "Skip party politics" preference.
//
// History: this used to be a broad blocklist applied to every feed,
// including leaders' names and words like "president", "minister",
// "protest" and "poll". Measured on live feeds it dropped 65 of 297 World
// items (most of them geopolitics the reader's World section asks for),
// Finance Minister budget news in Markets, EU tech regulation in Tech, the
// FIA president in F1 — and a karting champion, because a rival's surname
// was "Albanese". Only terms that are unambiguous on their own remain.
const POLITICS_KEYWORDS = [
  "election",
  "by-election",
  "ballot",
  "referendum",
  "polling day",
  "goes to the polls",
  "campaign trail",
  "campaign rally",
  "election rally",
  "political rally",
  "political party",
  "opposition party",
  "ruling party",
  "party leader",
  "party leadership",
  "lok sabha",
  "rajya sabha",
  "legislative assembly",
  "assembly election",
  "coalition government",
  "no-confidence",
  "vote bank",
  "mla",
  // parties (India + common Western)
  "bjp",
  "congress party",
  "shiv sena",
  "aiadmk",
  "rjd",
  "democratic party",
  "republican party",
  "labour party",
  "conservative party",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole words (so "mla" never matches inside another word), with an
// optional plural: "election" also catches "elections".
const POLITICS_PATTERN = new RegExp(
  `\\b(${POLITICS_KEYWORDS.map(escapeRegExp).join("|")})s?\\b`,
  "i",
);

export function isPolitical(text: string): boolean {
  return POLITICS_PATTERN.test(text);
}
