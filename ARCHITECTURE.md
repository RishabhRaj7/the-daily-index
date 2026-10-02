@AGENTS.md

# The Daily Index — Claude Instructions

## Project Overview

A personal daily digest web app built with Next.js App Router. Surfaces world news, sports, tech, markets, credit card news, Reddit trends, weather, and a word of the day — all personalised via a settings page. Markets: primarily India-focused (credit cards, finance) with global sports (F1, football, tennis).

---

## Architecture

### Data flow

```
app/page.tsx (server)
  ├── reads cookies (subreddits, sports, hate-watch preferences)
  ├── fetches all live data in one Promise.all
  ├── assembles Edition object
  └── renders <EditionView edition={...} hateWatchStories={...} />

EditionView (client, "use client")
  ├── reads personalization from localStorage on mount
  ├── fetches live weather client-side
  └── renders sections in user-defined order
```

### Cookie bridge pattern

The server (`app/page.tsx`) needs to know a user's preferences at request time so it can fetch the right data. Since personalization lives in localStorage (client-only), we mirror the key fields to cookies on save:

- `daily-index:subreddits` — JSON array of subreddit names
- `daily-index:sports` — JSON array of `"f1" | "football" | "tennis"`
- `daily-index:hate-watch` — JSON object `{ f1: string, football: string, tennis: string }`

`savePersonalization()` in `lib/personalization.ts` writes both localStorage AND these cookies. `loadPersonalization()` only reads localStorage (client-side rendering). The full `Personalization` object stays in localStorage; cookies carry just what the server needs at render time.

### Personalization (`lib/types.ts` → `Personalization`)

Key fields:
- `cardFollowing: string` — single card ID the user follows (was previously two arrays)
- `sports: ("f1" | "football" | "tennis")[]` — active sports; controls which feeds to fetch
- `favoriteF1Drivers: string[]` — up to 2 driver IDs from the live F1 roster
- `favoriteFootballPlayer / favoriteFootballClub / favoriteFootballNationalTeam` — free-fill or suggestion chip
- `favoriteTennisPlayer` — free-fill or suggestion chip
- `hateWatchF1 / hateWatchFootball / hateWatchTennis` — rival entity name for Schadenfreude section
- `subreddits: string[]` — up to 5 subreddits; empty = interest-aware fallback

---

## Key Files

| File | Purpose |
|---|---|
| `app/page.tsx` | Server entry point; reads cookies, fetches all live data, renders EditionView |
| `app/settings/page.tsx` | Settings page (server shell that passes creditCards + f1Roster to client) |
| `lib/types.ts` | All TypeScript interfaces: Personalization, Edition, Story, WireBrief, etc. |
| `lib/personalization.ts` | DEFAULT_PERSONALIZATION, loadPersonalization, savePersonalization, F1_TEAM_COLORS |
| `lib/sections.ts` | SECTION_META and SECTION_ORDER — section keys, labels, kickers |
| `lib/config/cards.ts` | MY_CARDS — the credit card list shown in preferences |
| `lib/live/feeds.ts` | Every RSS/Atom source, per pool, with per-feed options (age window, undated, cards-only) |
| `lib/live/rss.ts` | fetchRssFeed (RSS + Atom, zone-abbreviation dates), interleaveWires, dedupeWires |
| `lib/live/f1-news.ts` | getF1News — F1 pool from feeds.ts |
| `lib/live/football-news.ts` | getFootballNews — football pool from feeds.ts |
| `lib/live/tennis-news.ts` | getTennisNews — tennis pool from feeds.ts |
| `lib/live/f1.ts` | getLiveF1, getF1Roster — live F1 standings, race schedule, driver roster |
| `lib/live/reddit.ts` | getRedditTrending — fetches from user subreddits or interest-aware fallback |
| `lib/live/wire-to-story.ts` | promoteWireToStories — converts WireBrief to Story with LLM summary |
| `components/EditionView.tsx` | Main client component; reads localStorage, renders all sections in order |
| `components/onboarding/PersonalizationForm.tsx` | The preferences form (used in both onboarding and settings) |
| `components/onboarding/OnboardingGate.tsx` | Shows onboarding overlay if not yet onboarded |
| `components/settings/SettingsPageClient.tsx` | Settings page wrapper; "Save changes" persists, "Discard changes" navigates away |
| `components/sections/PaddockNotesSection.tsx` | Sports section; renders main stories + Schadenfreude sub-section + F1 sidebar |

---

## Sports Section Design

### Multi-sport

When multiple sports are selected, each gets `perSport = 2` articles (single sport gets 5). Feeds are fetched independently so:
1. The main section can cap per-sport without discarding articles for hate-watch filtering.
2. Hate-watch filtering runs on the full 20-article set per sport, not the capped subset.

```typescript
// app/page.tsx — fetches 20 each so hate-watch has a full pool to filter
getF1News(20), getFootballNews(20), getTennisNews(20)
// main section caps to perSport; hate-watch filters from the full 20
```

### Deduplication

`dedupeWires()` in `lib/live/rss.ts` removes near-duplicate articles that appear across multiple RSS sources covering the same story. Uses word-overlap on significant title tokens (60% threshold). Applied in each sport fetcher after `interleaveWires`.

### Interest-aware Reddit fallback

If `subreddits` is empty, derives subreddits from sports preferences:
- F1 → `formula1`
- Football → `soccer`  
- Tennis → `tennis`
Plus `personalfinanceindia` and `technology` as baseline interests.

---

## Schadenfreude (Hate Watch)

The "Schadenfreude" sub-section within Paddock Notes shows one negative article about a rival entity. Rules:

1. **Subject required** — if the hate-watch field is empty for a sport, nothing is shown for that sport.
2. **Negative signal required** — an article must mention the subject AND contain at least one keyword from `NEGATIVE_SIGNALS` (in `app/page.tsx`). Articles that only mention the rival without negative context are excluded.
3. **Scoring** — ranked by count of negative signal matches; most negative article wins.
4. **Total cap** — one article shown across all sports combined.

The label "Schadenfreude" is hardcoded in `PaddockNotesSection.tsx` and in the preference form labels for each sport's rival field.

---

## Preferences UI Components

### `PersonalizationForm.tsx`

Two reusable sub-components defined inline:

**`SubredditTagInput`** — tag chip UI for up to 5 subreddits. Enter/Tab/comma to add, Backspace to remove last, × button on each chip. Strips `r/` prefix, lowercases, removes spaces.

**`SuggestionInput`** — top-N quick-pick chips above a free-fill text input. Clicking an active chip deselects it (sets to `""`). Used for football player/club/national team and tennis player. Suggestion arrays: `FOOTBALL_PLAYERS`, `FOOTBALL_CLUBS`, `FOOTBALL_NATIONAL_TEAMS`, `TENNIS_PLAYERS` (10 items each).

F1 drivers use a chip multi-select directly (not `SuggestionInput`) since all 22 drivers come from the live roster — chips dim and become unclickable when 2 are already selected.

### `SettingsPageClient.tsx`

