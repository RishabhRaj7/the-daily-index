# The Daily Index

A personal morning newspaper. Every day it reads a few dozen news feeds, has an
AI editor pick and summarise the stories that match your preferences, and
prints them as one edition — alongside live markets, F1, weather and a few
things worth your time.

Built with Next.js 16 (App Router), React 19 and Tailwind CSS 4, deployed on
Vercel.

## What's in the paper

| Section | What it carries |
|---|---|
| **Front page** | The day's lead story, *At a Glance* (six must-read one-liners), the Editor's Desk note, On This Day and Word of the Day |
| **Postcard** | Travel mode: weather and local news for wherever you are (opt-in, one tap) |
| **Dateline** | World and India, grouped by the countries you follow |
| **Two Cities** | Local news from your cities, side by side (Bengaluru and Ranchi by default) |
| **Paddock Notes** | Formula 1 stories plus the pit wall: next race, countdown and circuit map, weekend session times, last race podium, your team and drivers, championship tables |
| **Sports** | Football and tennis, when you follow them |
| **The Ledger** | Markets and economy news — mostly India, some global |
| **Market Pulse** | 16 live indices across India, US, Europe and Asia with a mood gauge per region, commodities in rupees, BTC/ETH in USDT, a tap-to-open chart for each, and IPO watch (mainboard IPOs with dates, size and GMP) |
| **The Circuit Board** | Technology |
| **Sky Report** | Weather that follows the clock (moon and stars after sunset), rain chances through the day, air quality, and your other cities |
| **The Grapevine** | Editor's picks from the day's wires, Reddit, and a puzzle desk |

Also: an archive of past editions as a calendar, a share sheet that turns any
story into an image, light/dark editions, a particle-animated masthead, and a
settings page to choose sections, their order, summary length and voice.

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
- **Live data is fetched client-side** where it changes quickly: markets every
  minute (`/api/markets`), weather from Open-Meteo, F1 standings in stages
  (`/api/f1`).

`ARCHITECTURE.md` has the full design notes and a table of what is fetched
where, when, and where it is stored.

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local   # then fill in what you need (see below)
npm run dev                  # http://localhost:3000
```

The paper runs with an empty `.env.local`: summaries fall back to RSS text,
editions live in memory until the dev server restarts, and Reddit is off.

### Environment variables

| Variable | Needed for |
|---|---|
| `GEMINI_API_KEY` | AI selection and summaries (strongly recommended) |
| `GEMINI_MODEL` | Model override (default in `.env.example`) |
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
    widgets/           pit wall, gauges, sparklines, weather blocks…
    masthead/ chrome/  masthead, top bar, motion runtime
    settings/ onboarding/
  lib/
    live/              feed list (feeds.ts), fetchers, digest pipeline (digest.ts)
    preferences/       preference schema, defaults, prompts, projection onto sections
    server/            edition store, snapshots, Gemini client
```

To change what the paper reads, edit `src/lib/live/feeds.ts`; each pool notes
which feeds were dropped and why. Default sections and their prompts live in
`src/lib/preferences/default-preferences.json`.

## Data sources

RSS feeds from the publishers listed in `feeds.ts`, Google News search feeds
(city and travel news), Yahoo Finance (indices, commodities and charts), Binance
(crypto), NSE (IPO list, subscription and issue details), investorgain.com (IPO
GMP, unofficial), OpenF1
(F1 schedule, results and standings), Open-Meteo (weather and air quality),
OpenStreetMap Nominatim (travel-mode place names), Merriam-Webster (Word of the
Day), Wikipedia (On This Day) and Reddit. Every story links to its original
publisher.
