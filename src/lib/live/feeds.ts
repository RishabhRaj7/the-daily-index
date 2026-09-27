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
}

// World & India. The default preferences group World by US / China / UK /
// India / Japan, so the pool carries a strong source for each region.
// Dropped: Indian Express India (200 undescribed items, mostly state politics).
export const WORLD_FEEDS: FeedSource[] = [
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { url: "https://www.theguardian.com/world/rss" },          // long snippets
  { url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { url: "https://www.scmp.com/rss/91/feed" },               // China
  { url: "https://www.japantimes.co.jp/feed/" },             // Japan
  { url: "https://www.thehindu.com/business/feeder/default.rss" },
  { url: "https://www.thehindu.com/sci-tech/feeder/default.rss" },
];

// Indian markets & economy.
// Dropped: ET's site-wide top-stories feed (general news, not markets) and
// Moneycontrol market reports (4 items, days old).
export const MARKETS_FEEDS: FeedSource[] = [
  { url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms" },
  { url: "https://www.livemint.com/rss/markets" },
  { url: "https://www.business-standard.com/rss/markets-106.rss" },
  { url: "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms" },
];

// Formula 1.
// Dropped: autosport.com — same newsroom as motorsport.com (Motorsport
// Network), so it mostly duplicated it while adding ~7 fresh items a day.
export const F1_FEEDS: FeedSource[] = [
  { url: "https://www.formula1.com/en/latest/all.xml", undated: true },
  { url: "https://www.motorsport.com/rss/f1/news/" },
  { url: "https://www.the-race.com/feed/" },
  { url: "https://www.racefans.net/feed/" },
  { url: "https://www.skysports.com/rss/12433" },
  { url: "https://feeds.bbci.co.uk/sport/formula1/rss.xml" },
  { url: "https://www.fia.com/rss/press-release" },
];

// Football. Sky's football feed is 11095 — the old 12040 was golf.
export const FOOTBALL_FEEDS: FeedSource[] = [
  { url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
  { url: "https://www.skysports.com/rss/11095" },
  { url: "https://www.theguardian.com/football/rss" },
  { url: "https://www.espn.com/espn/rss/soccer/news" },
];

// Tennis. Sky's tennis feed is 12110 — the old 12301 returns an empty body.
export const TENNIS_FEEDS: FeedSource[] = [
  { url: "https://feeds.bbci.co.uk/sport/tennis/rss.xml" },
  { url: "https://www.skysports.com/rss/12110" },
  { url: "https://www.espn.com/espn/rss/tennis/news" },
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
];