- **"Save changes"** → calls `savePersonalization()` → writes localStorage + cookies → navigates to `/` after 500ms.
- **"← Discard changes"** → `router.push("/")` with no save. Draft state is discarded.

---

## Development Notes

- Run with `npm run dev` (Next.js App Router, TypeScript strict mode)
- After preference changes, the server re-reads cookies on next page load — a hard refresh may be needed if cookies were written just before navigation
- Reddit API is blocked on Infosys/Zscaler network; expect empty grapevine section when developing on that network
- Always run `npx tsc --noEmit` after changes to verify no TypeScript errors before considering work done
- The `promoteWireToStories` function calls an LLM summarizer — in dev this may be slow or produce placeholder text depending on API key availability

---

## Changes in this pass (Grapevine fix, reader memory, design pass)

### Reddit (`lib/live/reddit.ts`)
- Official OAuth API with an application-only token (`REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`, free "script" app). Compliant `User-Agent`, per-subreddit in-memory cache (5 min), token cached until expiry.
- Falls back to public JSON (with UA) if unconfigured; returns `RedditResult { topics, status, note }` so the UI can print an honest one-line explanation instead of a blank.

### Editor's Picks (`lib/live/editors-picks.ts`) — replaces the fabricated X list
- Input is the *real* wire pool already fetched for the edition (World, Markets, Tech, Cards, F1, Football, Tennis). Stories that made a main slot are excluded.
- Deterministic scoring: named-interest match (from the `daily-index:interests` cookie) + "curiosity" signals − boilerplate signals + recency + feed position. Diversity constraints (≤2 per pool, 1 per domain, at least one non-personal delight).
- Each pick has a deterministic `why` line; `/api/summarize` may add a Gemini one-liner constrained to title+snippet (`lib/live/editorial-ai.ts`). If the model adds hashtags or pads, we keep the deterministic line.

### Cookie bridge additions
- `daily-index:interests` — `ReaderInterests` (names only) mirrored by `savePersonalization()`, parsed by `parseInterestsCookie()`.

