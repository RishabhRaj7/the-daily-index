// Who published a story, for the reader: its proper name and logo, from the web
// address or name the feeds give (a story's `sourceName`, a wire's `domain`). A
// subdomain counts as its parent ("sports.ndtv.com" is NDTV).
//
// Logos live in public/publishers/ in two versions, because some are dark glyphs
// that vanish on the evening paper and light ones that vanish on the morning one:
// <slug>.light.png and <slug>.dark.png. They were each fetched once and saved, so
// the page asks no third party anything about what's being read. To add one, add
// its row here and its two files there. A publisher with no logo gets a letter
// tile (components/story/PublisherMark.tsx).

export interface Publisher {
  /** The proper name, for the page. */
  name: string;
  /** Its files in public/publishers/; none means a letter tile. */
  slug?: string;
}

const KNOWN: Record<string, Publisher> = {
  "thehindu.com": { name: "The Hindu", slug: "the-hindu" },
  "thehindubusinessline.com": { name: "BusinessLine", slug: "businessline" },
  "economictimes.indiatimes.com": { name: "The Economic Times", slug: "economic-times" },
  "timesofindia.indiatimes.com": { name: "Times of India", slug: "times-of-india" },
  "hindustantimes.com": { name: "Hindustan Times", slug: "hindustan-times" },
  "indianexpress.com": { name: "The Indian Express", slug: "indian-express" },
  "newindianexpress.com": { name: "The New Indian Express", slug: "new-indian-express" },
  "ndtv.com": { name: "NDTV", slug: "ndtv" },
  "ndtvprofit.com": { name: "NDTV Profit", slug: "ndtv-profit" },
  "livemint.com": { name: "Mint", slug: "mint" },
  "business-standard.com": { name: "Business Standard", slug: "business-standard" },
  "deccanherald.com": { name: "Deccan Herald", slug: "deccan-herald" },
  "moneycontrol.com": { name: "Moneycontrol", slug: "moneycontrol" },
  "firstpost.com": { name: "Firstpost", slug: "firstpost" },
  "indiatoday.in": { name: "India Today", slug: "india-today" },
  "news18.com": { name: "News18", slug: "news18" },
  "scroll.in": { name: "Scroll", slug: "scroll" },
  "theprint.in": { name: "ThePrint", slug: "theprint" },
  "thewire.in": { name: "The Wire", slug: "the-wire" },
  "livelaw.in": { name: "LiveLaw", slug: "livelaw" },
  "etvbharat.com": { name: "ETV Bharat", slug: "etv-bharat" },
  "dailypioneer.com": { name: "The Pioneer", slug: "the-pioneer" },
  "goodreturns.in": { name: "GoodReturns", slug: "goodreturns" },
  "ddindia.co.in": { name: "DD India" },
  "odishatv.in": { name: "OTV", slug: "odishatv" },
  "newsonair.gov.in": { name: "All India Radio", slug: "newsonair" },
  "rbi.org.in": { name: "RBI", slug: "rbi" },
  "theguardian.com": { name: "The Guardian", slug: "the-guardian" },
  "bbc.co.uk": { name: "BBC", slug: "bbc" },
  "bbc.com": { name: "BBC", slug: "bbc" },
  "scmp.com": { name: "South China Morning Post", slug: "scmp" },
  "aljazeera.com": { name: "Al Jazeera", slug: "al-jazeera" },
  "japantimes.co.jp": { name: "The Japan Times", slug: "japan-times" },
  "reuters.com": { name: "Reuters", slug: "reuters" },
  "apnews.com": { name: "AP", slug: "ap" },
  "nytimes.com": { name: "The New York Times", slug: "nytimes" },
  "washingtonpost.com": { name: "The Washington Post", slug: "washington-post" },
  "cnn.com": { name: "CNN", slug: "cnn" },
  "ft.com": { name: "Financial Times", slug: "ft" },
  "wsj.com": { name: "The Wall Street Journal", slug: "wsj" },
  "bloomberg.com": { name: "Bloomberg", slug: "bloomberg" },
  "cnbc.com": { name: "CNBC", slug: "cnbc" },
  "marketwatch.com": { name: "MarketWatch", slug: "marketwatch" },
  "theverge.com": { name: "The Verge", slug: "the-verge" },
  "techcrunch.com": { name: "TechCrunch", slug: "techcrunch" },
  "techmeme.com": { name: "Techmeme", slug: "techmeme" },
  "arstechnica.com": { name: "Ars Technica", slug: "ars-technica" },
  "wired.com": { name: "WIRED", slug: "wired" },
  "engadget.com": { name: "Engadget", slug: "engadget" },
  "openai.com": { name: "OpenAI", slug: "openai" },
  "deepmind.google": { name: "Google DeepMind", slug: "deepmind" },
  "anthropic.com": { name: "Anthropic", slug: "anthropic" },
  "motorsport.com": { name: "Motorsport.com", slug: "motorsport" },
  "the-race.com": { name: "The Race", slug: "the-race" },
  "formula1.com": { name: "Formula 1", slug: "formula1" },
  "racefans.net": { name: "RaceFans", slug: "racefans" },
  "skysports.com": { name: "Sky Sports", slug: "sky-sports" },
  "autosport.com": { name: "Autosport", slug: "autosport" },
  "espn.com": { name: "ESPN", slug: "espn" },
  "tennismajors.com": { name: "Tennis Majors", slug: "tennis-majors" },
  "vlr.gg": { name: "VLR.gg", slug: "vlr" },
  "polymarket.com": { name: "Polymarket", slug: "polymarket" },
  "kalshi.com": { name: "Kalshi", slug: "kalshi" },
};

const BY_NAME = new Map(Object.values(KNOWN).map((p) => [p.name.toLowerCase(), p]));
const ALIASES: Record<string, string> = { polymarket: "polymarket.com", kalshi: "kalshi.com", "vlr.gg": "vlr.gg" };

/** The publisher for a web address or a name as a feed gives it. */
export function publisherFor(source: string): Publisher {
  const raw = source.trim();
  const host = raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const alias = ALIASES[host];
  if (alias) return KNOWN[alias];
  const byName = BY_NAME.get(raw.toLowerCase());
  if (byName) return byName;
  // The longest suffix wins, so "sports.ndtv.com" finds "ndtv.com".
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const hit = KNOWN[parts.slice(i).join(".")];
    if (hit) return hit;
  }
  return { name: raw };
}

/** All the publishers that have logo files, for the check that none is missing. */
export const PUBLISHER_SLUGS = [...new Set(Object.values(KNOWN).flatMap((p) => (p.slug ? [p.slug] : [])))];
