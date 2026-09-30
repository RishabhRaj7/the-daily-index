// Every RSS/Atom source the paper reads, in one place.
//
// Each pool's feeds are interleaved round-robin by its fetcher, so the order
// below is also the tie-break order when a pool is capped. Feeds were chosen
// against live output (Sept 2026): each one must return fresh, on-topic items
// with a usable snippet. Notes on what was dropped and why sit next to each
// pool so the next audit doesn't re-add them.

export interface FeedSource {
  url: string;
  /**
   * Drop items older than this. Defaults to MAX_AGE_HOURS (30h); a slow,
   * high-signal source can be given a wider window.
   */
  maxAgeHours?: number;
  /**
   * The feed carries no per-item dates (formula1.com's "latest" list). Its
   * items are kept and treated as recent: the feed itself is a rolling
   * newest-first window, so feed position stands in for the date.
   */
  undated?: boolean;
  /**
   * Drop obvious party / electoral politics at fetch time (politics-filter.ts).
   * Only the World and state feeds need it; everything subtler is the AI
   * editor's call.
   */
  politicsFilter?: boolean;
  /**
   * A Google News search feed: titles end in " - Publisher", the real outlet
   * sits in <source url>, and the description is only a link list. The
   * parser cleans all three.
   */
  googleNews?: boolean;
}