### Reader memory (`lib/reader-memory.ts`, localStorage key `daily-index:reader-memory`)
- Records issue opens (date, issue no., hero headline), story expands/click-throughs (section, source, tags), and derives: streak, favourite section/source, weekday habit, personal On This Day (7/30/365 days), weekly recap, and a gentle `rankForReader()` re-sort within sections (ties only; needs ≥3 signals).
- Surfaces: `components/widgets/EditorsDesk.tsx` (Editor's Desk note + ledger under the hero), `/archive` → `components/archive/MorgueClient.tsx` (back issues + "The Week in Your Index"), Settings → "Forget me".
- Editor's Desk note: deterministic `fallbackEditorsNote()` renders instantly; `writeEditorsNote()` (Gemini) may replace it. Only aggregate counts + already-engaged headlines are sent.

### Design system
- `.paper-box` (heavy top rule, hairline bottom, no radius/fill) replaces the bordered-card pattern in all sidebars/widgets.
- `.font-mono` now forces tabular lining numerals; Market Pulse is a financial-page table.
- Theme switch adds `html.theme-transition` for 450 ms so every rule/fill/glyph cross-fades together (skipped under reduced motion; never on first paint).
- Sky Report has explicit `loading | ready | failed` states with a 9 s cap — never an infinite spinner.

---

## Changes in this pass (refresh, Reddit login, preferences-first, settings)

### Refresh edition (`app/api/refresh` + `PullToRefreshStamp`)
- The old button called `router.refresh()`, which re-ran the server component
  against warm Next Data Caches (`revalidate: 900–21600s`) + Reddit's 5-min
  in-memory cache — a pixel-identical re-render that looked dead.
- Now: POST /api/refresh clears the Reddit cache and calls
  `revalidatePath("/", "page")`, then the client does a full
  `window.location.reload()`. Every section, weather, and AI summary refetches.

### Login-with-Reddit (`lib/reddit-auth.ts`, `app/api/reddit/*`, `reddit_connection`)
- Same free script-app credentials; user adds the callback URL(s) to the app's
  "redirect uri" field. Scopes: `identity mysubreddits read`, duration permanent.
- Refresh token in Postgres (`reddit_connection`, single row id="default");
  access tokens refreshed transparently; subscriptions cached 24h in the row.
- `page.tsx` merges hand-picked subs (explicit, first) with subscription subs
  (cap 8 total); the Grapevine header shows `u/<name>'s subscriptions`.
- Browser only ever sees the username cookie `daily-index:reddit`.

### Preferences-first content (`lib/interest-match.ts`, `Story.personal`)
- `buildMatchers()` turns the interests cookie (+ roster-resolved driver names)
  into weighted matchers; `rankBriefsByInterest()` floats matches to the top
  of every section pool (stable sort — nothing is ever filtered out).
- `buildSectionsSync({ personalize })` tags stories `personal: "<interest>"`;
  `pickHeroStory` gives tagged stories +25 toward the lead; `StoryArticle` and
  the hero print a "For you · <interest>" kicker explaining the prominence.
- New Topics input (ch. IV) feeds the same matchers at weight 6 everywhere.

---

## Changes in this pass (summaries, cards, settings, front-page design)

### Why there is a database at all
- Postgres holds exactly one thing: the `reddit_connection` row (Login-with-Reddit
  refresh token + cached subscription list). Refresh tokens must never reach the
  browser, so they need server-side storage. Every other preference lives in
  localStorage + cookies. Without Reddit login the app is fully stateless.

### Summaries (`lib/live/summarize.ts`, `EditionView.tsx`)
- Prompt rewritten for natural newsroom prose; the "It matters because…" template
  and other tells are banned in the prompt *and* stripped post-hoc (`humanise()`).
- Each article is sent with its HEADLINE. Fetched page text is only used if it
  matches the headline (paywall/homepage guard); returned summaries that don't
  match their headline are rejected and the RSS snippet is kept.
- Root cause of headline/body mix-ups: summaries were cached in sessionStorage
  by *positional* id (`wire-dateline-0`) which is reused across reloads while the
  feed order changes. The cache is now keyed by article URL (`summaries:v2`).

### Cards
- `Personalization.cardFollowing: string` → `cardsFollowing: string[]` (checkbox
  list of names). `ReaderInterests.card` → `cards`. Old values migrate on load.
- `lib/config/cards.ts` fact files corrected against issuer headline terms.

### Settings
- "← Back to the paper / Discard changes" resets the draft and calls
  `router.back()` (instant, from router cache) when settings was opened from the
  paper (`SettingsLink` sets a sessionStorage marker); otherwise `router.push("/")`.

### Front page
- Hero + Editor's Desk are one grid (lead 2/3, desk in the right column).
- Every section is wrapped in `.paper-section`: double top rule, identical
  padding, `§ n / N` folio. `SectionHeader` is uniform; no negative margins.

### Reddit / Devvit
- Devvit (`@devvit/web/server`) is Reddit's platform for apps that run *inside*
  Reddit (custom posts, mod tools) and is hosted by Reddit — it cannot be imported
  by an external Next.js site, and Devvit explicitly cannot read a user's
  subscribed subreddits. Standard OAuth (this app) remains the right integration.

---

## Changes in this pass (refresh → summarise, "tap to update")

### Bugs
1. **"Refresh edition" / hard reload never re-summarised.** Summaries were
   cached in `sessionStorage` under `daily-index:summaries:v2:<date>`.
   `sessionStorage` survives `location.reload()` (and DevTools "Disable cache"
   only affects HTTP). The mount effect returned early whenever that key
   existed — even when it held `{}` from a failed call, or covered none of the
   articles in the freshly printed edition — so `/api/summarize` was never
   called again that day.
2. **"Tap to update" sometimes did nothing.** The result lived only in
   `sessionStorage` and the tap re-read it. If `setItem` threw, the map was
   empty, the route answered 500 (still JSON, so `.then` ran), or every
   "summary" was the RSS snippet handed straight back (no `GEMINI_API_KEY`,
   off-topic rejections), the banner said *ready* but applying changed nothing.

### Fixes
- `lib/summary-cache.ts` — single home for the client AI cache (`summaries:v3`
  record `{ byUrl, asked, extrasAsked }`, brief/picks/note keys, purge helper,
  one-shot `daily-index:force-summarize` flag).
- `PullToRefreshStamp` purges those caches and sets the force flag *before*
  reloading, so the new edition is summarised from scratch.
- `EditionView.runSummarize(force)` replaces the mount effect:
  - applies cached summaries for matching URLs silently, then asks the model
    only about URLs it has never asked about (new stories after a reload);
  - `force` (refresh button, retry) ignores the cache entirely;
  - keeps the response in a ref (`pendingRef`) so the tap applies from memory;
  - shows *ready* only when ≥1 summary differs from what is printed, otherwise
    a self-dismissing "Edition already up to date" pill;
  - non-2xx / network / 90 s timeout → "Summaries unavailable — tap to retry".
- `/api/summarize` and `/api/refresh` send `Cache-Control: no-store`; the
  refresh route also revalidates the root layout.

---

## Preference-driven digest (the current pipeline)

The news pages are now built by a single preference-driven AI pass instead of
per-article summarisation. Non-news surfaces (F1 sidebar, weather, Market
Pulse, Grapevine, Editor's Desk, Reddit) are untouched.

### Data flow

```
mount (EditionView)
  └── runDigest() ── POST /api/digest { preferences } ──► server
        server: collectCorpus()          (existing fetchers, unchanged:
                  World/India, Markets, F1, Football, Tennis, Tech, Cards;
                  URL-dedupe + dedupeWires)
                  (RSS snippets only; age window + literal excludes applied)
                generateDigest(prefs)    (two Gemini calls, structured JSON:
                  1. selection — titles + snippets → per-section indices
                     + At a Glance picks (~13k tokens)
                  2. full text fetched for the shortlist only (~30 pages)
                  3. writing — summaries + gists for the shortlist
                  Indices are rehydrated into real title/url/source; grouped
                  picks must mention their group. Heuristic fallback when no
                  GEMINI_API_KEY or selection fails; if writing fails the
                  selection stands with condensed article text)
  ◄── { sections: { [sectionId]: [{ title, summary, source, url,
        publishedAt, group?, priority, matchedEntity? }] }, engine, … }
  └── banner "Your digest is ready — tap to update"
        tap → applyDigest(): digest articles become Story[] and pour into
        their display slot; slot-less sections render as standalone
        <DigestSectionView/> after the standing sections.
```

### Preferences

- Shipped defaults: `src/lib/preferences/default-preferences.json` — hand-editable.
- Reader edits persist to localStorage only (`daily-index:digest-preferences`),
  loaded via `loadDigestPreferences()`; missing/corrupt copies fall back to the
  shipped JSON. `version` + `migratePreferences()` handle future shape changes.
- Section types: `topic` (flat best-fit list), `grouped` (N per group, e.g.
  World by country), `custom` (free-text instruction). Every section may carry
  `watchEntities`, `preferredSources`, `excludeKeywords`, `prompt`, and a
  `slot` (dateline | paddock-notes | circuit-board | ledger | plastic-points)
  naming the existing paper section it feeds. `global` holds tone, exclude
  keywords, max age, and summary length.
- Settings page → "Digest preferences" tab edits the same JSON in a GUI
  (structured fields + raw JSON view) and saves on-device; the front page
  listens for the change event and re-runs the digest.

### Trigger flow

- Digest result waits in memory; the existing bottom banner becomes
  "Your digest is ready — tap to update". Tapping applies digest + pending
  summaries together.
- Today's digest is cached in localStorage keyed by date + preferences hash
  (`src/lib/digest-cache.ts`); a reload re-applies it silently, and editing
  preferences invalidates it automatically. "Refresh edition" purges it.
- `/api/summarize` still runs, but only for hate-watch stories, Editor's Picks
  blurbs, and the Editor's Desk note. The "at a glance" brief is derived from
  the digest itself (no extra model call).

---

## Server-built editions (current)

The digest is no longer generated per browser visit. The server builds one
**edition per set of preferences per day** and stores it.

- **Identity is the preferences, not the person.** Preferences stay in the
  reader's localStorage. `POST /api/edition { preferences }` normalises and
  hashes them (sha256, 16 hex chars); the hash keys the edition. Identical
  preferences share one edition; changing any preference points the reader
  at a different one. The hash is mirrored to the `daily-index:edition`
  cookie for server-rendered pages (the archive).
- **States:** ready (with digest) | building | failed | missing. The client
  (`lib/edition-client.ts`) POSTs, then polls `GET /api/edition?hash&date`
  every 4 s while building. The pressroom overlay and "tap to update" banner
  are driven exactly as before.
- **Background builds:** `lib/server/editions.ts` takes a lock
  (`lock:{date}:{hash}`, 180 s), records `status`, and builds in `after()`.
  A second request for the same edition joins the running build.
- **Stale-while-revalidate:** a ready edition older than
  `EDITION_STALE_HOURS` (6) is served at once while a rebuild runs; a
  heuristic edition built while AI was configured is retried after 30 min.
- **Refresh edition** sets a one-shot flag; the next mount POSTs
  `force: true` and holds the overlay until the fresh build lands.
- **Settings save** POSTs the new preferences immediately (`keepalive`) so
  the build is already running when the reader returns to the paper.
- **Limits:** visitor-triggered builds are capped per day globally
  (`EDITION_BUILDS_PER_DAY`, 60) and per IP (`EDITION_BUILDS_PER_IP`, 8).
- **Cron** (`vercel.json`, 00:00 UTC = 05:30 IST): `/api/cron/daily` builds
  the default edition inline and fans out `/api/cron/build` (202 + `after()`)
  for editions read in the last 3 days (max 10). Both need `CRON_SECRET`.
- **Dates** follow `NEXT_PUBLIC_EDITION_TIME_ZONE` (Asia/Kolkata), not UTC.
- **Store** (`lib/server/store.ts`): Upstash Redis when `KV_REST_API_*` or
  `UPSTASH_REDIS_REST_*` is set; otherwise process memory. On Vercel without
  Redis, builds run inline and the response carries the edition directly.
  Every Redis key is prefixed with `VERCEL_ENV` (`production:`, `preview:`,
  `development:`; override with `STORE_NAMESPACE`), so one free database
  can serve all environments without preview data reaching the live archive.

## Settings (current)

Four short tabs with one Save bar: **News** (always prioritise / never show
me tags, summary length and voice presets), **Sections** (one collapsed card
per section — name + a one-line summary; "Edit" expands it: story count or
countries, watched entities, note to the editor; "+ Add a section" makes a
free-text section; raw JSON under "Advanced"), **Sports** and
**Page & Reddit** (the `PersonalizationForm` chapters, via its `parts` prop —
onboarding still renders all chapters). `/settings#sections` deep-links a tab.
Save writes both preference stores and POSTs `/api/edition` so the new
edition starts building before the reader is back on the paper.

## Stable summaries and live updates

- Every written summary / gist is cached server-side for 3 days, keyed by
  article URL + summary length + voice + section guidance. A rebuild
  (Refresh edition, cron, stale rebuild) only writes articles that are new,
  and only fetches their pages. Selection runs at temperature 0.
- There is no "tap to update": a finished edition replaces the page as soon
  as it arrives — under the pressroom overlay before it fades, or in place
  when a background rebuild lands.

## Front page render (current)

- If the reader's edition for today is already stored, `app/page.tsx` reads
  it (edition cookie → `readEdition` + `readStoredPrefs`) and passes it to
  `EditionView` as `initialDigest`; `lib/preferences/project.ts` maps it onto
  the sections, so the first HTML is the finished paper — no overlay, no
  swap. The browser still checks for a newer build in the background.
- Word of the Day comes from Merriam-Webster's free feed (cached 6 h). It was
  a Gemini call on every render — ~1.2 s of each page load.
- Measured on a local production build: repeat loads ~0.05 s (was 1.2–1.3 s).

## F1 sidebar and markets (current)

- The sidebar applies fresh cached parts instantly and loads the rest with
  ONE streamed request, `GET /api/f1?parts=a,b,c` (NDJSON). The server starts
  every part at once and writes results in the requested order, so the
  sidebar still fills map → drivers → calendar → constructors → standings →
  results. `?part=` remains for the per-block "Try again".
- OpenF1 free tier: 3 req/s, 30 req/min. Every OpenF1 call waits for a slot
  in both windows (`waitForOpenF1Slot` in `lib/live/f1.ts`) and retries once
  on 429. A cold sidebar now makes 4 OpenF1 calls (was 7); warm, none.
- Drivers' and constructors' tables come from Jolpica alone (points and wins
  in one call each); Jolpica team names are mapped to OpenF1's.
- "Last race" is the latest Race session that started ≥ 90 min ago — no
  longer `session_key=latest`, which showed practice on race-weekend Fridays.
- Market Pulse: one Yahoo `spark` request for all six indices (was six), and
  a missing index no longer blanks the whole panel.

## Politics and live blogs (current)

- `politics-filter.ts` is a short list of unambiguous party / electoral
  terms, checked against **World headlines only** (`politicsFilter` on the
  World feeds). It used to check every feed's title + snippet against a
  broad list including leaders' names, "president", "minister", "protest"
  — dropping 65/297 World items (mostly geopolitics), Markets budget news,
  EU tech regulation and FIA stories. Now: 9/297, headline-only.
- `global.avoidPolitics` (Settings → News → "Skip party politics", on by
  default) adds a judgement rule to the selection prompt: skip elections,
  campaigns and party fights; keep geopolitics and consequential policy.
- Live blogs (`… live:`, `live updates`, `as it happened`, a `/live/` URL
  segment) are dropped in `collectCorpus` — the model picked them despite
  the prompt saying not to.

## Gemini access (current)

- `lib/server/gemini.ts` is the only module that talks to Gemini, on
  Google's current SDK (`@google/genai`; the old `@google/generative-ai` was
  deprecated). `generateJson(prompt, { schema, temperature, timeoutMs })`
  returns JSON text; `aiEnabled()` is the single on/off check. Model:
  `GEMINI_MODEL`, falling back to `gemini-3.1-flash-lite`.
- Callers: the digest (selection + writing, with response schemas),
  `batchSummarize` (hate-watch), pick blurbs and the Editor's Desk note.
- `/api/summarize` no longer writes an "at a glance" brief — the page always
  used the one derived from the edition, so it was a wasted call per visit.

## Redesign: "signal" (supersedes the older Design system notes above)

Layout takes its cue from Tablet Magazine (hairline column rules, a centred lead,
numbered rails); colour from The Verge (near-black, mint signal, ultraviolet).

- **Tokens** (`app/globals.css`): `--paper --surface --ink --ink-soft --ink-faint
  --rule --accent --signal --hot --up --down`, redefined under
  `html[data-edition="evening"]`. Morning is off-white with ultraviolet
  accents; evening is near-black with mint. Each section has a hue
  (`--hue-world`, `--hue-f1`, …, listed in `SECTION_META[key].hue`); the
  section wrapper sets `--section-hue` and its header rule, links, hover
  underlines and bars use it.
- **Fonts** via `next/font` in `app/layout.tsx`: Newsreader (headlines + text),
  Schibsted Grotesk (labels/UI, `font-label`, `font-sans`), Big Shoulders
  (`font-display`: section names, numbers, wordmark), IBM Plex Mono (data).
  A `beforeInteractive` script sets `data-edition` before paint, so there is
  no theme flash.
- **Particles** (`lib/particles.ts`): `ParticleField` rasterises text off-screen,
  samples it into points with homes, springs them home, scatters them around
  the pointer and lights moving points in the accent. Used by the masthead
  (`ParticleWordmark` — click cycles wordmark → date → issue → temperature)
  and the edition-prep overlay (a swarm that condenses into the name as the
  overlay lifts). Stops when off screen or the tab is hidden; reduced-motion
  gets one static frame.
- **Cover art** (`story/CoverArt.tsx`): a halftone field seeded by the headline,
  in the section hue, drifting at ~30fps with a pointer ripple. Stands in for
  photos the feeds don't have, and says so on the plate.
- **Motion** (`chrome/MotionRuntime.tsx` + CSS): anything with `data-reveal`
  gets `.is-in` when it scrolls into view (IntersectionObserver, plus a
  MutationObserver for content that streams in). CSS hooks: `.mask-rise`
  (section names), `.rule-draw`, `.bar-grow` (standings, meters),
  `.stroke-draw` (sparklines, sun arc), `.gauge-needle`, `.sun-orbit`.
  All of it is off under `prefers-reduced-motion`, and nothing is hidden
  without JavaScript (the `js` class gates it).
- **Chrome**: `chrome/TopBar.tsx` (sticky; wordmark appears once the masthead
  scrolls away; section links with a scroll-spy underline in the section's
  hue; two rows on phones), `masthead/Ticker.tsx` (mint marquee of indices,
  next GP, weather, word of the day). Section numbers come from a CSS
  counter on `.edition-body`.
- **Front page**: three columns — `story/AlsoToday.tsx` (top story of each
  other desk) | `HeroStory` | `EditorsDesk`. Sections use `.story-grid`
  (`is-paired`: the first story leads full width, the rest pair up).

### Redesign, round 2

- **Front page**: `story/Briefing.tsx` (the AI "at a glance" picks as numbered one-liners that link down to the story, or out to the source) | lead | `EditorsDesk` + Word of the Day + On This Day. The floating At a Glance pill and "Also in this edition" are gone.
- **Signal row** (`masthead/SignalRow.tsx`): static cards for markets, the next GP, weather and the word of the day, each in its section hue and linking to its section. Replaces the scrolling ticker.
- **Share** (`extras/ShareButton.tsx`): opens a sheet with a 1080px card rendered from the story (html-to-image), then native share (files), copy image, download, WhatsApp / X / LinkedIn / Telegram links and copy link. Sits beside "Read at".
- **Why it matters**: the writing pass returns an optional `why` per summary (`DigestArticle.why` → `Story.why`), cached under `why:` next to the summary (summary keys carry a `v2` marker).
- **Lengths**: presets are 50 / 90 / 140 words (default 140); saved 35 / 60 / 100 are upgraded in `storage.ts`. Full text sent to the writer is 4,000 characters.
- **Grouped sections** print `max(5, groups × perGroup)` stories: when a listed country has nothing, the model backfills with another country and names it; the country shows as the story kicker.
- **Section headers** are just the name and one rule. Default section order: World, F1, Sports, Money, Markets, Tech, Weather, Grapevine (readers still on the old default are moved over).
- **Onboarding** (`onboarding/OnboardingGate.tsx`): full-screen welcome with a particle greeting, then three steps (city, sports, order).
- **Archive**: "Back issues" — the latest edition as a front page, then one row per day (lead, story count, desks, Nifty close). The Morgue (reading stats) was removed.

### Round 3

- Sections are picked with one spare (`sectionTarget` in `prompt.ts`); stories past the count carry `Story.reserve` and are printed only by the section that lent the front page its lead. Thin sections are topped up from their own wire (`backfillFor` in `digest.ts`; World files extras under the country in the headline via `countryIn`).
- "Why it matters" display is `Personalization.showWhy` (default off), applied as `html[data-why]` so CSS hides `.why-line`.
- A section lead (`StoryArticle lead`) sits beside a `CoverArt` plate.
- F1Sidebar renders two blocks into the section grid (root is `display: contents`): the race desk beside the stories, the championship tables full width below.
- `EditionRecord.v` / `BUILD_VERSION` in `editions.ts`: an edition built by older code is treated as stale and rebuilt in the background.

### Round 4

- **Schadenfreude** is picked by the AI editor: `global.rivals` (from the sports settings via `lib/preferences/paper.ts` → `withSportsSettings`) asks the selection for at most one genuinely-bad-day story per rival (`rivals` in the selection schema, required). The stories are summarised as a synthetic `__rivals` section and returned as `DigestResult.rivals`; the old keyword matcher in `app/page.tsx` is gone.
- **Markets** default is "Markets & Economy": mostly Indian, some global. CNBC, MarketWatch and FT feeds joined the Markets pool; readers still on the old India-only default are upgraded in `storage.ts`.
- **Live markets**: `/api/markets` (60s Yahoo cache) polled every minute by `useLiveMarkets` while the tab is visible; tiles, mood and the signal card update in place.
- **Archive** is a calendar (`CalendarMonth` in `app/archive/page.tsx`) with a back link and a floating "Today’s paper" button.
- **Sports settings**: one card per sport, driver dropdowns, datalist suggestions, one Rival field.

### Round 5

- **Two Cities** (`two-cities` section, slot `two-cities`, `components/sections/TwoCitiesSection.tsx`): a `grouped` digest section with `groupBy: "city"` (default Bengaluru + Ranchi, 3 each). Each city is its own corpus pool named after it (`lib/live/cities.ts`, `CITY_FEEDS` in `feeds.ts`); unknown cities fall back to a Google News search feed. City sections never borrow other places (`isCitySection` in `prompt.ts`); a story from the city's own desk or naming its state counts for it (`mentionsGroup`). Saved preferences get the section once through the v1 → v2 migration in `storage.ts`, so removing it sticks. It prints only when the digest filled it.
- **Google News feeds** (`googleNews: true`): the outlet comes from `<source url>`, the " - Publisher" suffix is cut from the title, the link-list description is dropped.
- **Sky Report night mode**: `lib/sky.ts` works out day/night from the city's clock (`utc_offset_seconds` from Open-Meteo), and `useSkyClock` (`lib/use-sky-clock.ts`) re-renders every minute. After sunset the arc runs sunset → sunrise with the moon in tonight's phase, stars, a moonlight hue (`--hue-night`), night-time copy (`WeatherNow.night`) and moon icons. It also shows today's low/high, feels-like and humidity. The weather cache key is `v2`.
- **Feed audit (Sept 27 2026)**: dropped ESPN football/tennis (empty) and FIA (timeouts); added The Hindu national (World/India), BusinessLine markets, Tennis Majors and Guardian technology.

## Data flow at a glance (current)

| Data | Fetched where | When | Stored |
|---|---|---|---|
| Digest (all news sections, At a Glance, Schadenfreude) | server, `generateDigest` via `/api/edition` or the cron | first visit of the day per preferences hash; cron 05:30 IST; rebuild after 6 h or on Refresh | Redis `edition:{date}:{hash}` (default edition kept for the archive, others 60 days); summaries `w:*` 3 days |
| Raw RSS for the first HTML (World, Markets, Tech, sports) | server, `app/page.tsx` | every page render; `fetch` revalidates every 30 min | Next.js data cache |
| F1 schedule | server, `app/page.tsx` | page render | Next.js data cache |
| F1 standings / results | browser → `/api/f1` | after the page loads | Next.js data cache |
| Market indices | server on render, then browser → `/api/markets` | render, then every 60 s while the tab is visible | 60 s route cache |
| Weather + AQI | browser → Open-Meteo directly | on load, at most every 15 min | sessionStorage `daily-index:weather:v2:*` |
| Editor’s Desk note, pick blurbs | browser → `/api/summarize` | once per browser session per day | sessionStorage, keyed by date |
| Reddit (Grapevine) | server | page render | Next.js data cache |
| Reader's preferences | browser | settings save | localStorage (`daily-index:digest-preferences`, `daily-index:personalization`); a copy in Redis `prefs:{hash}` for the cron |
| Digest copy for instant reloads | browser | after each edition arrives | localStorage, keyed by date + hash |

### Round 6

- **Two Cities is even**: a city section asks for exactly `articleCountPerGroup` per city with no spare (`sectionTarget`, the per-group cap in `rehydrateSection`, backfill). The front-page lead never comes from it (`pickHeroStory` skips `two-cities`), so it needs no reserve story.
- **Market Pulse by region**: 16 indices (India, US, Europe, Asia; four each) in two Yahoo spark batches. Each region has its own mood (`MarketMood.region`): average move, breadth and, for India and the US, the day's change in India VIX / VIX. Region cards double as tabs and show open/closed from each lead exchange's hours (holidays not known). **Commodities in ₹** (`Commodity`): COMEX gold/silver/copper, WTI crude and Henry Hub gas converted at USD/INR. Gold and silver include 6% import duty (`BULLION_DUTY`) and exclude GST. The day's change combines the benchmark's move with the rupee's.
- **Sky Report**: `WeatherNow.blocks` gives the next four parts of the day (morning 06–12, afternoon 12–17, evening 17–21, night 21–06), each with its highest chance of rain, from Open-Meteo hourly data. The reader's other Two Cities cities appear as smaller `CityMini` cards. The weather cache key is `v3`.
- **Travel mode (Postcard)**: "Use my location" (`TravelButton`) asks for the browser's position once and rounds it to ~1 km. It then POSTs `/api/travel`, which reverse-geocodes with Nominatim (zoom 8 = the metro, suffixes like "Urban"/"Emirate" trimmed) and reads two Google News searches: the city, plus the country abroad or the state inside India. The state is kept in localStorage (`daily-index:travel`), and headlines are re-read after an hour without asking for the location again. The Postcard section prints first, the masthead weather card switches to that place, and "I'm home" clears it all.
- RSS: all CDATA markers inside a description are stripped (TOI puts one mid-description).

| Data | Fetched where | When | Stored |
|---|---|---|---|
| Travel place + headlines | browser → `/api/travel` (Nominatim, Google News) | on "Use my location"; re-read after 1 h | localStorage `daily-index:travel` |
| Travel weather | browser → Open-Meteo by coordinates | on travel / 15 min | sessionStorage `daily-index:weather:v3:@lat,lon` |
| Commodities, regional moods | with the indices (`/api/markets`) | every 60 s | 60 s route cache |

### Round 7

- **IPO watch** (`lib/live/ipos.ts`, `components/widgets/IpoWatch.tsx`, `/api/ipos`, `/api/ipos/[id]`): mainboard IPOs from announcement to two days after listing. NSE (`all-upcoming-issues`, `ipo-detail`, `public-past-issues`) gives the issue list, symbols, category-wise subscription, issue facts and documents. investorgain.com's live GMP table (parsed by its `data-label` cells) gives the GMP, the issue size in crores and the allotment/listing dates. Missing dates follow SEBI's T+3 rule and are marked as estimated. The board and a daily GMP reading per IPO are kept in the store (`ipo:board`, `ipo:gmp:{id}`) for the GMP trend. On the page, five rows show by default: name and size, an opens→closes→lists track, and a GMP pill (red <20%, orange 20–30%, green 30%+). A row opens a sheet with everything, including listing-day prices from Yahoo (`SYMBOL.NS`).
- **Market charts** (`lib/live/charts.ts`, `/api/chart`, `MarketChartSheet`, `PriceChart`): any index, commodity or crypto tile opens a TradingView Lightweight Charts view with 1D–5Y ranges, area/candles, volume, a pointer readout and range stats. Commodities are converted to rupees bar by bar at the USD/INR rate of the same moment. The library loads only when a chart opens.
- **Crypto**: BTC/USDT and ETH/USDT from Binance's public market-data mirror (`data-api.binance.vision`, reachable from any region). 24-hour change; polled with the other markets.
- `components/extras/Sheet.tsx` is the shared popup shell.
- **GMP refresh schedule** (`gmpHoursFor` / `latestGmpSlot` in `ipos.ts`): the GMP page is read at 10:00 IST daily before an IPO opens, at 10:00 and 14:00 on its bidding days, hourly 10:00–18:00 on closing day, and 10:00 daily after that through listing day. The busiest IPO on the board sets the pace. The last reading is kept in the store (`ipo:gmp-table`) and served between slots. There is no background job: the first request after a slot does the read. NSE figures keep their own short caches.

### Round 8: ideas from two friends' papers

Taken from a read of The House of 1400 and kylo-news (Sept 30 2026), keeping only what improves this paper.

- **New pools** (`feeds.ts`): **India** is the national desk (The Hindu national, HT India, NDTV, Deccan Herald India, TOI top). Before this round, the only national feed was one of eight in World. **Money** covers regulators and personal finance: RBI press releases and notifications (RSS), TRAI, SEBI and PIB through Google News, ET Wealth, Mint Money and Insurance, BS Personal Finance, and Google News searches for income tax, GST and credit-card changes. Regulators get a 72-hour window. The selection prompt says a Money story that changes what people in India pay, earn, save, borrow, invest or insure belongs in the markets desk.
- **Google News signal** (`signals.ts`): six Google News pages (India top, nation, world, business, tech, sports) are read for ranking, not printed. Stories are grouped by Google's own lists of other outlets carrying the same story. Headline overlap is not used, because it splits or merges stories wrongly. Each corpus article that matches a story gets `coverage` (outlets carrying it), `lead` (position on India's top page) and an `event` id shared with other versions of that story, and the selection prompt reads all three. Up to 8 leading stories that no feed of ours carried are added to the corpus, filtered for party politics; sports pages are only used as a signal.
- **Google News links decoded** (`google-links.ts`): printed `news.google.com/rss/articles/…` links are traded for the publisher URL through Google's own `batchexecute` call, using the signature on the article page. Only printed stories are decoded, at most 30 per build, three at a time. Results are cached for 30 days (`gn:{id}`). The first 429 stops decoding for that build, and anything left keeps its Google link. Full text is fetched from the decoded URL.
- **Build report** (`build-report.ts`): each build records, through AsyncLocalStorage:
  - every feed (ok, status, items, kept, ms, error)
  - stage times (collect, selection, links, fullText, writing)
  - articles per pool, and signal matches and additions
  - full-text and link-decoding counts, and copy-check counts
  - printed stories, distinct domains and Google links left
  - a `degraded` list: any pool under 3 articles, fewer than 80% of feeds answering, or a heuristic fallback

  It is stored at `report:{date}:{hash}` for 14 days, outside the edition. `/api/health` shows a summary of the default edition's last build, and `/api/health?report=1[&date=]` returns the full report.
