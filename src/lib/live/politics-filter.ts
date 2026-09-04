// Filter applied at the data layer, not just in display — politics is
// excluded from Dateline/Ledger/Grapevine per project convention, regardless
// of source (RSS, Reddit, etc).
// This is a keyword/name blocklist, not a real classifier — it will miss
// stories about politicians it doesn't recognize and go stale as leaders
// change. It's a pragmatic first line of defense for a free-API phase, not
// a guarantee.
const POLITICS_KEYWORDS = [
  "election",
  "parliament",
  "senate",
  "minister",
  "prime minister",
  "chief minister",
  "president",
  "cabinet",
  "lawmaker",
  "ballot",
  "coup",
  "lok sabha",
  "rajya sabha",
  "referendum",
  "opposition party",
  "ruling party",
  "political party",
  "campaign trail",
  "state governor",
  "governor race",
  "governor election",
  "party leader",
  "vote bank",
  "votes on",
  "vote on",
  "voters",
  "goes to the polls",
  "poll",
  "protest",
  "political rally",
  "campaign rally",
  "election rally",
  "legislative assembly",
  "state assembly",
  "assembly election",
  "eurosceptic",
  "eu accession",
  "joining the eu",
  "joining eu",
  "students' union",
  "student union",
  "mla",
  "mp",
  "coalition government",
  "no-confidence",
  // parties (India + common Western)
  "bjp",
  "congress party",
  "tmc",
  "aap",
  "shiv sena",
  "dmk",
  "aiadmk",
  "jd(u)",
  "rjd",
  "ncp",
  "democrat",
  "republican party",
  "labour party",
  "conservative party",
  // heads of state / prominent political figures — surface-level defense;
  // this list will drift as leaders change
  "trump",
  "biden",
  "harris",
  "modi",
  "putin",
  "xi jinping",
  "zelensky",
  "netanyahu",
  "starmer",
  "macron",
  "scholz",
  "meloni",
  "erdogan",
  "trudeau",
  "albanese",
  "rahul gandhi",
  "amit shah",
  "yogi adityanath",
  "mamata banerjee",
  "arvind kejriwal",
  "nitish kumar",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary matching, not plain substring — a plain `includes` check on
// terms like "modi" or "mp" would false-positive on words like
// "modification" or "temp".
const POLITICS_PATTERN = new RegExp(
  `\\b(${POLITICS_KEYWORDS.map(escapeRegExp).join("|")})\\b`,
  "i",
);

export function isPolitical(text: string): boolean {
  return POLITICS_PATTERN.test(text);
}
