# The Daily Index

A personal morning newspaper. Every day it reads a few dozen news feeds, has an
AI editor pick and summarise the stories that match your preferences, and
prints them as one edition — alongside live markets, F1, weather and a few
things worth your time.

Built with Next.js 16 (App Router), React 19 and Tailwind CSS 4, deployed on
Vercel.

## What's in the paper

The page runs in one order, with one subject on each row at every screen size,
and the menu jumps between its parts: **Today**, **News** (Dateline, The Nation,
Two Cities, Sky Report), **Sport** (Paddock Notes, Clutch, Sports), **Money** (The
Ledger, Market Pulse) and **Next** (The Circuit Board, Straw Poll, your own sections,
The Week Ahead, The Grapevine), then the day's extras. A wider screen shows more of a
section at once. Stories print in full from laptop width; on a phone or tablet they
show their first sentence and open in place. On a phone, anything else that shows more
slides up in a sheet. Each story's source is its publisher's logo and name.

| Section | What it carries |
|---|---|
| **Front page** | Markets, the next race and the weather as three numbers, *The Briefing* (the day's must-reads as one-liners) and the lead story |
| **Postcard** | Travel mode: weather and local news for wherever you are (opt-in, one tap) |
| **Dateline** | World news, grouped by the countries you follow |
| **The Nation** | India's own news: government and policy, courts, economy, infrastructure, security and major incidents, led by what the whole country is reading |
| **Two Cities** | Local news from your cities, side by side (Bengaluru and Ranchi by default) |
| **Paddock Notes** | Formula 1 stories plus the pit wall: next race, countdown and circuit map, weekend session times, paddock chatter (the top posts from F1's X accounts and subreddits, yours first), last race podium, your team and drivers, championship tables. The F1 live centre (`/f1/live`) has timing (with the chequered flag as each driver takes it), the map, race control, radio, pit stops, stewards and analysis |
| **Sports** | Football and tennis, when you follow them |
| **Clutch** | Valorant: your teams (next match with the market's odds, last result, where they stand), the running VCT major and the scene's headlines; a tap opens the bracket and groups, a team's results since 2024, or a match's scoreboard (per map, live while it's on) with the two teams' head-to-head; small, and smaller still in the off-season |
| **The Ledger** | Markets and economy news — mostly India, some global |
| **Market Pulse** | 16 live indices across India, US, Europe and Asia with a mood gauge per region (India: Tickertape's Market Mood Index, US: CNN Fear & Greed), gold and silver at IBJA's rate, other commodities in rupees, BTC/ETH in USDT, each card with today's line against the previous close, a tap-to-open chart for each (read any point with a finger; its day and 52-week range, 50/200-day averages), a rates row (RBI repo, Fed funds, US 10-year, what FIIs and DIIs bought and sold, and the odds on the next decision), Nifty 50 breadth, when each market reopens, and IPO watch (mainboard IPOs with dates, size, GMP, the bidding's mood, and what people on X and Reddit say about each, from the accounts and subreddits you choose once for every IPO) |
| **The Circuit Board** | Technology |
| **The Week Ahead** | Under Next: RBI and Fed decisions, market holidays, public holidays, IPO dates, the F1 weekend and your Valorant teams' matches, in IST |
| **Straw Poll** | Prediction-market odds from Polymarket and Kalshi, chosen for you: the day's biggest moves with the news that lines up with them, where the money is, your watchlist, a track record; plus three or four questions at the foot of each section and a line under a story when a market is about it. Every market opens with every contender's chart (1D to all time) and why it moved |
| **Sky Report** | Severe-weather alerts near you (NDMA), weather that follows the clock (moon and stars after sunset), rain chances through the day, air quality, and your other cities |
| **The Grapevine** | The Search Bar (what India, the US and the world are searching right now, from Google Trends) beside what's trending on X and Reddit, then posts from the X accounts and subreddits you follow, a puzzle desk, and the film odds. If X or Reddit keeps failing it is paused for an hour and quietly left out, with a "Try again" line |
| **The day's extras** | At the end of the page: the editor's note, On This Day and Word of the Day |

Also: an archive of past editions as a calendar, a share sheet that turns any
story into an image, light/dark editions, a particle-animated masthead, and a
settings page to choose sections, their order within each group and what fills
each one (one list, under the menu's headings), summary length (Standard by default) and voice.

## How it works

```
feeds (RSS / Google News)      ─┐
                                ├─► collectCorpus ─► AI selection ─► full text ─► AI writing ─► edition
reader preferences (browser)   ─┘                     (Gemini)                    (Gemini)       │
                                                                                                  ▼
                                               Upstash Redis: edition per preferences per day + archive
```

- **Preferences stay in your browser.** They are hashed; the hash identifies
  an edition, so there are no accounts. Readers with identical preferences
  share one edition.
- **Editions are built on the server** the first time they're asked for each
  day (and by a 05:30 IST cron for the default and recently-read editions),
  then stored and served instantly. An edition older than six hours is shown
  immediately while a fresh one builds.
- **The AI never invents links.** It picks articles by index from the corpus,
  and the server fills in real titles and URLs. Without an API key, a
  deterministic fallback still produces a paper.
- **Failures show on the page.** Gemini is retried, a few stories at a time, and
  a rebuild that comes out worse never replaces a good paper. If it still can't
  write a story, a notice at the top says how many and why, with "Try now"; the
  story is labelled "Summary pending", and its summary appears by itself once
  Gemini is back, without a reload.
- **Live data is fetched client-side** where it changes quickly: markets every
  minute (`/api/markets`), weather from Open-Meteo, F1 standings in stages
  (`/api/f1`).

- **Every build reports on itself.** Each feed's result, stage timings, the
  corpus by pool, full-text and link-decoding counts, which stories Gemini
  didn't write and why, and anything degraded: a summary on `/api/health`, the
  full report at `/api/health?report=1` (`&date=` for another day, `&hash=` for
  another edition; yours is in the `daily-index:edition` cookie).

`ARCHITECTURE.md` has the full design notes and a table of what is fetched
where, when, and where it is stored.

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local   # then fill in what you need (see below)
npm run dev                  # http://localhost:3000
```

The paper runs with an empty `.env.local`: summaries fall back to RSS text (and
the page says AI writing is off), editions live in memory until the dev server
restarts, and Reddit is off.

### Environment variables

| Variable | Needed for |
|---|---|
| `GEMINI_API_KEY` | AI selection and summaries (strongly recommended) |
| `GEMINI_MODEL` | Model override (default in `.env.example`) |
| `GEMINI_F1_API_KEY` | F1 team radio transcripts on their own Google project (falls back to `GEMINI_API_KEY`) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Stored editions and the archive (Upstash Redis; `UPSTASH_REDIS_REST_*` also works) |
| `CRON_SECRET` | Protects `/api/cron/*`; Vercel Cron sends it automatically |
| `REDDIT_ENABLED`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | Reddit in the Grapevine (optional) |
| `DATABASE_URL` | Postgres for Login-with-Reddit only (optional) |
| `EDITION_STALE_HOURS`, `EDITION_BUILDS_PER_DAY`, `EDITION_BUILDS_PER_IP`, `NEXT_PUBLIC_EDITION_TIME_ZONE` | Optional tuning |

`.env.example` explains each one.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |

## Releasing

Every change merged to `master` is a release, and Vercel deploys it. Each
release updates the documentation in the same PR (`ARCHITECTURE.md`'s Round
entry and current sections, this file, `.env.example`, file header comments);
the rule and checklist are in `CLAUDE.md`.

## Deploying

1. Import the repo into Vercel.
2. Add the **Upstash for Redis** integration (Storage tab) — it injects the KV
   variables.
3. Set `GEMINI_API_KEY` and `CRON_SECRET`.
4. The daily cron is already declared in `vercel.json`.

Redis keys are prefixed with the Vercel environment, so preview deployments
never touch the production archive.

## Project layout

```
src/
  app/                 pages (front page, archive, settings) and API routes
    api/edition        build / fetch today's edition for a set of preferences
    api/markets        live indices, regional moods, commodities
    api/f1             F1 sidebar data, in stages
    api/travel         reverse-geocode + local headlines for travel mode
    api/cron           daily builds
  components/
    sections/          one component per paper section
    widgets/           pit wall, gauges, market charts, weather blocks…
    masthead/ chrome/  masthead, the menu (PaperNav, TopBar, nav-icons), motion runtime
    settings/ onboarding/
  lib/
    live/              feed list (feeds.ts), fetchers, digest pipeline (digest.ts)
    preferences/       preference schema, defaults, prompts, projection onto sections
    chapters.ts        which group each section belongs to
    publishers.ts      a publisher's proper name and logo, from its web address
    server/            edition store, snapshots, Gemini client
```

Publisher logos live in `public/publishers/` as `<slug>.light.png` and
`<slug>.dark.png`. To add one, add both files and a row in `src/lib/publishers.ts`;
without one, a publisher gets a letter tile. Icons are
[Phosphor](https://phosphoricons.com) (`@phosphor-icons/react`).

To change what the paper reads, edit `src/lib/live/feeds.ts`; each pool notes
which feeds were dropped and why. Default sections and their prompts live in
`src/lib/preferences/default-preferences.json`.

## Data sources

RSS feeds from the publishers listed in `feeds.ts` (including RBI, TRAI and the
personal-finance desks), Google News search feeds (city, travel, SEBI, PIB, tax
and GST news) and Google News top and topic pages (a ranking signal: how many
outlets carry a story and where it leads), Yahoo Finance (indices, commodities and charts), Binance
(crypto), Tickertape and CNN (market mood), IBJA (gold and silver rates), NSE
(IPO list, subscription, issue details, trading holidays, FII/DII flows and
Nifty breadth), the Federal Reserve's FOMC calendar, FRED (Fed funds target),
the RBI's home page (repo rate), Polymarket and Kalshi (prediction markets),
Riot's esports API and VLR.gg (Valorant), NDMA's Sachet (weather alerts),
GOV.UK and Google's holiday calendars (exchange holidays), Google's India holidays calendar, investorgain.com (IPO
GMP, unofficial), OpenF1
(F1 schedule, results and standings), Open-Meteo (weather and air quality),
OpenStreetMap Nominatim (travel-mode place names), Merriam-Webster (Word of the
Day), Wikipedia (On This Day) and Reddit. Every story links to its original
publisher.