- **Copy checks** (`copy-check.ts`): AI tells in written summaries, "why" lines and gists are found: em dashes, words like pivotal/crucial/landmark/robust/notably/amid, "-ing" tails, "not just X, but Y", and "experts say". Flagged items go back to Gemini once, with the problems named. A rewrite is kept only if it has fewer tells and stays on the story. Dashes are then fixed mechanically. The writing prompt names the same rules.
- **Published moods** (`published-markets.ts`): India's gauge is Tickertape's Market Mood Index and the US gauge is CNN's Fear & Greed Index (which only answers with CNN's Origin/Referer). Each shows the publisher's own earlier readings, keeps our VIX line, and links to its source. Europe and Asia keep the paper's formula, and so does India or the US when its publisher fails.
- **IBJA bullion**: the gold (999, per 10 g) and silver (999, per kg) tiles show IBJA's published AM/PM rate. The day's change is taken against the previous day's last rate, and the sparkline comes from IBJA's roughly four months of daily rates. COMEX in rupees stays as the chart and as the fallback.
- **Last good reading** (`last-good.ts`): the markets board is saved to `live:markets:last`, at most every 5 minutes. When an index, mood, commodity or coin is missing from a read, its last reading returns in its place, marked `stale` with `asOf`, and the tile shows "as of …". A total Yahoo outage serves the whole last board, and readings older than 4 days are dropped.
- **The Week Ahead** (`ahead.ts`, `/api/ahead`, `WeekAhead.tsx`): the next seven days in IST under the front page:
  - RBI policy decisions, from RBI's 2026-27 MPC schedule, hand-kept in `RBI_DECISIONS`
  - Fed decisions, parsed from the FOMC calendar page (14:00 Washington time, converted to IST)
  - NSE trading holidays
  - Google's India public holidays (observances left out)
  - IPO open, close and listing dates, grouped per day
  - the next F1 weekend's sprint, qualifying and race

  The next policy dates beyond the week show as "Later". The route is cached for 30 minutes at the edge.