/** Google News search, India edition — the fallback wire for any place. */
export function googleNewsFeed(query: string): FeedSource {
  return {
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`,
    googleNews: true,
  };
}

/** A short name for a feed in the build report: host plus first path part. */
export function feedName(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|feeds|rss)\./, "");
    if (host === "news.google.com") {
      const q = u.searchParams.get("q");
      if (q) return `Google News: ${q.replace(/\s*when:\d+d/, "").slice(0, 40)}`;
      const topic = u.pathname.match(/topic\/([A-Z]+)/)?.[1];
      return `Google News ${u.searchParams.get("gl") ?? ""} ${topic ? topic.toLowerCase() : "top"}`.replace(/\s+/g, " ");
    }
    const part = u.pathname.split("/").filter(Boolean)[0];
    return part && !/\.(xml|rss|cms)$/.test(part) ? `${host}/${part}` : host;
  } catch {
    return url;
  }
}

// The reader's cities (the "Two Cities" section). Keyed by lowercase city
// name; `aliases` also match the state, so a Karnataka story counts for
// Bengaluru. Checked against live output (Sept 2026):
//   The Hindu Bengaluru   60 items, ~13 a day, long snippets
//   TOI Bengaluru         20 items, all < 30h, headlines only
//   HT Bengaluru          ~7 items, mostly viral "Bengaluru man…" pieces
//   The Hindu Karnataka   54 fresh, heavy on state politics → politicsFilter
//   TOI Ranchi            20 items, all < 30h, headlines only
//   Google News Ranchi/Jharkhand  ~50 fresh — the only deep Jharkhand wire
// Dropped: HT Ranchi (1 item, 34h old), Indian Express Ranchi (404),
// Deccan Herald and New Indian Express Karnataka (404 / no snippets),
// Telegraph Jharkhand (403), Avenue Mail (e-paper links, no stories).
export const CITY_FEEDS: Record<string, { aliases: string[]; feeds: FeedSource[] }> = {
  bengaluru: {
    aliases: ["bangalore", "karnataka", "bbmp", "gba", "namma metro", "bmtc", "bescom", "bwssb", "mysuru", "mysore", "hubballi", "mangaluru"],
    feeds: [
      { url: "https://www.thehindu.com/news/cities/bangalore/feeder/default.rss" },
      { url: "https://timesofindia.indiatimes.com/rssfeeds/-2128833038.cms" },
      { url: "https://www.hindustantimes.com/feeds/rss/cities/bengaluru-news/rssfeed.xml" },
      { url: "https://www.thehindu.com/news/national/karnataka/feeder/default.rss", politicsFilter: true },
    ],
  },
  ranchi: {
    aliases: ["jharkhand", "jamshedpur", "dhanbad", "bokaro", "hazaribagh", "deoghar", "palamu", "giridih", "dumka"],
    feeds: [
      { url: "https://timesofindia.indiatimes.com/rssfeeds/4118245.cms" },
      { ...googleNewsFeed("Ranchi OR Jharkhand"), politicsFilter: true },
    ],
  },
};
CITY_FEEDS.bangalore = CITY_FEEDS.bengaluru;

// World & India. The default preferences group World by US / China / UK /
// India / Japan, so the pool carries a strong source for each region.
// Dropped: Indian Express India (200 undescribed items, mostly state politics).
export const WORLD_FEEDS: FeedSource[] = [
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", politicsFilter: true },
  { url: "https://www.theguardian.com/world/rss", politicsFilter: true },  // long snippets
  { url: "https://www.aljazeera.com/xml/rss/all.xml", politicsFilter: true },
  { url: "https://www.scmp.com/rss/91/feed", politicsFilter: true },       // China
  { url: "https://www.japantimes.co.jp/feed/", politicsFilter: true },     // Japan
  { url: "https://www.thehindu.com/business/feeder/default.rss", politicsFilter: true },
  { url: "https://www.thehindu.com/sci-tech/feeder/default.rss", politicsFilter: true },
];

// India's national desk: its own pool, so a busy world day can't crowd the
// country's news out of the corpus (before Sept 30 2026 the only national
// feed was The Hindu, one of eight in the World pool). Checked Sept 30 2026:
//   The Hindu national   60 items, all < 30h, long snippets
//   HT India            100 items, fresh, one-line snippets
//   NDTV top             20 items, fresh, snippets
//   Deccan Herald India  24 items, all < 30h, short snippets
//   TOI top              47 items, all < 30h, headlines only
// Dropped: Indian Express India (200 items, no descriptions, mostly state
// politics). Party politics is heavy here, so every feed is filtered.
export const INDIA_FEEDS: FeedSource[] = [
  { url: "https://www.thehindu.com/news/national/feeder/default.rss", politicsFilter: true },
  { url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", politicsFilter: true },
  { url: "https://feeds.feedburner.com/ndtvnews-top-stories", politicsFilter: true },
  { url: "https://www.deccanherald.com/stories.rss?section=india", politicsFilter: true },
  { url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", politicsFilter: true },
];

// Money: rules and prices that change what people in India pay, earn, save,
// borrow or insure — the regulators' own releases plus the personal-finance
// desks. Regulators publish a few items a week, so they get a 72h window.
// Checked Sept 30 2026: RBI press (8 of 10 < 30h, full text in the feed),
// RBI notifications, TRAI, ET Wealth (17 fresh), Mint Money and Insurance,
// BS Personal Finance, and Google News searches for PIB, SEBI, income tax,
// GST and credit cards (14-64 fresh each). SEBI's own RSS host doesn't
// resolve from every network, so SEBI comes through Google News.
export const MONEY_FEEDS: FeedSource[] = [
  { url: "https://www.rbi.org.in/pressreleases_rss.xml", maxAgeHours: 72 },
  { url: "https://economictimes.indiatimes.com/wealth/rssfeeds/837555174.cms" },
  { url: "https://www.livemint.com/rss/money" },
  { ...googleNewsFeed("site:sebi.gov.in when:2d"), maxAgeHours: 72 },
  { url: "https://www.livemint.com/rss/insurance", maxAgeHours: 72 }, // a few items a week
  { ...googleNewsFeed("site:pib.gov.in when:2d") },
  { url: "https://www.business-standard.com/rss/finance/personal-finance-10317.rss" },
  { ...googleNewsFeed('CBDT OR "income tax" India when:2d') },
  { url: "https://www.rbi.org.in/notifications_rss.xml", maxAgeHours: 72 },
  { ...googleNewsFeed('"GST council" OR CBIC OR "GST rate" when:2d') },
  { url: "https://www.trai.gov.in/rss.xml", maxAgeHours: 72 },
  { ...googleNewsFeed('"credit card" (devaluation OR lounge OR "annual fee" OR rewards) India when:3d'), maxAgeHours: 72 },
];

// Google News edition and topic pages. Not stories for the paper: signals.
// Each item's position says what leads the day, and its description lists
// up to five other outlets running the same story — the best free measure
// of how widely a story is covered (both friends' papers settled on it).
export const SIGNAL_FEEDS: Array<{ url: string; name: string; pool: string; top: boolean }> = [
  { url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en", name: "India top", pool: "India", top: true },
  { url: "https://news.google.com/rss/headlines/section/topic/NATION?hl=en-IN&gl=IN&ceid=IN:en", name: "India nation", pool: "India", top: false },
  { url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-IN&gl=IN&ceid=IN:en", name: "World", pool: "World", top: false },
  { url: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en", name: "Business", pool: "Markets", top: false },
  { url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en", name: "Technology", pool: "Tech", top: false },
  { url: "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en", name: "Sports", pool: "Sports", top: false },
];

// Indian markets & economy.
// Dropped: ET's site-wide top-stories feed (general news, not markets) and
// Moneycontrol market reports (4 items, days old).
export const MARKETS_FEEDS: FeedSource[] = [
  { url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms" },
  { url: "https://www.livemint.com/rss/markets" },
  { url: "https://www.business-standard.com/rss/markets-106.rss" },
  { url: "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms" },
  // Added Sept 2026: the freshest Indian markets desk in the audit (18 of
  // 60 items < 30h on a Sunday, full snippets).
  { url: "https://www.thehindubusinessline.com/markets/feeder/default.rss" },
  // Global markets that move India: Wall Street, the Fed, oil, big data.
  // Fewer feeds than the Indian desk, so India still dominates the pool.
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { url: "https://www.ft.com/markets?format=rss" },
];

// Formula 1.
// Dropped: autosport.com — same newsroom as motorsport.com (Motorsport
// Network), so it mostly duplicated it while adding ~7 fresh items a day.
// FIA press releases (Sept 2026: timed out, and rarely news when it answered).
export const F1_FEEDS: FeedSource[] = [
  { url: "https://www.formula1.com/en/latest/all.xml", undated: true },
  { url: "https://www.motorsport.com/rss/f1/news/" },
  { url: "https://www.the-race.com/feed/" },
  { url: "https://www.racefans.net/feed/" },
  { url: "https://www.skysports.com/rss/12433" },
  { url: "https://feeds.bbci.co.uk/sport/formula1/rss.xml" },
];

// Football. Sky's football feed is 11095 — the old 12040 was golf.
// Dropped: ESPN soccer (Sept 2026: returns an empty body).
export const FOOTBALL_FEEDS: FeedSource[] = [
  { url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
  { url: "https://www.skysports.com/rss/11095" },
  { url: "https://www.theguardian.com/football/rss" },
];

// Tennis. Sky's tennis feed is 12110 — the old 12301 returns an empty body.
// Dropped: ESPN tennis (Sept 2026: empty body). Tennis Majors replaces it —
// tennis-only, so the pool stops running dry outside the Slams.
export const TENNIS_FEEDS: FeedSource[] = [
  { url: "https://feeds.bbci.co.uk/sport/tennis/rss.xml" },
  { url: "https://www.skysports.com/rss/12110" },
  { url: "https://www.tennismajors.com/feed" },
  { url: "https://www.theguardian.com/sport/tennis/rss" },
];

// Technology. The Verge publishes Atom (the parser now reads it).
// Dropped: Gizmodo — mostly deals and listicles, which the tech section's
// prompt tells the model to skip anyway.
export const TECH_FEEDS: FeedSource[] = [
  { url: "https://www.theverge.com/rss/index.xml" },
  { url: "https://techcrunch.com/feed/" },
  { url: "https://feeds.arstechnica.com/arstechnica/index" },
  { url: "https://www.wired.com/feed/rss" },
  { url: "https://www.engadget.com/rss.xml" },
  // Added Sept 2026: long snippets and fewer gadget reviews than the rest.
  { url: "https://www.theguardian.com/technology/rss" },
];