- **The Nation** (`the-nation` slot, `NationSection.tsx`): India's national news in its own section, after Dateline. Dateline is world-only now: its default groups drop India, and its note keeps an India story only when it's about India abroad. The default `india` section (topic, 5 stories) reads from the India pool and the Google News leads. Preferences v3 (`upgradeV2ToV3`) adds the section once to every saved copy. A World section still on the old default loses its India group, while one the reader edited is left alone. `loadPersonalization` inserts `the-nation` after `dateline` in saved section orders.

| Data | Fetched where | When | Stored |
|---|---|---|---|
| Google News signal pages | server, inside each edition build | per build (30 min fetch cache) | not stored; matches recorded in the build report |
| Decoded Google links | server, after selection | per build, printed stories only | Redis `gn:{id}` 30 days |
| Build report | server, each build | per build | Redis `report:{date}:{hash}` 14 days |
| Tickertape MMI, CNN Fear & Greed, IBJA | with the indices (`/api/markets`) | every 60 s request; publishers cached 10–30 min | last good board in Redis `live:markets:last` |
| Week Ahead | browser → `/api/ahead` | on load | edge cache 30 min; sources cached 12 h |

### Round 9: odds, Valorant, In Brief, market hours

Built Oct 1 2026 from the reader's own interest profile (see the plan in the conversation): Paper Rex and the VCT majors; odds on sport they follow, money now and then, wars, elections and India policy, and AI; nothing on US state politics, crypto or awards.

- **Market hours** (`market-hours.ts`, `market-holidays.ts`): each index belongs to an exchange with its own session and holidays (NSE's list, NYSE rules computed, GOV.UK bank holidays, Euronext/Xetra rules, Google calendars for Japan, Hong Kong, China and Korea). Region chips say "opens Thu 09:15" in the reader's time; the folio says when the region reopens. The page polls every minute while anything trades and every ten when only crypto does, and a closed market's numbers are never replaced (`mergeOpenMarkets`, 20 minutes' grace for the closing print).
- **Mood zones** (`mood-zones.ts`): the dial lights the zone the reading is in, at the publisher's own cut-offs (Tickertape 30/50/70, CNN 25/45/55/75, ours 25/40/60/75), red for fear through grey to green for greed. The enlarged chart is green or red by the range's direction.
- **IPO order** (`ipo-order.ts`): open (closing soonest first), listing today, waiting to list, upcoming, just listed; ties by GMP then size. The stage is recomputed on the page so an open tab re-files itself at midnight.
- **Clutch** (`valorant.ts`, `/api/valorant`, `ClutchSection.tsx`): Valorant's majors (Champions, Masters, VCT Americas/EMEA/Pacific/China, EWC, LOCK//IN) from Riot's esports API (valorantesports.com's backend, its public key), VLR.gg's RSS and Polymarket's match and winner prices. One band: your teams (next match with odds, last result, status worked out from the win/loss record and whether the market still prices them), the running event (progress, next matches, favourites), three headlines. Off-season it shrinks to dates and news. Team picker in the section (up to 3, `valorantTeams`, default PRX). The Week Ahead carries your teams' matches and an international's final. Server-rendered with a 2.5 s cap; times in IST so server and client agree.
- **Straw Poll** (`odds.ts`, `odds-pick.ts`, `/api/odds`):
  - Reading: Polymarket by subject tags plus a search per followed name; Kalshi by series, found weekly from its own series list (no hand-kept tickers), three calls at a time with retries. Polymarket's pages run to megabytes, so they skip Next's data cache; the cleaned reading is kept in the store (`odds:base:v1`, each name `odds:q:v1:*`) for 15 minutes and refreshed after the response (`after()`), stale up to 12 hours.
  - Cleaning: andaaza's rules (settled 98.5%+, decided past due at 95%+, side bets, price and date ladders), the reader's exclusions, and cross-site merging by title or by shared front-runners (aliases: Claude = Anthropic, "no change" = "maintains rate").
  - Choosing, on the page with the reader's follows: about them, real money ($100k in all; less for F1, India, Valorant; $5k for a follow), worth a look today (a follow, a story in today's paper, a 5-point move on a tight market with real trade, settling within a week, or $500k traded today). Five cards at most (one money card, never two alike); one line at the foot of a section only for a follow, today's news or an 8-point move; a market about a story prints under that story instead (`StoryOdds`), three at most. Each market prints once.
  - Detail sheet: every contender with yesterday's mark, money, settle date, rules, the other site's price, and a week's chart (Polymarket's CLOB history; the paper's hourly Kalshi snapshots `odds:snap:v1:*`).
  - Track record (`odds-record.ts`): daily snapshots of every favourite (`odds:day:v1:*`); the morning cron scores questions that settled against the favourite a week before, and Straw Poll prints the month's score once ten have settled.
- **In Brief** (`digest.ts`, `InBrief.tsx`): leading stories (India top page first 12, or 3+ outlets) that no section or At a Glance printed go to the foot of The Nation, Dateline, The Ledger or The Circuit Board by pool, four each, with a one-line gist from the same writing call. Party politics is held back for readers who skip it. `BUILD_VERSION` 5.
- **Market Pulse extras**: a rates row (`rates.ts`, `/api/rates`): RBI repo (RBI home page), Fed funds (the New York Fed's EFFR record, FRED as backup, the last range kept if both fail), US 10-year (Yahoo), FII/DII (NSE, month total built from kept days), and the markets' odds on the next decision. Index cards tag a day at twice the month's usual move; India's mood lists Nifty 50 breadth (NSE allIndices); the chart sheet adds the 52-week range and 50/200-day averages.
- **More sources**: severe-weather alerts from NDMA's Sachet near the reader's places (`alerts.ts`, banner in Sky Report); civic searches for the reader's cities; Techmeme, OpenAI, DeepMind and an AI-labs search in the tech pool.

| Data | Fetched where | When | Stored |
|---|---|---|---|
| Exchange holidays | with the indices | 12 h fetch cache | no |
| Valorant (Riot, VLR, Polymarket) | page render + browser → `/api/valorant` | every 2 min while an event is on | edge cache 2–15 min |
| Odds | browser → `/api/odds` | on load | Redis `odds:base:v1` 15 min fresh / 12 h stale; snapshots hourly and daily |
| Odds verdicts | cron | daily | Redis `odds:record:v1` |
| Rates and flows | browser → `/api/rates` | on load | edge 30 min; FII/DII days in Redis `fiidii:v1:*` |
| Weather alerts | browser → `/api/alerts` | on load | edge 10 min |

### Round 10: odds everywhere, Clutch's bracket, who's buying, the Search Bar

Built Oct 1 2026 after the reader's review of round 9: more odds but only the relevant ones (tech and AI, geopolitics, then sport), the exact questions they follow on Polymarket and Kalshi, why prices move, a Valorant bracket and head-to-heads, FII/DII buying and selling, Google Trends by country, and no women's sport.

- **Odds in every section** (`odds-pick.ts` `layoutOdds`, `odds/OddsCard.tsx`): three or four standing questions at the foot of World (4), Tech (4), F1, Sport, Money and the Grapevine (film); India and the cities get none. Subjects weigh tech 1.3, world 1.2, sport 1, money and film 0.85. Foreign elections need $2M traded unless they're news; a football follow reaches into world markets only for football. Each card: why it's here, the question, the favourite's chance beside a week's sparkline (`/api/odds/sparks`, one request for the page), the field as one split bar, the runners-up, the other site's price. Price ladders ("What price will Bitcoin hit?") draw as ladders with an even-money line ("69% it reaches $90k · 35% it falls to $70k").
- **The watchlist** (`Personalization.oddsWatch`, `oddsPins`): the reader's own questions, kept as searches so "Fed decision" finds next month's once this one settles; a search counts only when the title has all its telling words and the right year, and the closest wording (then the soonest to settle) wins. Stars from any sheet pin a market by id. Watched markets lead their section's strip. Editable from Straw Poll.
- **Straw Poll** is now the day's action: the lead is the biggest move today (or this week, on a quiet day), drawn as every contender's line (`OddsChart`) with numbered pins where a headline lines up with the jump; then the next movers with sparklines, "where the money is" (one per subject, one election at most), the track record and the watchlist.
- **Why it moved** (`/api/odds/why`): Google News for the question's own words plus the favourite's name, last two or seven days, publisher links resolved; a story becomes a pin when the leader moved 3+ points in the twelve hours after it. With a 5-point move and Gemini configured, one sentence on which story most likely moved it, grounded only in those headlines and kept for the day (`odds:why:v1:*`).
- **History** (`/api/odds/history`): up to four outcomes over 1D/1W/1M/All, from Polymarket's CLOB by each outcome's token and Kalshi's public candlesticks by each outcome's ticker (no more waiting for the paper's own hourly snapshots). Outcomes now carry `token`/`ticker`, markets `series` and `hit`.
- **Track record** (`odds-record.ts`, `odds:record:v2`): besides the paper's own snapshots, the past month's settled Polymarket questions in the reader's subjects are judged from the CLOB price seven days before the end (deadline ladders and side bets skipped), so the record starts at once; the first visit with none builds it after the response. Shown as a ring with the split by how sure the favourite was, and every verdict in a sheet.
- **Universe changes** (`odds.ts`, `odds:base:v2`): tags for Iran, the midterms, movies and the Oscars; the year's crypto ladders in (daily and weekly crypto out); other awards, the Nobel and women's sport (`wta-`/`itf-` slugs, Kalshi WTA series, the words) out.
- **Clutch** (`ClutchSheets.tsx`, `val-bracket.ts`, `valorant-archive.ts`, `/api/valorant/team`): the event card opens a sheet with the groups (connected sets of four, lettered from Polymarket's match titles) or Swiss table, the playoffs drawn as a tree (8-team and 4-team double elimination, 8-team single elimination; each match placed by following who advanced, since a round's matches are played in any order; anything else by date), and the market's favourites. A team opens its form, the year's series and maps, what's next and every result since 2024 by event (Riot's schedule paged back to 2024, kept 12 h as `val:archive:v2`). A match opens the two teams' head-to-head since 2024 with maps and each one's last five. A team that's through but not yet drawn shows when its next stage starts; a match Polymarket prices before Riot schedules it shows up too. The three cards are one height; logos sit on dark tiles (Riot draws them for a dark site). Event names carry their year ("VCT Pacific Stage 2 2026").
- **Match scoreboard** (`vlr.ts`, `/api/valorant/stats`, `MatchStats.tsx`): a match that has started opens with its scoreboard: a tab per map and the whole match, All/Attack/Defend, each team's five with agents, rating, ACS, K/D/A, +/-, KAST, ADR, HS%, first kills and deaths (the best in each column marked), the map's rounds as a strip (winner, side, how), who picked it, its length and Riot's VOD. Riot has no player stats, so they come from VLR.gg's match page (its robots.txt allows it), found by both team names in VLR's match addresses (live list, results, each team's own list via VLR's search) and the nearest start time; the mapping and a finished match's numbers are kept for good (`vlr:map:v1:*`, `vlr:stats:v1:*`), a live one re-read every minute. Agent icons live in `/public/val/agents` (64 px webp from valorant-api.com).
- **Market Pulse**: the flows cell shows what FIIs and DIIs bought and sold as split bars with the net; a tap opens the day's table, a plain-words reading ("Indian funds took up all of it") and the month's days as paired bars. India's dial carries the Nifty 50's breadth as fifty ticks. The rates row's market line reads "Traders: 66% no change" and opens that market.
- **IPO mood** (`ipo-mood.ts`): an open or closed issue's subscription read against the bidding day (day one's figure counts four times, the last day's once): Cold, Lukewarm, Warm, Hot, Frenzy, with a thermometer; the sheet says who led the demand (institutions, HNIs or retail).
- **The Search Bar** (`trends.ts`, `/api/trends`, in the Grapevine): Google Trends for India, the US and the world (sixteen countries' lists, ranked by how many each search is trending in): the top five searches, twenty on request (the list from the Trending-now page's own call, the stories from the RSS and Google News) with rough volume, how long they've climbed, the story behind each, "In today's paper" when it is. Refreshed every ten minutes; a failed first read retries twice.
- **Fixes**: inside a section the accent is the section's colour (drop caps, "for you" tags), not the masthead's; women's sport is filtered from the football and tennis wires (words, plus the WTA's top 150 by name); the ATP rankings come from ESPN's new `/tennis/atp/rankings` (the old path had been empty); the volume turns over on the paper's anniversary (28 Jan), not 1 January; Valorant's Polymarket search is kept trimmed in the store (`val:pm:v1`; the raw answer is ~4 MB, past the data cache).

| Data | Fetched where | When | Stored |
|---|---|---|---|
| Odds history and sparks | browser → `/api/odds/history`, `/api/odds/sparks` | on opening a sheet / on load | fetch cache 5–30 min |
| Why it moved | browser → `/api/odds/why` | on opening a sheet | fetch cache 30 min; sentence in Redis for the day |
| Valorant archive | browser → `/api/valorant/team` | on opening a team or match | Redis `val:archive:v2` 12 h, older pages a day in the fetch cache |
| Google Trends | browser → `/api/trends` | on load, every 10 min | fetch cache 10 min |
