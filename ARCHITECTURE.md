# The Daily Index — Architecture


> **Documentation travels with every release.** Each change merged to `master`
> updates, in the same PR: this file (a "Round N" entry, and the "(current)"
> sections it changes), `README.md` (what's in the paper, setup, commands),
> `.env.example` for any new setting, and the in-code header comments of the
> files it touches. See `CLAUDE.md`.

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
| `lib/chapters.ts` | CHAPTERS, chaptersFor — which group each section belongs to, from the reader's order |
| `components/chrome/PaperNav.tsx` | The menu in its three forms (phone bar, top bar, side menu), with the scroll-spy |
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
                  GEMINI_API_KEY; if selection fails keyword rules pick and
                  Gemini still writes. Since Round 19 writing is many small
                  calls, and a story it can't write is marked, never quietly
                  given the page's raw text)
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
  (`src/lib/digest-cache.ts`). Since Round 19 it is only a first paint: the page
  always asks the server too, and the newest revision wins. Editing preferences
  invalidates it automatically. "Refresh edition" purges it.
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

## Page layout (current)

One page at every width (Round 20): the front page, then the sections in four
groups (`lib/chapters.ts`), which order the page and name the menu but print no
title of their own, then the day's extras and the footer. One subject on each row. `.edition-body` is a container
(`ed`); each section reflows by its width in `app/globals.css` (under "Page
rhythm"): more room shows more of that section, never a second one. Width
thresholds: 700, 1080, 1700, 2200. The menu is one list in three forms
(`chrome/PaperNav.tsx`), its icons outlined when inactive and filled when current
(`chrome/nav-icons.tsx`, Phosphor): under 768 five icons with words at the foot,
whose top line is also the reading progress, with a slim row at the top naming the
section once the masthead has gone and listing them all; up to 1499 the top bar;
from 1500 a side menu. Stories print whole from 1024px; below that they show their
first whole sentence (`splitFirstSentence`, `lib/format.ts`) and open in place.
Anything else that shows more slides up in a sheet on a phone (`extras/Sheet.tsx`,
`chrome/Fold.tsx`, `PHONE` in `lib/use-media.ts`) and opens in place on anything
bigger. Publishers show as a logo and a proper name (`story/PublisherMark.tsx`,
`lib/publishers.ts`, files in `public/publishers/`, one per paper colour). The
archive and settings carry the same menu in the same place (`chrome/SiteNav.tsx`,
`.with-rail`, `lib/nav-menu.ts`), with a plain top row on a phone. The live centre has
the same three forms listing its own views (`f1/LiveNav.tsx`, `f1/live-views.ts`; the first reads "Live" during a session, "Timing" otherwise), a strip under the heading for a past session (back to latest, or "Live now"), takes the window's full width from 1500 (`.live-page`), ends a row's cards level, and from 2400 lays its views out wider (under "The live centre's cards end level" in `globals.css`), tuned for 3440x1440. The archive and settings icons fill on their own page, and a second
click goes back to the paper. CSS zoom (`.page-scale`, 1 to 1.45 by window size) scales it on big
screens as before. Past editions are a separate plain page.

## Settings (current)

Four short tabs with one Save bar (Round 11): **News** (home city, always
prioritise / never show me tags, summary length and voice presets, "Why it
matters"), **Sections** (one list, Page order, under the menu's group headings
(Round 20): what prints, shown/hidden and ↑↓ within a group, ↑↓ on a heading to
move the group; a row the AI editor fills carries a one-line summary and "Edit" opens its
settings in place — story count or countries, watched entities, note to the
editor; the reader's own sections follow the paper's, where they print, with
their own ↑↓, Remove and "+ Add a section"; raw JSON under "Advanced"), **Sports** (the `PersonalizationForm`
chapters, via its `parts` prop — onboarding still renders city, sports and
order) and **Devices** (sync, and what the paper remembers / Forget me). The
old Page & Reddit tab is gone (`#page` opens Sections); each social list has its own "Edit feeds" (Round 11). `/settings#sections` deep-links a tab.
Save writes both preference stores and POSTs `/api/edition` so the new
edition starts building before the reader is back on the paper. Save writes
only the fields edited on the page, over the settings as they are now (sync
may have brought changes while it was open). A fifth tab, **Devices**, holds
sync.

## Sync across devices (current)

The reader's choices live in localStorage on each device; sync keeps them in
step without an account (`lib/sync.ts` in the browser, `app/api/sync` on the
server, shapes in `lib/sync-shared.ts`, mounted by `components/chrome/
SyncRuntime.tsx`, controls in `components/settings/SyncCard.tsx`).

- What syncs: personalization (paddock, favourites, watchlist, topics,
  section order …) and digest preferences, field by field; the puzzles,
  whole; reading memory, merged (union of visits, issues and stories read;
  the larger tally per affinity). What doesn't: the morning/evening override,
  the map's choices, travel mode (where this device is), the cached edition,
  the Reddit connection.
- Linking: "Turn on sync" makes a 192-bit key; another device joins with
  `/settings#sync=<key>` (QR code or link; the key rides in the fragment,
  never sent to a server by the browser). Joining replaces that device's
  settings with the synced ones; its reading history is merged in.
- The server keeps one profile per key, stored under the key's SHA-256
  (`sync:v1:<hash>`), for 400 days from its last change, at most 512 KB. One
  POST does both directions: the device sends the fields it changed (the
  server stamps each as it arrives) and gets the whole profile back. The
  newest stamp wins per field; a field changed here and not yet sent always
  wins locally. DELETE removes the profile.
- The browser side watches localStorage rather than the code that writes it:
  every 4 s it compares each document with what was last synced and sends
  what changed (in view or not); it also syncs on load, on coming back into
  view, every 2 minutes while in view, and as the page is hidden (keepalive).
  Values that arrive go through the paper's own save functions, so the page
  updates and the sports/Reddit cookies are rewritten.
- Concurrent writes to one profile can still race (read-modify-write in the
  store); for one reader's devices that is rare and the next change heals it.

## Stable summaries and live updates

- Every written summary / gist is cached server-side for 3 days, keyed by
  article URL + summary length + voice + section guidance. A rebuild
  (Refresh edition, cron, stale rebuild) only writes articles that are new,
  and only fetches their pages. Selection runs at temperature 0.
- There is no "tap to update": a finished edition replaces the page as soon
  as it arrives — under the pressroom overlay before it fades, or in place
  when a background rebuild or a repair lands.
- A failure never makes the paper worse and is never silent (Round 19): a
  rebuild that comes out worse is thrown away, stories Gemini couldn't write
  are labelled and retried in place, and `chrome/WritingNotice.tsx` says what
  happened at the top of the page.

## Front page render (current)

- If the reader's edition for today is already stored, `app/page.tsx` reads
  it (edition cookie → `readEdition` + `readStoredPrefs`) and passes it to
  `EditionView` as `initialDigest`; `lib/preferences/project.ts` maps it onto
  the sections, so the first HTML is the finished paper — no overlay, no
  swap. The browser still checks for a newer build in the background.
- Word of the Day comes from Merriam-Webster's free feed (cached 6 h). It was
  a Gemini call on every render — ~1.2 s of each page load.
- Measured on a local production build: repeat loads ~0.05 s (was 1.2–1.3 s).
- What it prints and where: see Page layout (current), above.

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
- Every Jolpica call goes through `lib/live/jolpica.ts`, one at a time: about
  3 a second, waiting and asking again on a 429 or 5xx, and throwing if it
  still fails, so a refused page never reads as "no data" (Round 20).
- Round numbers come from Jolpica, matched on the race's date (`withOfficialRounds`
  in `lib/live/f1.ts`): OpenF1's season still lists cancelled rounds, so counting
  its races runs ahead.
- OpenF1 answers 401 to keyless callers for the whole of any live session
  (past races included). Fallback chain in `lib/live/f1.ts`: OpenF1 → the
  last good OpenF1 answer kept in the store (`f1:kept:v1:*`, keyed by race
  day, 3–8 weeks) → Jolpica (calendar, weekend timetable, race / sprint /
  qualifying classifications, shaped as OpenF1 rows with negative keys).
  Practice times exist only in OpenF1 or its kept copy. Track maps are
  served from public/f1/circuits (lib/config/f1-circuits.ts, by Jolpica
  circuitId); a circuit not there falls back to OpenF1's circuit_image.
  The Pit wall's ↻ Refresh sends `fresh=1`: `withFreshF1` skips the memo and
  Data Cache and walks the same chain.
- Live timing comes from F1's own feed (SignalR Core at livetiming.formula1.com,
  no account; telemetry and car positions are the only gated topics and are not
  used). `lib/live/f1-signalr.ts` connects, subscribes, takes the full state
  the server answers with, and closes (~1.5 s), so nothing stays connected.
  `lib/live/f1-live.ts` gates on F1's `static/SessionInfo.json` (live from
  15 min before a session to 30 min after its end, longer while it runs),
  parses into `LiveSnapshot` (`lib/f1-live-types.ts`) and shares one read for
  5 s through the store with a short lock. A finished practice or sprint
  qualifying is kept under the same `f1:kept:v1:wk:<race day>:<session>` key
  `getWeekendResult` reads, so OpenF1's lockout no longer hides those times.
  `/api/f1/live` (compact; `?full=1` for everything). Clients poll every 5 s
  while visible (`lib/use-f1-live.ts`); the Pit wall only inside a session's
  window from the weekend timetable. Each parsed read carries a fingerprint
  of every slow part (`versions`: race control, radio, stints, pit stops, lap
  chart, portraits…); a full poll sends back
  `&have=<part.fingerprint,…>` and gets only the parts that changed (the rest
  listed in `same`, carried over by the hook as the same objects), so a race
  poll is ~20 KB instead of ~55 KB and nothing built from an unchanged part is
  worked out again. Needs Node 22+ (global WebSocket).
- During a session the Pit wall's timing card is `components/f1/LiveCard.tsx`
  (running order, tyres, a moving border; rows glide on overtakes and flash);
  the top bar's F1 link wears a dot (`html[data-f1-live]`). Everything else
  lives on `/f1/live` (`LiveCentre`), laid out in even rows: timing beside
  the map and lap benchmarks (the two columns stretch to one height; the
  timing panel's key sits at its foot); race control beside team radio (the
  same fixed height, each scrolling inside); then tyre strategy, the race
  lap by lap (point at any line: it lifts out and a card names the driver,
  their place that lap and places gained since the start), F1's projected
  title standings, and the season (below). In development
  `?f1replay=<archive path>&f1from=<s>&f1speed=<×>` still plays a session.
- Replay (`components/f1/ReplayBar.tsx`): any finished session on `/f1/live`
  has a Replay button; the bar along the foot plays it back from F1's
  archive at 1–30× (`/api/f1/live?session=<path>&t=<s>` every 1.5 s; the
  first ask adds `&timeline=1` for the flags, laps and qualifying parts that
  colour and mark the bar). Drag to seek; space, ←/→ and Esc work.
  `lib/live/f1-replay.ts` rebuilds the state at t from the `.jsonStream`
  deltas (~6.5 MB a race), keeping the two most recent sessions in memory
  with a cursor. The map runs at the replay's rate (`replaySpeed`).
- Lap benchmarks (`/api/f1/benchmarks?meeting=&type=`): the session's best
  against last year's pole (or fastest race lap) and the fastest race lap at
  the circuit since 2022, from Jolpica, kept a week.
- Season (`components/f1/Season.tsx`, `/api/f1/season`, `lib/live/f1-season.ts`,
  kept 3 h): records for Grands Prix, sprints or both (most wins, podiums,
  poles by driver and constructor; best average finish; most places gained;
  largest and closest winning margins; biggest climb) and every driver's
  points or places round by round, coloured by finishing place.
- Kept on our side: every session's final snapshot for 45 days
  (`f1:session:v1:<key>`, pointer `f1:session:last`); between sessions
  `/api/f1/live?full=1` answers `{ last }`, built once from F1's archive if
  nobody had the page open at the flag. Circuit models 60 days, radio
  transcripts 120 days.
- Track maps (`lib/live/f1-track.ts`, `/api/f1/track?key=`): MultiViewer's
  public circuit API (outline in F1 coordinates, rotation + 90°, corners, a
  reference lap's time at each point). Circuits it lacks are traced from F1's
  archive: the fastest driver's best lap at the latest session there, its
  `Position.z` samples between the lap's start and end. `TrackMap` draws the
  outline in, lights the followed driver's mini-sectors, and places the field
  by estimate (`lib/f1-track-progress.ts`: mini-sectors up to the furthest
  one lit, spread over a typical sector split; in races, gap to the leader ÷
  lap time, and for lapped cars the interval to the car ahead). Exact live
  positions need F1 TV and aren't used.
  Motion: each car's estimate is a distance in laps (laps done + share of
  this one, placed mid-way into its current mini-sector; a fully lit lap
  means it has just crossed the line). The map drives each car at the speed
  it has actually been making (measured over the last 12–40 s, so cool-down
  laps, out-laps and safety cars slow it; lap pace until then) and steers by
  speed only (standstill to 2.5×) towards each new estimate, timed by the
  browser's arrival clock (`localAt`) and carried on for 12 s at most. Whole
  laps are ignored when comparing; only a third of a lap's disagreement
  places a car outright. A car that pits is forgotten and placed afresh.
  Maps mark the chequered start/finish and where sectors 2 and 3 begin
  (sector split remembered per circuit from any session run there:
  `f1:track:sectors:v1:<key>`). An enlarge button opens `MapSheet` (the map
  full screen with the running order).
- Past sessions: `/api/f1/sessions` lists the season's finished sessions from
  F1's archive index; `/api/f1/live?full=1&session=<path>` returns one in
  full; `/f1/live?session=<path>` shows it. F1's archive answers only with
  the F1 TV token (`f1Fetch`, Round 11); without it the list falls back to
  the sessions kept here.
- Team radio transcripts (`lib/live/f1-radio.ts`, `/api/f1/radio`, three new
  per call, kept 120 days): radio uses its own key, `GEMINI_F1_API_KEY`, and
  never the paper's. Writers in turn: gemini-3.6-flash, 3.7-flash, 3.5-flash
  (each 20 free calls a day, 5 a minute), then gemini-3.5-flash-lite and
  3.1-flash-lite (each 500 a day, 15 a minute); gemini-3.8-flash is left for the
  paper. The second listen uses Flash-Lite, then gemini-3.5-transcribe as the last
  resort. `GEMINI_RADIO_MODEL` puts one writer first. Per-minute use is counted in the store; a model that says its day
  is spent is set aside until Google's midnight (Pacific), a busy one for a
  minute, an overloaded one (503) for 30 s, and the clip passes to the next.
  Accuracy: each clip is heard by two different models and compared word
  by word; the confidence is the share of words they agree on (five pips
  and a word), and words only one heard are marked `{{…}}` and shown
  underlined as unsure. With one listen it is the model's own rating,
  capped at 0.8. `{ paused: true }` when the whole pool is spent.
  Who said what: the writing model labels each turn driver / engineer /
  unsure under the instructions in `SPEAKERS` (`lib/live/f1-radio.ts`) —
  listen first (the cockpit's engine, wind and breathing against the pit
  wall's clean mic), then the words (car feel, complaints, questions, thanks
  and bleeps for the driver; instructions, numbers, race control, the
  driver's first name and the after-flag routine for the engineer), then the
  flow (questions answered by the other side, a bare "copy" answers the last
  speaker), and say unsure rather than guess. `lib/f1-radio-speaker.ts` only
  reads and writes the labelled form; unsure lines stay unsure on the page.
- `/f1/live` is five views (kept in the address, `#analysis/pace`): Live
  (timing beside the map and the followed driver's card, with where a stop
  now would put them, side by side at about the same height, and the feed
  across the full width beneath: filters down the left, the list scrolling), Analysis (tyres and pit
  stops · lap chart · pace: speed traps, best sectors and ideal laps, lap
  benchmarks · stewards: open and decided cases, deleted laps), Feed (race
  control read plainly by `lib/f1-race-control.ts`, radio and pit stops, filed
  All/Flags/Stewards/Track limits/Pits/Radio/Info, "your drivers"; a stewards'
  incident is one line that moves up from "noted" to the decision with its
  earlier stages under it, and a message F1 sends twice shows once; pit stops
  are matched read to read by driver and stop number, so a stop seen before is
  never re-stamped as just made; an answer older than the one shown is passed
  over; the timing table marks a driver who has taken the chequered flag,
  from each car's lap count followed read to read, `withFlags`), Weekend
  (`/api/f1/weekend`, `lib/live/f1-weekend.ts`: every session's top three,
  fastest lap and weather, every driver's place across the weekend, recent
  winners/poles/fastest laps at the circuit and its most successful driver,
  the next rounds) and Season. Phones get a bottom tab bar. Parts live in
  `components/f1/centre/`. The feed also parses `TimingStats` (speed traps,
  best sectors) and `PitStopSeries` (each stop's standing and lane time).
- Driver season (`components/f1/DriverSheet.tsx`): from the season grid, the
  weekend grid or the followed driver's card — round by round qualifying
  (with time), grid, finish or why they retired, points, sprint, fastest lap;
  a chart; totals; and the teammate comparison. `/api/f1/season` carries each
  driver's qualifying places/times and each result's status and laps.
- Mini-sector bounds are measured per circuit from F1's archive (when each
  timing loop lit on clean laps, `f1:track:loops:v1:<key>`, served with the
  track as `loops`), so cars are placed where the loops really are; the
  followed driver's lit mini-sectors are clipped at the car each frame.
- The pit lane is traced per circuit from its latest race: one ordinary stop
  (time in the lane near the race's median), the car's recorded positions
  from just before the pit entry (InPit) to just after the exit (PitOut),
  read from the position stream only as far as needed
  (`f1:track:pit:v1:<key>`, four months). Track models carry their `frame`
  (F1 coordinates → the model's box, `f1:track:v4`) so the lane is placed
  exactly; served as `pit`. The map draws it under the track (dashed, PIT)
  and shows the cars in the pits along its middle.
- The live map's controls (`TrackMap` with `controls`, on the Live view and
  the enlarged map): a Map options panel (driver names on the map:
  everyone / yours / none; colour the cars by team or tyre, with the tyre
  key beside the button) and a map-app stack bottom right (follow the
  chosen car, which zooms in and keeps the camera on it; zoom in and out;
  back to the whole circuit). Scroll and pinch zoom the enlarged map; drag
  looks around once zoomed; a mini map shows where the view is. The view is
  written straight onto the SVG; the reader's choices are kept on the device.
- The followed driver's card (under the map): who and where, a Season
  button; the speedometer beside their last and best laps (with the gap to
  the session's fastest), the three sectors (this lap's, coloured as the
  timing screens colour them, with the mini-sectors and each personal
  best), their race in tyres and what a stop now would cost.
- Tyre strategy (`components/f1/Stints.tsx`: `StintLine`, `LapAxis`) on a
  lap scale: each stint a line in its compound's colour (dashed for a used
  set), the tyre where it went on, its laps along it, and while running a dot
  with the laps on the set now. Analysis → Tyres for the field; the card for
  the followed driver.
- Telemetry for the followed driver (`lib/live/f1-telemetry.ts`,
  `centre/Telemetry.tsx`): a speedometer in the driver's card under the map
  (speed round the dial in the team colour, throttle and brake on the inner
  arcs, revs, gear, DRS); a tap opens the detail sheet: the gauges and the
  lap drawn out (speed line, throttle band, braking marks, a marker where
  the gauges are; pointing at the lap shows that moment). A finished
  session plays the fastest lap on a loop; a replay plays the lap in
  progress (asked a few seconds ahead). The gauges run on the display's
  frames (`useSmooth`): a lap played back is blended between its readings
  and every value eases to where it should be, so the dial sweeps rather
  than ticks; only the gauges redraw, and the chart's marker is moved
  directly.
- The timing table: last and best laps for every driver; short of the wide
  layout a Gaps / Sectors switch picks the middle columns (interval and gap,
  or S1–S3 with their mini-sectors); wide shows both. Live: the shared read takes
  CarData.z on a connection of its own (if F1 holds it back, the timing is
  untouched) and carries every car's latest reading as `telemetry`; the page
  keeps the last few minutes of them. Finished sessions: F1's archive (a
  race is ~8 MB) is read once per server and kept half an hour;
  `/api/f1/telemetry?session=&code=[&t=]` cuts out the lap in progress at
  the replay's moment, or the driver's fastest lap. Lap boundaries come from
  TimingData's lap counts on the same feed clock.
- A circuit's lap shares (where on the map each share of a lap falls,
  which places the sector marks, mini-sectors and cars) are counted from
  the reference lap's own first point: MultiViewer's clock starts at the
  session time for some circuits (Monaco, Red Bull Ring, Baku, Miami,
  Silverstone, Imola), and divided as it came every share fell near the line.
  A clock that runs backwards or is far short of a lap falls back to distance.
- The track map is drawn like the broadcast-style dashboards: F1's
  coordinates unturned with y flipped to run down the screen (drawn straight
  they were mirror images; checked against GPS racing lines), a light edge
  round dark tarmac (`--track-edge`, `--track-tarmac`), the edge tinted by
  sector (S1 red, S2 blue, S3 yellow, each with a coloured badge where it
  begins), corner numbers in round badges just off the track, a dashed pit
  lane (`f1:track:v7`). Map options switches sector numbers (on at first),
  sector-coloured edges and corner numbers (both off at first). Badges are
  placed along the track's normal, out as far as it takes to clear the
  track, the pit lane, the start line and the badges already placed. The
  home page's next-race map is `minimal` (just the circuit), turning slowly
  in 3D (`.track-turn`); the live centre opens, unmarked, from a tap on the
  home page's grid/results table.
- The live map's 3D city view (`components/f1/City3D.tsx`, the 3D button
  or Map options → View; Basic at first, remembered as `f1-map-view`):
  Mapbox's Standard map at night with its 3D buildings, tilted, the track
  laid where it really runs. Each circuit is placed on Earth by fitting its
  outline to its GPS racing line (`lib/live/f1-geo.ts`, bacinger/f1-circuits;
  kept as `f1:track:geo:v2:<key>:<year>`, returned with the track as `geo`).
  The track is map lines (buildings in front hide it); cars and badges are
  markers, moved every frame from where TrackMap's loop puts them (the
  drawing stays, unseen, sizing the box and running the cars). The map undoes
  `.page-scale`'s zoom, which Mapbox doesn't allow for. Needs
  `NEXT_PUBLIC_MAPBOX_TOKEN` (a public pk. token; free up to 50,000 map loads
  a month); without it, or for a circuit that can't be placed, there's no 3D
  button.
- Bridges and tunnels in the 3D view (`lib/f1-cover.ts`): Mapbox Streets
  says which roads are bridges or tunnels (`structure`), not how high they
  stand. A bridge running along the track (within 18 m for over half its
  length) is the circuit's own; any other that crosses it at more than ~20°
  passes over, is drawn again above the track, and covers it for its width
  across the crossing. A tunnel along the track counts only where no ground
  road runs the same way (so Singapore's expressway tunnels beneath don't,
  Monaco's does); gaps under 100 m are joined, stretches under 50 m dropped.
  A car on a covered stretch is dimmed (not hidden) until it comes out. So
  is a car the map draws a building over: a raised walkway mapped as a
  building (Singapore's turn 6), or a tower between the camera and the
  track — asked of the map (`queryRenderedFeatures` on the basemap's
  `buildings` featureset at the car's spot) four times a second.
- Turning the map: two buttons turn it 45° at a time. The basic map turns
  the drawing inside a box fitted to it turned, labels kept upright; the 3D
  view turns its camera (and starts from the basic map's turn).
- The stewards in the timing table (`lib/f1-stewards.ts`): race control read
  in order, up to the current lap (a replay holds later messages too), gives
  each driver's open penalties (time penalties summed: two +5s read +10s; a
  drive-through for failing to serve a time penalty replaces it; "penalty
  served" clears), open incidents per reason (noted → under investigation →
  after the race; "no further action" or a penalty closes one), the
  black-and-white flag and laps deleted for track limits. Shown as small tags
  beside the code (penalties in red; a yellow "!" for an incident under or
  awaiting investigation, grey when only noted; a tap opens the details) and in full on the followed
  driver's card.
- The followed driver at first: the paddock's first driver as picked, while
  running; then the second; then the leader. Their card shows the fight
  (`components/f1/centre/Battle.tsx`, races): gap to the car ahead and from
  the car behind, the closing rate (each car's gap to the car ahead noted as
  it completes a lap, kept for the session whichever view is open; the change
  over up to three laps against the same car; the last lap times until there
  are two), and when the chaser reaches DRS range (1 s); and, under it, where
  they'd come out if they pitted now: the place, the cars either side with
  the gaps, and whether it's into traffic (gaps to the leader plus the pit loss).
- A driver's name opens their season (`components/f1/DriverLink.tsx`:
  `DriverName`, `openDriver`, one `DriverSheetHost` in the root layout)
  where the whole season is what a reader wants: the home page's
  championship table and Your paddock, the timing table's names (the row
  still follows on the map), the followed driver's card, the title
  projection, the season grid and records, the weekend grid, and a teammate
  inside the sheet. Head to head on the home page starts on the reader's
  own two drivers when they aren't teammates. Lists of events (race control, radio, stops, analysis
  tables) leave names plain.
- Head to head (`/api/f1/h2h?team=` or `?a=RUS&b=VER`): teammates, or the
  reader's two drivers when they're not the same pair; Your paddock switches.
- Official imagery from F1's image server (`lib/f1-assets.ts`): team logo
  glyphs (white; `.f1-logo` darkens them on the morning paper), car renders,
  driver portraits. Teammate head-to-head from Jolpica (`lib/live/f1-h2h.ts`,
  `/api/f1/h2h?team=`), shown in Your paddock.
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
  returns JSON text; `aiEnabled()` is the single on/off check. Models:
  the order is set in the environment: `GEMINI_MODEL`, then
  `GEMINI_FALLBACK_MODEL` (either can be a comma-separated list), or
  `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` when no fallback is set. A call tries them all in
  up to three rounds (waits of 1.5 s and 4 s) when they're busy, inside the
  caller's timeout. `geminiFailure(err)` puts what went wrong into words the
  page can print.
- Callers: the digest (selection + writing, with response schemas),
  `batchSummarize` (hate-watch), pick blurbs and the Editor's Desk note.
- Small one-liners ask for `light: true`: `GEMINI_LIGHT_MODEL`, then Flash-Lite
  (`lightModels`), so they don't use up the first model's few calls. So far that's
  why a market moved (`lib/live/market-why.ts`).
- Radio is separate: its own key (`GEMINI_F1_API_KEY`) and its order in code
  (`lib/live/f1-radio.ts`). `f1Json` there answers written questions on the same key
  and order, for a session's recap and moments (`lib/live/f1-insights.ts`).
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
- **Lengths**: presets are 50 / 90 / 140 words (default 90, Standard); saved 35 / 60 / 100 are upgraded in `storage.ts`, and a v3 copy still on 140 moved to 90 once (v4). Full text sent to the writer is 4,000 characters.
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
| Digest (all news sections, At a Glance, Schadenfreude) | server, `generateDigest` via `/api/edition` or the cron | first visit of the day per preferences hash; cron 05:30 IST; rebuild after 6 h or on Refresh; stories still unwritten retried in place every 5 min while being read, six times at most | Redis `edition:{date}:{hash}` (default edition kept for the archive, others 60 days); summaries `w:*` 3 days |
| Raw RSS for the first HTML (World, Markets, Tech, sports) | server, `app/page.tsx` | every page render; `fetch` revalidates every 30 min | Next.js data cache |
| F1 schedule | server, `app/page.tsx` | page render | Next.js data cache |
| F1 standings / results | browser → `/api/f1` | after the page loads | Next.js data cache |
| Market indices | server on render, then browser → `/api/markets` | render, then every 60 s while the tab is visible | 60 s route cache |
| Weather + AQI | browser → Open-Meteo directly | on load, at most every 15 min | sessionStorage `daily-index:weather:v2:*` |
| Editor’s Desk note, pick blurbs | browser → `/api/summarize` | once per browser session per day | sessionStorage, keyed by date |
| Reddit (Grapevine) | server | page render | Next.js data cache |
| Reader's preferences | browser | settings save | localStorage (`daily-index:digest-preferences`, `daily-index:personalization`); a copy in Redis `prefs:{hash}` for the cron |
| Digest copy, a first paint only (the server is always asked and the newest revision wins) | browser | after each edition arrives | localStorage, keyed by date + hash |

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

- **IPO watch** (`lib/live/ipos.ts`, `components/widgets/IpoWatch.tsx`, `/api/ipos`, `/api/ipos/[id]`): mainboard IPOs from announcement to two days after listing. NSE (`all-upcoming-issues`, `ipo-detail`, `public-past-issues`) gives the issue list, symbols (and, from past issues, the dates of an issue the board knows without them, Round 18), category-wise subscription, issue facts and documents. investorgain.com's live GMP table (parsed by its `data-label` cells) gives the GMP, the issue size in crores and the allotment/listing dates. Missing dates follow SEBI's T+3 rule and are marked as estimated. The board and a daily GMP reading per IPO are kept in the store (`ipo:board`, `ipo:gmp:{id}`) for the GMP trend. On the page, five rows show by default: name and size, an opens→closes→lists track, and a GMP pill (red <20%, orange 20–30%, green 30%+). A row opens a sheet with everything, including listing-day prices from Yahoo (`SYMBOL.NS`).
- **Market charts** (redrawn in Round 20's chart pass, below; `lib/live/charts.ts`, `/api/chart`, `MarketChartSheet`, `PriceChart`): any index, commodity or crypto tile opens a TradingView Lightweight Charts view with 1D–5Y ranges, area/candles, volume, a pointer readout and range stats. Commodities are converted to rupees bar by bar at the USD/INR rate of the same moment. The library loads only when a chart opens.
- **Crypto**: BTC/USDT and ETH/USDT from Binance's public market-data mirror (`data-api.binance.vision`, reachable from any region). 24-hour change; polled with the other markets.
- `components/extras/Sheet.tsx` is the shared popup shell. It animates both ways: in (rising from the bottom on a phone) and out (back down on a phone, a small sink on a desktop) before it tells its opener it closed (Round 18).
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
- **IBJA bullion**: the gold (999, per 10 g) and silver (999, per kg) tiles show IBJA's published AM/PM rate. The day's change is taken against the previous day's last rate, and the sparkline comes from IBJA's roughly four months of daily rates (since Round 20's chart pass, the card's line is COMEX in rupees, labelled). COMEX in rupees stays as the chart and as the fallback.
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

- **Odds in every section** (`odds-pick.ts` `layoutOdds`, `odds/OddsCard.tsx`): three or four standing questions at the foot of World (4), Tech (4), F1, Sport, Money and the Grapevine (film); India and the cities get none. Subjects weigh tech 1.3, world 1.2, sport 1, money and film 0.85. Foreign elections need $2M traded unless they're news; a decided question (`decided`: one answer 97%+ with the next 3%-, a yes/no at 97%+ or at 3%- due within 90 days, a ladder only when every level is) never prints; F1's strip, when it would hold fewer than two, takes spare F1 questions down to $1k traded (the reader's drivers first); a football follow reaches into world markets only for football. Each card: why it's here, the question, the favourite's chance beside a week's sparkline (`/api/odds/sparks`, one request for the page), the field as one split bar, the runners-up, the other site's price. Price ladders ("What price will Bitcoin hit?") draw as ladders with an even-money line ("69% it reaches $90k · 35% it falls to $70k").
- **The watchlist** (`Personalization.oddsWatch`, `oddsPins`): the reader's own questions, kept as searches so "Fed decision" finds next month's once this one settles; a search counts only when the title has all its telling words and the right year, and the closest wording (then the soonest to settle) wins. Stars from any sheet pin a market by id. Watched markets lead their section's strip, unless decided (Round 15: a settled question never prints, watched or not). Editable from Straw Poll.
- **Straw Poll** is now the day's action: the lead is the biggest move today (or this week, on a quiet day), drawn as every contender's line (`OddsChart`) with numbered pins where a headline lines up with the jump; then the next movers with sparklines, "where the money is" (one per subject, one election at most), the track record and the watchlist.
- **Why it moved** (`/api/odds/why`): Google News for the question's own words plus the favourite's name, last two or seven days, publisher links resolved; a story becomes a pin when the leader moved 3+ points in the twelve hours after it. With a 5-point move and Gemini configured, one sentence on which story most likely moved it, grounded only in those headlines and kept for the day (`odds:why:v1:*`).
- **History** (`/api/odds/history`): up to four outcomes over 1D/1W/1M/All, from Polymarket's CLOB by each outcome's token and Kalshi's public candlesticks by each outcome's ticker (no more waiting for the paper's own hourly snapshots). Outcomes now carry `token`/`ticker`, markets `series` and `hit`.
- **Track record** (`odds-record.ts`, `odds:record:v2`): besides the paper's own snapshots, the past month's settled Polymarket questions in the reader's subjects are judged from the CLOB price seven days before the end (deadline ladders and side bets skipped), so the record starts at once; the first visit with none builds it after the response. Shown as a ring with the split by how sure the favourite was, and every verdict in a sheet.
- **Universe changes** (`odds.ts`, `odds:base:v2`): tags for Iran, the midterms, movies and the Oscars; the year's crypto ladders in (daily and weekly crypto out); other awards, the Nobel and women's sport (`wta-`/`itf-` slugs, Kalshi WTA series, the words) out.
- **Clutch** (`ClutchSheets.tsx`, `val-bracket.ts`, `valorant-archive.ts`, `/api/valorant/team`): the event card opens a sheet with the groups (connected sets of four, lettered from Polymarket's match titles) or Swiss table, the playoffs drawn as a tree (8-team and 4-team double elimination, 8-team single elimination; each match placed by following who advanced, since a round's matches are played in any order; anything else by date), and the market's favourites. A team opens its form, the year's series and maps, what's next and every result since 2024 by event (Riot's schedule paged back to 2024, kept 12 h as `val:archive:v2`). A match opens the two teams' head-to-head since 2024 with maps and each one's last five. A team that's through but not yet drawn shows when its next stage starts; a match Polymarket prices before Riot schedules it shows up too. The three cards are one height; logos sit on dark tiles (Riot draws them for a dark site). Event names carry their year ("VCT Pacific Stage 2 2026").
- **Match scoreboard** (`vlr.ts`, `/api/valorant/stats`, `MatchStats.tsx`): a match that has started opens with its scoreboard: a tab per map and the whole match, All/Attack/Defend, each team's five with agents, rating, ACS, K/D/A, +/-, KAST, ADR, HS%, first kills and deaths (the best in each column marked), the map's rounds as a strip (winner, side, how), who picked it, its length and Riot's VOD. Riot has no player stats, so they come from VLR.gg's match page (its robots.txt allows it), found by both team names in VLR's match addresses (live list, results, each team's own list via VLR's search) and the nearest start time; the mapping and a finished match's numbers are kept for good (`vlr:map:v1:*`, `vlr:stats:v1:*`), a live one re-read every minute. Agent icons live in `/public/val/agents` (64 px webp from valorant-api.com).
- **Market Pulse**: the flows cell shows what FIIs and DIIs bought and sold as split bars with the net; a tap opens the day's table, a plain-words reading ("Indian funds took up all of it") and the month's days as paired bars. India's dial carries the Nifty 50's breadth as fifty ticks. The rates row's market line reads "Traders: 66% no change" and opens that market.
- **IPO mood** (`ipo-mood.ts`): an open or closed issue's subscription read against the bidding day (day one's figure counts four times, the last day's once): Cold, Lukewarm, Warm, Hot, Frenzy, with a thermometer; the sheet says who led the demand (institutions, HNIs or retail).
- **The Search Bar** (`trends.ts`, `/api/trends`, in the Grapevine): Google Trends for India, the US and the world (sixteen countries' lists, ranked by how many each search is trending in): as many searches as fit the height of Trending on X and Reddit beside it (five at least, five alone; since Round 15), twenty on request (the list from the Trending-now page's own call, the stories from the RSS and Google News) with rough volume, how long they've climbed, the story behind each, "In today's paper" when it is. Refreshed every ten minutes; a failed first read retries twice.
- **Fixes**: inside a section the accent is the section's colour (drop caps, "for you" tags), not the masthead's; women's sport is filtered from the football and tennis wires (words, plus the WTA's top 150 by name); the ATP rankings come from ESPN's new `/tennis/atp/rankings` (the old path had been empty); the volume turns over on the paper's anniversary (28 Jan), not 1 January; Valorant's Polymarket search is kept trimmed in the store (`val:pm:v1`; the raw answer is ~4 MB, past the data cache).
- **F1 timing follows the weekend** (`getF1Results`): from FP1 until qualifying the timing card shows the latest finished practice (or sprint) session's best laps; once qualifying ends it shows the starting grid (OpenF1 files `starting_grid` under the qualifying session, not the race; the qualifying order stands in until it lands); twenty minutes after the race's scheduled end, the race result. A Practice → Grid → Result marker says which. The weekend list names each finished session's quickest driver in place of a tick.
- **Market Pulse order and bullion charts**: the rates row now leads, so the region moods sit right above the indices. Gold and silver charts are pegged to IBJA's rate (the tile's price) at the moment IBJA published it, the COMEX line carrying the movement since; the sheet prints the IBJA rate and the live move since under its price (COMEX in rupees alone ran 8–11% under IBJA). The chart draws IBJA's rate as a dotted amber line with an axis tag and a dot where it was published; the readout shows the live estimate beside the IBJA rate. On a closed day (holiday, weekend) a 1D chart shows the last session, labelled with its date, instead of nothing.
- **Front page rearranged** (the strip moved to the back page in Round 20): two columns (the Briefing, the lead) and one strip of extras under them (`FrontStrip`: the editor's note cut to two sentences, one moment from this day in history, the word of the day). The lead's headline is sized to its length, the standfirst and why-it-matters stand in for the two-column body, the plate sits beside it. Streak, issues and most-read are gone until there is a habit to show. Sponsored content (`sponsored.ts`) is dropped at the wire (headline, snippet, URL) and again on the article text or summary.
- **Big screens** (the spread described here was replaced in Round 20): 1080p and 1440p monitors get the same page scaled whole (`.page-scale`, zoom 1.15–1.45 by width and height), never stretched. The top bar is zoomed with its page, inside the same `.page-scale` block, on every page (the live centre, the archive and the loading skeleton since Round 17), so their edges line up. Ultrawides (≥2800px and 2:1) get a spread instead: zoom 1.3, a 2480px design width, the front page's extras as a third column, and sections two to a row by subject (`lib/spread.ts`: preferred partners, a leftover stacked beside the most lopsided row, else centred at one column's width). Each spread column is about the laptop page's width, so every section keeps its own layout; elsewhere the row wrappers are `display: contents` and sections keep the reader's order (flex order) and numbers (counter-set).

| Data | Fetched where | When | Stored |
|---|---|---|---|
| Odds history and sparks | browser → `/api/odds/history`, `/api/odds/sparks` | on opening a sheet / on load | fetch cache 5–30 min |
| Why it moved | browser → `/api/odds/why` | on opening a sheet | fetch cache 30 min; sentence in Redis for the day |
| Valorant archive | browser → `/api/valorant/team` | on opening a team or match | Redis `val:archive:v2` 12 h, older pages a day in the fetch cache |
| Google Trends | browser → `/api/trends` | on load, every 10 min | fetch cache 10 min |

### Round 11: stewards, the paddock on X and Reddit, settings in four tabs (Nov 1 2026)

- **Rehearsal data isn't a session** (`f1-live.ts` `isOver`, `droppedIfEarly`): F1 runs rehearsal data through the live feed under sessions still to come, already marked "Ends" (the Mexico race appeared at "lap 3 of 56" the day before it ran, and was kept as the last session). A session now counts as over only after its scheduled start, and a kept copy taken before the start is dropped and read again.
- **F1's archive with the F1 TV token** (`f1Fetch` in `f1-signalr.ts`): every request to `livetiming.formula1.com/static` carries `Authorization: Bearer <F1TV_TOKEN>`, as FastF1 sends it. F1 accepts it whatever the subscription's status, until the token expires (a few days), and then serves everything: the season index, each session's state, the `.jsonStream`s (replay), `CarData.z` (finished-session telemetry) and `Position.z` (track and pit-lane tracing), past seasons too. `/api/health` reports `f1tv: ok | expired | missing` with the expiry; a fresh token goes in Vercel only (`.env.example` holds none). Team radio clips stay public.
- **No more recording**: the GitHub jobs (`f1-capture.yml`, `f1-keep.yml`) and `/api/f1/keep` are gone, and the live feed is no longer sampled for replay (`captureLiveSample` and the captured timeline): replay reads F1's archive. The last session is still kept when the live centre reads it after the flag.
- **Stewards table** (`centre/StewardsTable.tsx`, `stewardsTally` in `f1-race-control.ts`) replaces Track limits, on the Live view and Analysis → Stewards, for every session: per driver, track limits, other deleted laps, the black and white flag, warnings, incidents noted / investigated / closed with no further action, reprimands and penalties, each with its own 16-unit icon (`StewardIcon`) and a key; a tap lists the messages. An incident is one set of cars and one reason, its clock stamp included. "REPRIMAND (DRIVING)" now parses in the cases list too.
- **In Brief** prints headlines alone. The writer is asked (`needsHeadline`) for a complete headline when the feed's is cut off, a teaser or unclear; the answer (or the original, when it stood on its own) is cached under `head:`. No gist is written for In Brief. `BUILD_VERSION` 6.
- **X and Reddit**: no politics filter on social posts; Reddit's housekeeping threads (daily/weekly threads, megathreads, race and discussion threads, mod posts) and near-empty titles are dropped (`worthReading`); X posts lose links and repost furniture and need some words; near-identical posts are de-duplicated. Lists return up to 20 per source; the page shows a few, and "See all" opens a `Sheet` (inline inside a sheet already, e.g. IPO chatter).
- **Edit feeds** (`lib/feeds.ts`, `lib/feeds-shared.ts`, `extras/FeedEditor.tsx`): the Grapevine, Paddock chatter, Clutch's transfer window and IPO chatter each read X accounts (up to 12), X searches (up to 4; not IPO, which searches for the company itself; its accounts are "preferred": their posts rank first) and subreddits (up to 10), edited from an "Edit feeds" button beside the list (in place inside the IPO sheet). Until edited a section reads the paper's defaults (the Grapevine's from the older `xAccounts` / `xSearches` / `subreddits`, Clutch's from `valorantX`); saved as `feedsGrapevine`, `feedsPaddock`, `feedsClutch`, `feedsIpo` in personalization, one field each, so sync carries each section's feeds separately. `/api/social` takes `x`, `q`, `r` for every kind; a parameter left out means the default, an empty one means none. Custom subreddit lists get their own rolling Reddit archive. Each list's All / X / Reddit filter is kept in personalization too (`feedSources`, by list), so it syncs; a choice made earlier on one device (localStorage `daily-index:feed-source:*`) still counts there until changed.
- **Paddock chatter** (`extras/PaddockChatter.tsx`, `f1Chatter`, `/api/social?kind=f1`): r/formula1 and r/F1Technical's top of the day, F1, the FIA, the reader's team and three reporters on X, last 48 h, fading by half every 12 h, posts naming the reader's drivers or team doubled and tagged; a card at the foot of the Pit wall, running down to the stories' foot (as many posts as fit, two to six, the reader's first; Round 15), "See all" opens the rest with the X / Reddit filter.
- **Trending on X and Reddit** (`widgets/SocialTrends.tsx`, `socialTrends`, `/api/social?kind=trends`): beside the Search Bar (two columns from md up; X above Reddit in its half, side by side when it has the whole width), India or World; X from trends24.in's hourly lists (with hours trending of the last 24), else getdaytrends.com's current ranking (hours from its eight-hour chart) when trends24 turns Vercel's servers away; both are asked openly as the paper, never disguised as a browser. Reddit from r/popular's hot list (geo_filter IN / GLOBAL), read one after the other (Reddit 429s a burst). Kept 10 minutes, last good copy a day.

| Data | Fetched where | When | Stored |
|---|---|---|---|
| X trends (trends24) | browser → `/api/social?kind=trends` | on load, every 10 min | Redis `social:x-trends:v1:*` 10 min fresh / a day |
| Reddit popular | same | same | Redis `reddit:rss:v1:popular:*` 10 min fresh / a day |
| Paddock chatter | browser → `/api/social?kind=f1` | on load, every 10 min | the shared X and Reddit feed copies |

### Round 12: race-day fixes, Reddit's one read a minute (Nov 2 2026)

- **Which session is on** (`resolveSession` in `f1-live.ts`): F1 stopped updating `static/SessionInfo.json` (it still named Saturday's qualifying during the Mexico race, so the live centre showed nothing). The current session now comes from the season index in F1's archive (with the token): the session whose window holds now, else the next. Without a token, a stale static file is checked against the live feed's own SessionInfo (two topics, shared two minutes). A session running past its window (a red flag) stays live while the last read says it runs.
- **Pit stops live**: F1 no longer sends `PitStopSeries` during a session (the archive still has it afterwards). Live stops are read from the tyre stints (a stop ends the laps run before each new stint), with lane times from `PitLaneTimeCollection` when sent; `mergeStops` keeps each stop's time from poll to poll, and stops made before the first read are timed by race control's per-lap clock (interpolated between the laps it spoke on).
- **Not sent by F1 any more, with or without the token**: `ChampionshipPrediction` (the title projection) and live `CarData.z` / `Position.z` (the token opens the archive, but live car data needs an active F1 TV subscription). Finished-session telemetry comes from the archive.
- **Reddit, one read a minute** (`reddit.ts` `readGated`): Reddit's public RSS answers one read per minute per address (measured: `x-ratelimit-remaining: 0` after the first, `x-ratelimit-reset` counting to the next minute, 429 for the rest). Every read takes one slot shared through the store (`reddit:slot:v1`), held until Reddit's headers say the next may go (freed early if Reddit ever allows more; `Retry-After` on a 429). A feed that can't have the slot serves its last copy at once (kept three days); a feed with none yet goes to the front of the queue (`reddit:first:v1`) and its answer says `waiting`, so the page asks again in 30 s. Copies are fresh for five minutes; a subreddit that doesn't exist is kept as empty. The page's server-side Reddit column (unused) no longer reads Reddit.
- **X, gently** (it is read through RSSHub as a logged-in burner account): each account or search at most once every ten minutes, a refresh included (it shows the newest copy); at most 100 X reads an hour across the site (`social:x:hour:*`), past which lists show their last copies; at most four RSSHub reads at once; a failing route rested two minutes; copies kept three days. Reddit is read without an account, so a refresh can only ever cost the server a minute's wait.
- **Red flag** (`trackNow`): under the Mexico race's red flag F1's TrackStatus kept saying "Yellow" while the session was Aborted and race control said "RED FLAG - RACE SUSPENDED". A session Aborted or Suspended, or a red flag race control hasn't lifted since (session or race resumed, pit exit open, a standing or rolling start; not "track clear", which came mid-suspension), reads red.
- **Refresh**: every X/Reddit list and the trends block show "Updated 3m ago" and a ↻ (`RefreshStamp`, `useSocialFeed`); ↻ sends `&fresh=1` (copies older than a minute are read again, Reddit's still in turn). Lists refresh every five minutes while in view and on coming back to the tab. `SocialAnswer` carries `asOf` and `waiting` (`social-context.ts`, AsyncLocalStorage per request); `sources` since Round 14.
- **Clutch's default X accounts**: @ValorantUpdated, @PolymarketVAL, @VALORANTLeaksEN, @ValorantEsports.
- **Limits**: with ~6 Reddit feeds and one read a minute, a feed's copy is typically 5 to 10 minutes old; a brand-new feed (a subreddit just added) fills within a minute or two. Vercel's functions may leave from more than one address; the shared slot treats them as one, which is safe but conservative.


### Round 13: Mexico race follow-ups (Nov 2 2026)

- **Pit lane on the map**: the lane is traced from F1's archive; while it refused (before the token) the server stored "none" for a day and browsers kept the track a day. Now "none" is rechecked after an hour, a track without its lane is cached ten minutes, and the client asks for `v=9`.
- **Stewards, matched by incident**: F1 stamps every message about one incident with the same clock time in brackets ("(14:03:57)"), and often leaves out the reason after " - ". Incidents are keyed by that stamp (the reason only when there is none) in the timing table (`f1-stewards.ts`), the cases list and the tally (`f1-race-control.ts`); a decision closes a stamped incident for every car in it. Leclerc's penalty for the turn 4 incident with Hamilton had left both "under investigation".
- **Stewards view** (`centre/StewardsView.tsx`, replacing the nine-icon table): Driver · Track limits (strikes towards the black and white flag, other deletions) · With the stewards (each open incident in words, or "cleared") · Penalties & warnings (open penalties, served ones faint, reprimands, warnings, the black and white flag). Open penalties first, then open investigations; "N drivers involved · the other M clean". Phones get each driver as a labelled card. `StewardsTable.tsx` now holds the icons and the per-driver message list.
- **Feed**: under a red flag cars change tyres in the pit lane and F1's lane timer counts the stoppage (~2,180 s at Mexico): a stop with a lane time over 120 s, or made on a red-flag lap (from the red flag to the standing or rolling start), is a red-flag tyre change (`redFlag`, no lane time); lane times outside 10–90 s are dropped. Sector flags: yellows thrown within 15 s are one line ("Double yellow in sectors 15 and 16"), an upgraded yellow is the same line, the clears close it; a clear with nothing to close shows under Flags only (`quiet`). Incident messages without a reason no longer break the reader.
- **Pit stops, stints first** (`parse` in `f1-live.ts`): the tyre stints decide which stops happened (they add up to the race); F1's PitStopSeries lends stationary and lane times to the stint stop on its lap (one either side at most, once each) and adds any it alone has. Neither is whole alone: at Mexico the series left Pérez out entirely (five stops) and skipped some red-flag tyre changes, and stints carry no times. A live lane time goes only to the stop on its own lap. A stint that kept the same tyres is marked `sameTyres`. A finished session kept from the live feed is rebuilt once from F1's archive, an hour after its last read (`withArchiveStops`, `stopsFromArchive`), and kept so; without the token the kept copy stands. Mexico: 58 stops, 35 with F1's times, 19 red-flag tyre changes, 7 on the same tyres.
- **IPO subscription at the upper price band** (`upperBandFactor` in `ipos.ts`): NSE counts shares at the band's lower price, so its ratios run below Chittorgarh's and InvestorGain's (₹78–82: 3.78× against 3.98×, the same bids). Bids are re-divided at the upper price; the sheet says so. Cache `ipo:sub:v3`.

### Round 14: X and Reddit fail quietly, one Sections list, the chequered flag (Nov 2 2026)

- **The Grapevine's top** (`GrapevineSection.tsx`): the Search Bar and Trending on X and Reddit sit side by side from md up, a hairline between (`PAIR`: `md:flex-1`, the border only on the second of two). Either one alone takes the width; the same for You Should See This and the Puzzle Desk. Both widgets are container-aware (`@container`): the Search Bar's twenty and the trends' X / Reddit lists go into two columns only when the block has the whole width.
- **When X or Reddit fails** (`lib/social-health.ts`, `extras/SocialPausedNote.tsx`): every answer says how each source fared (`sources: { x, reddit }`: ok, a kept copy counting as ok · failed · waiting · off). The browser keeps one record per source for the device (localStorage `daily-index:social-health`), fed by every list: three failed reads in a row (reads within the same minute count once; retried after a minute, then three) pause that source for an hour. A paused source is hidden and not asked at all (`&skip=x,reddit`); after the hour one read is tried, and a failure pauses it again straight away. Lists never say they failed: a source's posts go, a list with nothing isn't there, and its partner column takes the width (Search Bar and trends, You Should See This and the Puzzle Desk). A source failing one read keeps its last posts. While anything is paused one quiet line, "X paused until 15:40 · Try again", sits under the Grapevine's intro (else Paddock Notes', else under IPO Watch, when the reader has hidden those); Try again gives both sources one read now on every open list.
- **IPO chatter** (`IpoWatch.tsx` `Chatter`, `ipoChatter`): the subreddits and X accounts are one choice for every IPO; posts from those accounts rank first (tagged "Following", still only when they name the issue). Only the X search (“Name” IPO) changes per issue, shown in the feed line.
- **Per-source states on the server** (`social-context.ts`): `noteSource(src, ok | failed | waiting)` from each reader (`rsshub`, `xTrends`, Reddit's `readGated`; a Reddit feed whose read failed with no copy is `failedFirst`, not `waiting`), `skipped(src)` from `&skip=`, and `sourceStates()` folded into every answer. A whole-route failure answers `sources` failed for whatever wasn't skipped. Notes ("X needs RSSHub", "waiting their turn") are no longer shown on the page.
- **The lists** (`SocialFeed.tsx`): `useSocialView(data)` says show · wait (the quiet placeholder) · hide; `SocialList` renders nothing when hidden, has no empty or error lines, and shows the All / X / Reddit filter only when both sources have posts (`filterInSheet` keeps it to the "See all" sheet for a small card). `useSocialFeed` reports each answer to `social-health.ts`, sends `&skip=` for paused sources (asks nothing when both are), keeps a failing source's last posts (`keepFailed`), and reads again on "Try again" (`SOCIAL_RETRY_EVENT`). Clutch's transfer window hides the same way.
- **IPO chatter's line**: "r/IndianStockMarket, r/StockMarketIndia & 2 more · X search: “Bombay Coated” IPO"; the editor's X field is "Preferred X accounts" and its hint says it applies to every IPO. The search's label on each post keeps the company's quotes, curled ("“Bombay Coated” IPO"), not doubled. The panel is `group/chatter`: the paper's `.group:hover .headline-link` rule had underlined every post in it on hover.
- **Paddock chatter** moved from under Paddock Notes' stories into the Pit wall (`F1Sidebar.tsx`, under the Starting Grid) as a small card: three posts, the reader's drivers or team first, an icon-only Edit feeds (`EditFeedsButton iconOnly`), "See all" for the rest.
- **Summary length**: Standard (90 words) by default; preferences v4 moves a saved 140 to 90 once (`upgradeV3ToV4`).
- **Sections in Settings are one list** (`PageOrderList.tsx` with `news` / `onNewsChange`, through `PersonalizationForm`): Page order keeps show/hide and ↑↓; a row the digest fills (`DigestSection.slot` equals the page key) shows its summary and opens its settings (`SectionSettings`, exported from `DigestPreferencesEditor.tsx` with `sectionSummary`, `TagInput`, `Stepper`); custom sections (no slot) are rows after the paper's with their own ↑↓, Remove and "+ Add a section". The old separate list, with its ↑↓ and Remove on the built-in sections, is gone; `DigestPreferencesEditor view="sections"` is just the JSON now.
- **Race control, one line per incident** (`readRaceControl`): a message repeated with the same words on the same lap within two minutes is dropped (sector flags excepted); stewards' messages are keyed by `incidentKey` (F1's bracketed stamp, else cars and reason; a penalty without a stamp finds its driver's open incident), and each later stage replaces the line, moving it to its time, with the earlier stages in `history` (shown under it: "noted 14:05 → under investigation 14:10"). Alerts key incidents by `inc:<key>:open | decided | served` and other messages by lap and words, so a repeat never alerts again (seen ids `f1-alerts-seen:v2:*`).
- **Pit stops never come back as new** (`mergeStops`): a stop is matched to the last read's by driver and stop number (a lap either side), not `code:lap`, and keeps F1's time, else the time it was first seen with; previously a lap read one later, or a read where some stops had F1's times and others none, stamped an old stop "now". Pit alerts are keyed by stop number.
- **Older answers passed over** (`use-f1-live.ts`): a live answer whose `at` is older than the one shown, for the same session, is ignored (not in a replay).
- **The chequered flag** (`withFlags` in `f1-live.ts`, `Chequered` in `LiveTiming.tsx`, `LiveRow.flag`, `LiveSnapshot.lapSeen`): F1's timing has no "finished" mark, so each car's lap count and the read that first saw it are kept read to read; once race control's CHEQUERED flag is out (and no later green, which starts the next qualifying part), a car whose count went up after it has taken the flag. A session first read with the flag already out marks no one; a session that's over and read without the record gives it to every car still running (not the knocked out). `compact` leaves `lapSeen` out.

### Round 15: even columns, X posts whole, no settled odds (Nov 2 2026)

- **Fill to the neighbour** (`lib/use-fit-rows.ts`): a list in a box that grows with its row (flex or grid stretch), its rows laid out absolutely inside, shows the rows that fit whole (`data-fit-row`) and hides the rest, so it never makes the row taller; the box is never shorter than `min` rows (measured). With a media query it fills only on the wide layout. Rows are measured in the page's own pixels, the big-screen zoom taken out (Round 16).
- **The Search Bar** fills the height of Trending on X and Reddit beside it: usually 7 or 8 searches, never fewer than five, five when alone or on a phone; "Show the top 20" unfolds (two columns with the whole width) and folds back to the fitted count.
- **The Pit wall ends level with the stories**: the desk column is a flex column (`F1Sidebar.tsx`) and Paddock chatter at its foot grows to the stories' height, showing as many posts as fit (two to six, each clamped to three lines with the whole post on hover; `SocialList fill`, `SocialItem clamp`); on a phone, two. The next-race card is about half as tall: the turning map sits in a 9rem box at 13rem wide (tilted back it reads two-thirds as tall, so the square it lays out as was mostly empty), and the countdown is 1.6rem.
- **X posts whole** (`readX`): posts were cut at 280 characters mid-word; now kept to 1,000 and clipped at a word with "…" (`clip`). Copies moved to `social:x:v2:*` so the cut ones (`v1`, three days) are read afresh rather than served.
- **Settled odds never print** (`decided` in `odds-pick.ts`, applied in `scoreOdds` to every market, the watchlist included): one answer at 97%+ with the next at 3%-; a yes/no at 97%+, or at 3%- due within 90 days (a long shot further out is still a question); a date or price ladder only when every level is; markets where several answers can come true (nominations, host countries) have more than one high answer and stay. The drivers' (Antonelli 100%) and constructors' (Mercedes 99.7%) titles had filled F1's strip after Mexico.
- **F1's spares**: F1 markets below the strip's bar ($20k, or not "worth a look") but with $1k+ traded are kept as `spare` picks; when F1's strip would hold fewer than two, spares fill it (the reader's drivers first, then the money). Spares never reach Straw Poll's leads, movers or busiest.

### Round 16: fill counts at page zoom (Nov 2 2026)

- **The Search Bar still came up short on big screens** (`lib/use-fit-rows.ts`): from 1600px wide the page is zoomed (`.page-scale`, 1.15–1.45). The hook measured each row's bottom with `getBoundingClientRect` (screen pixels, zoom included) against the box's `clientHeight` (the page's own pixels), so every row read 15–45% too tall: at 1.25, six searches showed where eight fit, leaving a gap under the list beside Trending on X and Reddit. The zoom is now read off the box (its screen height over `offsetHeight`) and divided out of the row bottoms and the `min`-row floor. The Pit wall's Paddock chatter, which uses the same hook, fills to the stories' foot on big screens too. Laptops (no zoom) are unchanged. No cache keys or versions change.

### Round 17: the top bar lines up on big screens (Nov 2 2026)

- **Top bar inset on the live centre** (`app/f1/live/page.tsx`, `app/archive/page.tsx`, `app/archive/[date]/page.tsx`, `chrome/PageSkeleton.tsx`): on these pages the `TopBar` sat outside the zoomed `<main class="page-scale page-wrap">`. On a big screen the bar kept a 1240px width in screen pixels while the page's 1240px was zoomed (1550px at 1.25), so the bar's ends sat well inside the content's. The page also missed `.page-scale .page-wrap`'s wider design width, which matches only a descendant. Now the bar and `<main class="page-wrap">` share one `<div class="page-scale">`, as on the front page (`EditionView`'s `<main class="page-scale">`): the same zoom and the same width, so the edges line up, and these pages get the front page's big-screen width (e.g. 1380 at 1.25). Laptops are unchanged. The archive's floating "way home" link stays outside the zoom. No cache keys or versions change.

### Round 18: sheets slide away, stale IPOs leave (Nov 4 2026)

- **Sheets animate on the way out** (`components/extras/Sheet.tsx`, `.sheet-closing` and the `fade-out`, `sheet-sink`, `sheet-fall` keyframes in `globals.css`): a sheet rose in but vanished on close, because the opener unmounted it at once. Now the close button, a tap outside and Escape all go through the sheet's own `close`: it adds `.sheet-closing` (the backdrop fades over 0.26s; on a phone the panel drops back off the bottom edge in 0.26s, on a desktop it sinks and fades in 0.2s, both easing in) and calls the opener's `onClose` on the panel's `animationend`, or after 450ms if that never comes. Reduced motion closes at once. Every sheet in the paper uses this shell, so all of them get it; callers are unchanged.
- **An IPO stuck as "upcoming"** (`lib/live/ipos.ts`): investorgain once spelt Bonfiglioli Transmissions "Bonfigloli", before its dates were out. That made a board entry (`bonfiglolitransmissions`) that matched neither NSE's name (`bonfigliolitransmissions`: not equal, neither a prefix of the other) nor anything later, so it never got dates. An entry leaves only two days after its listing date, so one without dates stayed for good (each refresh re-stored it, renewing the 30-day expiry). It listed on 23 Oct. Three changes:
  - `nsePastSymbols` is now `nsePastIssues`: NSE's past issues give the symbol and the open, close and listing dates, and fill any the board is missing (a listing date from there is actual, not estimated).
  - Names are matched by `sameIpo` (GMP rows to the board, and the board to past issues): equal, one a prefix of the other as before, or, for ids of 10+ characters, at most two letters apart (edit distance).
  - `IpoEntry.lastSeen` (types.ts): the last day NSE's current list or the GMP table named the IPO. One with no listing date that neither has named for 10 days (`ORPHAN_AFTER_DAYS`) is dropped. An entry stored before this release counts as seen on its first refresh.
  - No cache keys or versions change: `ipo:board` keeps its key and gains the optional `lastSeen`.

### Round 19: Gemini's text, every time, and failures said out loud (Nov 5 2026)

The reader kept seeing a publisher's raw text in place of Gemini's, sometimes only under the lead, with no sign of a failure and only Refresh fixing it. Four causes, all found in the code, the first also in production: on Nov 4 at 19:42 IST a 503 on selection replaced the whole default paper with feed text.

- **No more silent downgrades** (`lib/server/editions.ts`): `buildEdition` overwrote the stored edition with whatever came back. Now `isWorse` (the editor failed where it had worked, or a quarter or more of the stories unwritten and more than before) throws the rebuild away, keeps the stored edition, and notes `writing.rebuildFailed`. `isStale` then waits 15 minutes (`REBUILD_COOLDOWN_MS`), so an outage can't burn the day's build limit. A build that throws does the same when an edition exists.
- **The browser no longer pins a bad copy** (`EditionView.runDigest`, `lib/digest-cache.ts`): with a saved copy it applied that and never asked the server again that day, even over a newer edition the server had just rendered. Now the copy is only a first paint, the server is always asked, and the newest revision wins (`digestRevision`: `revisedAt`, else `generatedAt`; `/api/edition` sends it as `revision`). A page in view rechecks every 5 minutes while something is wrong, and on coming back to the tab after 10 minutes. A tab left open past midnight keeps its day.
- **Single stories no longer fail in silence** (`lib/live/digest.ts`): one call wrote the whole paper, so one failure blanked it, still marked `engine: "ai"` and not retried for six hours; a story dropped from the reply or rejected by `looksOnTopic` quietly printed the first 100 words of its page. Now `writeAll` writes about 8 articles a call, 3 at a time (`dealBatches` spreads each section across the calls), then asks again for what's missing, 3 a call, with `<last_attempt_rejected>` saying what was wrong. A typical build goes from 1 writing call to about 6. If the first calls all fail (`geminiLooksDown`) the rest aren't queued behind them. If selection fails, keyword rules pick and `writePaper` still has Gemini write them (`engine: "heuristic"`, `writing.selectionFailed`).
- **Repairs in place** (`repairEdition` in `editions.ts`, `writeMissing` in `digest.ts`): stories marked `DigestArticle.written === false` are retried on the stored edition every 5 minutes (`REPAIR_EVERY_MS`) when the page asks, up to 6 times (`MAX_REPAIRS`, then `writing.gaveUp`). Only those stories change, not the selection or the order, and `revisedAt` moves on, so the page swaps them in without a reload.
- **The lead goes to Gemini's writing** (`pickHeroStory`, `lib/format.ts`): a raw wire story matching an interest scored 80 against a written top story's 70, and page text always passed the 250-character gate where a short paragraph might not. `Story.copy` ("written", "pending", "wire"; absent on older editions, treated as written) now comes before the score: written (a short one included), then pending, then raw feed text as a last resort.
- **What prints instead** (`fallbackText`): the publisher's description, else its feed snippet, each only if it passes `looksOnTopic`; otherwise the headline alone. A page's raw text never prints.
- **Failures shown** (`components/chrome/WritingNotice.tsx`, `components/story/CopyTag.tsx`, `DigestResult.writing`): a notice under the masthead names how many stories, why (`geminiFailure`), whether a retry is coming and when it last tried, with "Try now" (`POST /api/edition { retry: true }`: a repair, or a rebuild if selection or a rebuild failed; counted against the visitor limits). It also covers a server that can't be reached, the build limit (`note`, which the page used to drop) and AI being off. Each affected story is labelled "Summary pending", or "Publisher's text" for raw feed stories. The archive page notes it in the story's line.
- **Headlines and paragraphs can't cross quietly**: selection keeps corpus indices (a slip only picks another whole story). Writing no longer uses them: each article gets a code from its URL (`storyRef`, `s` + hash, so a slip lands on nothing), and the reply must repeat the first five words of the headline (`about`, checked by `aboutMatches`). `repairCopy` uses the codes too. `fitsAnotherBetter` rejects a paragraph that fits another headline at least a quarter better and half or more of it, unless it's plainly from this article's own text (`groundedIn` 60%+). Measured on 108 stored stories: no good paragraph rejected; wrong paragraphs passing the text checks fell from 46 of 3,780 to 10, with the code and echo guarding those. The prompt now says to name the headline's subject, where it used to say not to restate the headline while `looksOnTopic` looked for its words.
- **Cleaner source text** (`fetchArticle`, `lib/live/summarize.ts`): the writer gets the page's JSON-LD `articleBody` (the one whose headline matches), else its `<article>`, else the whole page, and the text itself must match the headline, not the page's title. **Known limit:** the Economic Times page behind the Nov 4 mismatch carries another story's body under its title in its own structured data. It shares words with the headline (0.38, level with real articles at 0.33 and 0.40), so no threshold catches it without rejecting good stories; the prompt's "write from the headline if the text is about something else" is the only guard.
- **Time limits**: `maxDuration` 60 s to 300 s on `/api/edition`, `/api/cron/build` and `/api/cron/daily` (retries need the room); `LOCK_SECONDS` 180 to 300; the page's polling 180 s to 300 s.
- **Diagnostics** (`lib/live/build-report.ts`): `BuildReport.writing` names each unwritten story and why, with calls, failures, `crossed` and `rejected`; repairs update it. `/api/health?report=1&hash=…` reads any edition's report. A report describes the last build attempt, so after a thrown-away rebuild it shows that failure while the stored paper is fine.
- **Store keys and versions**: `BUILD_VERSION` 6 to 7, so an edition from older code is served as it is and rebuilt in the background. Its stories have no `written` flag, so they carry no label and count as written until then. The `edition:*`, `w:*` and localStorage digest keys don't change; saved copies stop being final, nothing is discarded. No new environment variables.
- **Tested** with real feeds and real Gemini on the in-memory store, failures injected at the fetch layer, and in the browser on the real page. Worth knowing: real Gemini also produced a 45 s timeout and an unreadable reply during those runs, both healed by the retry pass, and a rejected paragraph was rescued in an otherwise healthy build.

### Round 20: the running order; one subject on each row (Nov 6 2026)

The reader asked for a page that looks equally good on an ultrawide, a laptop and a phone. Measured before the change, at default preferences: a phone took 40.5 screens of scrolling, about one story a screen, with the first section 3.7 screens down; a 1366 laptop 27.6. An ultrawide printed two unrelated sections on each row, and its menu sat stuck on "Weather" for 8,200 px, because Sky Report printed in row two but came tenth in the menu and the scroll-spy kept the last match. A 2560x1080 ultrawide missed the spread altogether (it needed 2800px and 2:1) and got a centred column with 448 px of margin each side.

Measured after, same preferences, on the local build: phone 26.2 screens, tablet 15.1 (was 21.0), 1366 21.4, 1536 18.5 (24.0), 1920 18.5 (23.7), 2560x1080 15.7 (23.7), 3440x1440 11.5 (10.7). The ultrawide isn't shorter on purpose: it carries one subject per row now where it carried two, under the full-size headers. No sideways scroll at any of the seven sizes.

- **Running order** (`lib/chapters.ts`, new): Today, then News (Dateline, The Nation, Two Cities, Sky Report: far away to the reader's own street), Sport (Paddock Notes, Clutch, Sports), Money (The Ledger, Market Pulse), Next (The Circuit Board, Straw Poll, the reader's own sections, The Week Ahead), Back (The Grapevine, then the editor's note, On This Day, Word of the Day, which the reader prefers at the end of the page; the Back group itself went in the next entry). The groups order the page and name the menu. No title for them prints on the page: a first version printed "Your sport" and the like above each section's header, and the reader asked for no such grouping of headers. `chaptersFor(order)` works them out from `Personalization.sectionOrder`: a chapter sits where its first section sits, sections keep their order within it. `moveWithinChapter` and `moveChapter` are what Settings calls.
- **One subject on each row** (`EditionView`, `app/globals.css`): `lib/spread.ts`, the `uw` variant and the flex `order` and counter numbering are gone. `.edition-body` is a container (`ed`) and each section lays itself out by its width: one column under 700, two from 700, three from 1080 (the lead across two), four from 1700 (the lead and its plate across two, two rows beside it), In Brief in a column of its own from 2200. So 2560x1080 and 3440x1440 now get the same page, and more width shows more of a section, never a second one. Each section's wide layout is a class in `globals.css`: `.paddock-grid`, `.pit-desk`, `.pit-archive`, `.city-stories`, `.sky-layout`, `.pulse-tiles`, `.pulse-prices`, `.poll-top`, `.grapevine-blocks`. CSS zoom (`.page-scale`) stays as it was.
- **One menu, three forms** (`chrome/PaperNav.tsx`, new; `chrome/TopBar.tsx`): `TopBar` takes `chapters` rather than `sections`. A phone gets six words fixed along the foot of the screen (`.paper-dock`, like the live centre's bar) and a plain top row that scrolls away; a tablet or laptop gets them in the sticky top bar; from 1500px a side menu (`.paper-rail`, the bar steps aside): the paper's own index, in its display type, each section in its colour under its group's small label, the one being read filled, and the day's number beside Market Pulse, Paddock Notes and Sky Report (`NavChapter.sections[].note`, from `EditionView`). The scroll-spy reads chapters in printed order, so it can't stick. It also puts the current section's colour on `<html>` as `--now-hue`, worn by the reading progress bar (`ReadingProgressBar`), the top bar's underline and the phone bar's line, so none of them stays one colour all the way down (before, all used `--accent`, whose evening mint read as Markets' green). `--now-hue` isn't stored, and it's gone on pages without this menu. The live dot moved to the Sport chapter (`data-nav="ch-sport"`). The bar is now opaque, so big type no longer shows through it. Other pages' `TopBar` takes no menu and no longer leaves an empty row on a phone.
- **Stories** (`story/StoryArticle.tsx`): from 1024px the whole summary prints with Read at and Share, and there's nothing to open (the reader's request). On a phone or tablet: the headline and two lines (three on the lead, or from 700px), and a tap on the text or "More" opens the rest in place, as does arriving from a briefing line (a `hashchange` listener). All of it is always in the page; `.story` CSS decides what shows. Individual stories no longer fade in on scroll; a dense page full of them was noise.
- **Plates** (`CoverArt`): the front-page lead keeps its plate from 1024px. A section's lead has one only from 1700 (`.story-plate`), where it fills real room. None on phones or tablets.
- **Masthead** (`masthead/Masthead.tsx`, `ParticleWordmark.tsx`, `SignalRow.tsx`): the wordmark is 64 to 86 px tall (was up to 210) and always one line (`fitLines` removed). The tagline moved to the footer; "Touch the type" is gone (the wordmark still responds). Listen and Refresh moved under the briefing. Three number cards: markets, next race, weather. The word-of-the-day card is gone, since it printed twice. A phone's cards show the number alone, so nothing cuts off.
- **Briefing**: tighter, and a line pointing at the same article as the lead is skipped, so a brief can print five lines rather than six (`briefLines`, `EditionView`). `HeroStory`'s headline sizes came down a step, so the briefing fits beside it.
- **Section by section**: section headers are unchanged from before this round, big and with their thick coloured rule (a first version made them a third of the size, and the reader preferred these), with less air above them (`.paper-section` 3.5rem, was 6.5rem). Sky Report stays a printed section, more compact (`.sky-layout`, the sun arc capped at 300px). Every F1 table stays printed at every width (the reader's request); Who wins Sunday and Coming up moved from the desk to the end of the row of tables (`StartingGrid part="calendar"`), and the stories flow down two balanced columns (`.paddock-stories`), so the stories and the desk end close to level. Cards on one row are one height: the row of tables stretches (`.pit-archive`), and with the room it rearranges so nothing's left short (`.pit-result`, `.pit-you`, `.pit-teams`, `.pit-drivers`, `.pit-wins`, `.pit-coming`). Clutch's transfer window shows as many posts as fit its neighbour (`SocialList fill`), so the two columns end level. `MoodGauge`: breadth, the day's moves and past readings print where the card runs two rows of tiles tall (a laptop or desktop, `.pulse-tiles .fold`), and open in place on a phone or ultrawide (`chrome/Fold.tsx`, new), where it's only as tall as it needs. Clutch off-season: the stretched empty card is gone. You Should See This shows three posts, six from 2300px (`lib/use-media.ts`, new). Two Cities drops the state and coordinates line.
- **No new pop-ups** (the reader's request): what a phone can't print by default opens in place. `Fold phoneOnly`: Where else the money is, Trending on X and Reddit, the Puzzle Desk. These hide a whole block, so on a phone each is a card of its own (`.fold-card`: the section's colour, a title, a line on what's inside), where "See all 20 posts", which only adds to what's showing, stays quiet text. Also two of four index tiles and three moves on a phone, with a tap for the rest. Swipe rows: the two Straw Poll leads, commodities and crypto.
- **Type and touch**: nothing under 11 px outside `components/f1/` (it was 9 to 10.5, about 4,900 characters at 10 px) and outside chart labels drawn in SVG. Under `pointer: coarse`, chips and icon buttons are 44 px.
- **Settings** (`onboarding/PageOrderList.tsx`, `PersonalizationForm.tsx`): the list is under the menu's group headings. Arrows on a section stop at its group's ends; arrows on a heading move the group.
- **Past editions** (`app/archive/[date]/page.tsx`) are a plain page of their own and don't use this layout. On an ultrawide their summaries ran 2,709 px wide; stories now run in as many 22rem columns as fit.
- **Left alone**: the live centre's views, the archive calendar, and the digest and data pipelines.
- **Store keys and versions**: none changed. `sectionOrder` keeps its shape and no saved order is rewritten until the reader moves something in Settings (the saved list is then tidied into chapter groups). `SECTION_ORDER`'s default moved `sky-report` after `two-cities`; what prints is the same for any saved order, since the groups order it anyway.
- **Tested**: at seven sizes (390, 820, 1366, 1536, 1920, 2560x1080, 3440x1440) on the real page, in a headless browser, with both editions looked at on the ultrawide. Which menu shows where, full summaries from 1024px and cut ones below, a tap and a briefing link opening a story, the dock's jumps, folds opening with no pop-up, the F1 tables and Sky Report printed at each width, a saved custom order, hidden sections emptying a chapter, the Settings arrows, the archive and live centre. Not tried on a real phone; emulated only. The dev server's hydration warning on `[data-reveal]` cards predates this (`MotionRuntime` adds `is-in` before hydration reaches them).

### Round 20, second pass: icons, publisher logos, one bar on the phone, sheets (Nov 6 2026)

The reader's requests after using the first pass on a phone, and two ideas taken from a friend's mobile site. Measured after, same preferences: phone 27.0 screens (26.2 before this pass: the story foot and whole first sentences cost about a screen), tablet 14.9, 1366 21.7, 1536 18.7, 1920 18.7, 2560x1080 15.9, 3440x1440 11.7. No sideways scroll at any of the seven.

- **Back is gone** (`lib/chapters.ts`): four groups. The Grapevine joined Next, after the reader's own sections and The Week Ahead (`itemsOf` in `EditionView` builds the one order the menu and the page share). The day's extras print after every group, whichever comes last, then the footer. The footer has its outlined wordmark back and no "That's today's paper": the paper changes through the day, so it doesn't claim to be finished.
- **Phosphor icons** (`@phosphor-icons/react`, new dependency; `chrome/nav-icons.tsx`, new): `CHAPTER_ICONS`, `sectionIcon(id)`, `deskIcon(label)`. They draw in the colour of the type, so one icon suits both papers. Server pages import from `@phosphor-icons/react/ssr` (the archive pages); everywhere else the main entry. `chrome/MoveArrow.tsx` (new) is the one up and down mark for a move.
- **The phone's menu** (`chrome/PaperNav.tsx`): five icons with words, outline when inactive; the current one filled, in its section's colour, on a tint of it (`.paper-dock`). The bottom bar and the progress bar are one: `.dock-line` is a line along its top with a piece per word, filled as that part of the page goes by, so it always ends above the current word, and `.reading-bar` hides on the paper on a phone. A slim row (`.phone-now`) slides in at the top once the masthead has gone, naming the section in its colour, with "Sections" opening a sheet of all of them. `scroll-padding-top` leaves it room.
- **The top bar and the side menu**: the same icons. The side menu's colour bars (`.rail-row::before`) gave way to an icon in the section's colour (`.rail-icon`).
- **Sheets on a phone** (`PHONE` in `lib/use-media.ts`): the whole top list in The Search Bar, Trending's top 20, every driver in a result, all teams and drivers in the championships, all of a market's indices (`pulse-all`), all moves in Straw Poll (`poll-all`), the rest of The Week Ahead, and every `chrome/Fold.tsx`, so there's nothing to collapse again. This reverses the first pass's "no new pop-ups" at the reader's request. Anything bigger than a phone still opens in place. A story's More stays in place.
- **Stories** (`story/StoryArticle.tsx`): on a phone or tablet the summary's first whole sentence replaces two clipped lines (`splitFirstSentence`, `lib/format.ts`: skips abbreviations and takes the next sentence when the first is under 40 characters). Source, time and share sit on one row at the story's foot (`.story-foot`, `ShareButton iconOnly`), with the caret for More. `margin-top: auto` lines the feet of a row up. `.story-actions` is gone.
- **Publisher logos** (`lib/publishers.ts`, `story/PublisherMark.tsx`, `public/publishers/`, all new): 61 publishers, each a `<slug>.light.png` and `<slug>.dark.png` at 96px, swapped on `html[data-edition="evening"]` (`.pub-logo`). Most are official 512px app icons (Apple's public search), the rest large icons from the publisher's own site or a brand SVG, chosen by hand and looked at, because the first fetch from favicon services gave 16 to 48px marks and the reader caught Wired's. The smallest source is 128px, so nothing is enlarged. The RBI's is its seal, from Wikimedia Commons. They're saved in the project, so reading the paper asks no third party anything. An unknown publisher gets a letter tile (`.pub-letter`) in a colour from its name. Used in story feet, the lead, the share card, Clutch, Straw Poll, the odds cards, the rates row, Postcard and past editions.
- **Icons in place of glyphs and labels**: card and block labels through the paper (Who wins Sunday, Coming up, Your paddock, championships, Rates, Who's buying, IPO watch, Mood, Sky's meters, Week Ahead kinds, the Briefing's desks, From the editor and the rest) and every remaining text arrow, star and tick, including Settings, onboarding, the archive and the live centre: `↗` to `ArrowSquareOutIcon`, `▲▼` to `MoveArrow`, `★` to `StarIcon`, `✓` to `CheckIcon`. Left as they were: the weather drawings (`WeatherIcon`), X and Reddit's marks, map glyphs in `MatchStats`, `·` separators, and a `→` joining a race-control message's history (it's in a text string). Straw Poll's headline moves became `+12 pts`, since they sit in a text string too.
- **Fold cards** (`chrome/Fold.tsx`): a duotone icon, the title, a line on what's inside, an arrow in the section's colour, replacing the left bar.
- **Store keys and versions**: none changed. A saved `sectionOrder` keeps working: `grapevine` now falls under Next.
- **Tested**: 41 checks in a headless browser on the real page (phone, 1366, 3440): which menu shows where, the dock's icons, colour and line, the Sections sheet, each phone sheet opening with the page staying the same height, one logo showing, no web address in a story foot, no Back anywhere, a saved order, hidden sections, the Settings arrows, the archive and live centre. All moves and Where else the money is weren't on the page on the day, so those two sheets weren't opened. Looked at in both papers at all three sizes. Not tried on a real phone.

### Round 20, chart pass: market charts that agree with their cards (Nov 6 2026)

The reader said the charts were weird and inaccurate. Measured on 6 November: 6 of the 16 index charts reported the wrong move for today, because Yahoo's `chartPreviousClose` on a `1d` request was one session too old for those markets. The Nifty 50 read +3.68% against a true +1.25%, and Nifty IT (+2.22% against −0.19%) and Hang Seng (+2.35% against −1.27%) pointed the wrong way. The cards' own figures were right. Afterwards, card and chart agree on all 22 markets for the day, and on all 16 indices for the month.

- **The start of a move** (`startOf`, `lib/live/charts.ts`): a day starts from what Yahoo's own `fulldayPrice` and `fulldayChangePercent` imply, the same figures the card prints. A month starts from the first daily close in the window, as the card's 1M does. Longer ranges have no figure on the card to match, and use Yahoo's as given. Commodities convert a day's start at the rupee rate of that close, as the card's move does.
- **The card's line** (`widgets/DayLineChart.tsx`, new; `DayLine` in `lib/types.ts`; replaces `SparklineChart` and the `sparkline` field on `MarketIndex`, `Commodity` and `CryptoQuote`): it was the last seven closes beside a figure for today, coloured by today, and always stretched to its box. It's now the day itself (`today`), against a dashed line at the level the day's move starts from, coloured by which side of it the price is on, and the scale never runs tighter than 0.6% of the price. `dayLine` (`lib/live/indices.ts`) works the base out from the card's own price and move, and ends the line on the card's price, so the two can't disagree. Each carries at most 48 points. A market with no new price for 30 minutes prints "Closed · Thu 5 Nov" in its own time zone (`MARKET_TZ`); `fetchSessions` asks again for five days when `1d` has nothing, and `lastSession` takes what follows the last long gap. Crypto is 24 hours of Binance's 5-minute bars.
- **Gold and silver**: the card's price stays IBJA's rate. IBJA has no intraday prices, so the line is COMEX in rupees and says so ("Line: COMEX in ₹", `DayLine.source`). The two can point opposite ways, since they aren't the same market or the same hours. The chart sheet labels its number "COMEX in rupees, live" and lists the IBJA rate under the chart.
- **The chart sheet** (`widgets/MarketChartSheet.tsx`, `PriceChart plain`): a thin line, a dashed start, a dot on the latest price, no grid, and no numbers on the axis except on candles. A finger or pointer anywhere reads that moment (an element over the canvas calling `setCrosshairPosition`, with `touch-action: pan-y` so a vertical swipe still scrolls). Candles are behind an icon beside one row of ranges. A day bar and a 52-week bar (`RangeBar`) replace most of the number grid; Open, Volume where there is any, and the 50- and 200-day averages stay. The chart library stays.
- **Every range ends near the live price**: the longer ranges' caches came down from up to six hours to at most 15 minutes (`revalidate` in `charts.ts`; `/api/chart` to five minutes), and the number at rest is always the day's latest price (`day` in `MarketChartSheet`). Before, changing range changed the number.
- **Rates row** (`widgets/RatesRow.tsx`): labels no longer cut off on a phone. A text source (FRED, Yahoo) prints from 640px, the RBI's seal always; Who's buying's date moved beside its legend.
- **Cost**: one more Yahoo spark request a minute at most for the cards (a second on a closed day), and one for each chart opened. `/api/markets` is 18 KB.
- **Store keys and versions**: none changed. An edition or last-good copy saved before this has no `today`, so a card holds its space with no line until the next refresh, within a minute on an open page. Old `sparkline` fields on saved copies are ignored.
- **Tested**: every market's card against its chart, for the day and the month, on live data; a pointer and a touch reading a point and letting go, at phone and laptop size, in both papers. 41 regression checks pass. Page length moved by 0.1 screens at most. The Dow's 1M read exactly 0.00% on both on the day. Not tried on a real phone. An emulated phone reports a chart canvas at single density, which looks soft in screenshots; a real 2× window reports 2×, so it's not a fault in the page, but it's worth a look on a real phone.

### Round 20, F1 card pass: the race result card, and three fixes (Nov 6 2026)

- **The race card's head** (`StartingGrid`, `.result-check`, `.result-title`, `.result-sectors`): a chequered band along the top edge, the race's name in large leaning capitals, and the weekend's stages as a run of slanted timing sectors, the current one in F1 red. It applies at every stage of a weekend; a sprint weekend's five stages fit a phone.
- **The podium** (`widgets/RacePodium.tsx`, new; `.podium-*`): the reader chose this from two mockups. P2, P1 and P3 stand on slanted steps in their team's colour, above a black name plate with their three-letter code, team logo and time. The plate is black on both papers so its type always reads, and the number takes dark or light from the team's colour (`isLightTeamColor`), where it used to be the paper's colour whatever the step's. A winner's time prints as a timing screen writes it, `2:20:28.772`, which also fits a phone's narrow plate. Portraits come from `driverPhotoByCode`, on the F1 image server the team logos already use. A driver with no portrait, or one that fails to load, gets the team's logo on the step (`.podium-mark`).
- **Head to head** (`YourPaddock`, `VersusBar`): the label sat across two team colours with `mix-blend-mode: difference`, which came out maroon and orange. No text colour reads on both, so words and counts moved above the bars, in the paper's ink. Names are in ink with a square of the team's colour, because Mercedes mint as text didn't read on the morning paper. Both bars are solid; the leader's count is bold.
- **The market line** (`DayLineChart`, `.day-line-draw`, `.day-line-dot`): a dash animation with `pathLength` doesn't work on a `vector-effect: non-scaling-stroke` path: dashes are measured on screen, so a hole travelled along the line for 1.8 seconds until the animation ended. The first `SparklineChart` had the same fault. The whole line now uncovers from left to right in 0.7 seconds with `clip-path`, then its dot appears, so it can't show a gap. `.stroke-draw` stays for the sun arc, which isn't affected. Reduced motion skips it.
- **"Car 50"** (`withRaceDrivers`, `lib/live/f1.ts`): labelling the race result used the season's static roster only, while practice and qualifying also read the session's. A stand-in in a race printed as a bare number with no team: Ryo Hirakawa, in Haas's seat in Mexico City, was P10. The race now reads the session's roster and, when OpenF1 is locked, Jolpica's classification. It costs nothing on a weekend with no stand-in.
- **Rows on a zoomed page** (`StartingGrid`): the table compared a row's zoomed height with the box's unzoomed height, so from 1920px it printed too few rows and left about 170 px blank under them. The zoom is now taken out, as in `lib/use-fit-rows.ts`.
- **Store keys and versions**: none changed. A race result the store already holds is labelled when it's read, so the name corrects itself.
- **Tested**: at 390, 1366, 1920, 2560x1080 and 3440x1440 in a browser, both papers looked at: podium aligned with the head and no time cut off, portraits loading, the fallback forced by firing each portrait's error event, a sprint weekend's sectors on a phone (written into the page, since none is on), the line frozen part way through its reveal, and Hirakawa's row from the API and on the page. Not tried on a real phone.

### Round 20, navigation pass: one menu in one place on every page (Nov 6 2026)

The reader reported the archive and settings icons moving between pages, and that clicking settings on settings did nothing. Measured before, at 1920 wide, the settings icon was at (139, 1027) on the paper, (1753, 15) on the archive and live centre, and (1524, 12) on settings, at 40 px on the first two and 32 px on settings, which wasn't zoomed. Below 1500 px it was already in one place on every page.

- **The side menu on every page** (the live centre's lists its own views since the next entry; `chrome/SiteNav.tsx`, new; `Rail` exported from `PaperNav`; `.with-rail`): from 1500 px the archive, a past edition, settings, the live centre and the loading skeleton (`PageSkeleton`) print the paper's side menu, and their top bar steps aside. Its links go back to that part of the paper. Settings now sits inside `.page-scale` like the rest, so it's zoomed on big screens and its save bar starts after the menu (`.settings-save`).
- **The words on a tablet or laptop** (`TopBar linkBase`): those pages' top bar carries Today, News, Sport, Money and Next too. A phone keeps its plain row: settings has its save bar along the foot of the screen, and the live centre its own.
- **The same words as the paper** (`lib/nav-menu.ts`, new): the paper saves its menu as it prints, in the reader's order and with their own sections, without the day's numbers, and `useSavedMenu` reads it. Before the paper has been opened on a device, the usual running order stands in.
- **The icons** (`TopBarTools`, `SettingsLink`, `leaveSettings`): the archive's no longer swaps to a newspaper. The icon for the page you're on fills, and a second click goes back to the paper. Settings goes back with `router.back()` when it was opened from the paper, as its own button does. `TopBarTools`, `TopBar` and `PaperNav` lost `isArchive`: the address says.
- **Unsaved changes** (`SettingsPageClient`): with any, a link in the menu stays put and the save bar says "Save or discard your changes first". One click listener in the capture phase catches every link under `[data-site-nav]`, before the link's own handler.
- **Arriving at a section** (`PaperNav`): a link from another page lands on `/#section`, perhaps before it has printed, and sections above it can grow as they load. It goes there and goes again whenever the section moves, until it has held still for two seconds, or the reader touches the page.
- **Not changed**: the Search Bar's World tab. Google's `i0OFE` call now answers permission denied (code 7) for every country tried, so India and the US fall back to the public feed's ten searches, and World, made only from that call, comes back empty and its tab goes. The reader chose to leave it in case it returns.
- **Store keys and versions**: `daily-index:menu` (localStorage) is new. It's rewritten at each print and nothing depends on it being there.
- **Tested**: on a production build, at 390, 820, 1366, 1600, 1920, 2560x1080 and 3440x1440 on the paper, archive, a past edition, settings and live centre: the icons' position and size match on all five, no sideways scroll, no page errors. Second clicks, the hold with unsaved changes from an icon and a menu link, a menu link from the archive landing on its section, and a saved order matching word for word. Not tried on a real phone.

### Round 20, live centre pass: the same menu, icons and type as the paper (Nov 6 2026)

The reader asked for the live centre to feel like the paper: the same navigation at every size, icons in place of text where they read better.

- **The views as a menu** (`f1/LiveNav.tsx`, `f1/live-views.ts`, both new; `RailFrame` from `PaperNav`; `TopBar items`): the paper's three forms and breakpoints. From 1500 px the side menu lists Today, Live, Analysis with Tyres, Lap chart, Pace and Stewards under it, Feed, Weekend and Season, with the three tools where they are on every page. From 768 px the top bar lists Today and the views. A phone gets the paper's bottom menu (`.paper-dock`), its line as the reading bar: views before this one full, this one filling with the scroll. Outline when inactive, filled in F1 red when current; `--now-hue` is `--hue-f1` here. A slim row (`.phone-now`) names the view once `#live-head` has gone, with all of them in a sheet. The row of view buttons and the old phone bar are gone. Analysis keeps its parts switch on the page below 1500 px (`.analysis-subs`).
- **One source for where you are**: `useLiveView` reads the address, and `goToView` changes it and fires `f1-view`, so `LiveCentre` and `LiveNav` can sit apart and can't disagree. A session with no lap chart moves `#analysis/laps` on to Tyres, so the menu follows what's showing. The old links (`LEGACY`) moved with it.
- **Icons** (Phosphor; `Panel`, `Tile` and `Seg` take `icon`): weather and lap tiles, every panel's title, the Feed's filters and row marks (`Glyph` redrawn), radio's microphone, stewards' states and penalties, open and decided cases, the Weekend's circuit facts, session temperatures and history heads, Season's records, the driver pop-up's stats, telemetry's gauges, and the controls drawn by hand (close, play, pause, bell, headphones, delay, past sessions). In the Feed, a row's kind stopped being printed under it, since its icon says so; a screen reader still hears it. "Track temp" became "Tarmac", which fits a phone's tile. The followed driver's "Best" and "to fastest" became a lightning mark, and "used" a striped swatch.
- **Left as they were**: timing columns, lap and sector times, the results grids and strategy bars, which are data, and DNF, Out and KO, which are precise. Also the stewards' own small drawings (`StewardIcon`), the chequered and black-and-white flags in the timing table, the tyre mark (`TyreIcon`) and map controls in `TrackMap`.
- **Type**: 165 sizes of 8.5 to 10.5 px in `components/f1/` went to 11 px, so nothing outside SVG labels is under 11 px on any page. Effect, old production build against new: at 1366 every panel is within 4 px, and whole views are 0 to 11% shorter with the button row gone. A phone's stewards view is the most it grew, 4%. On a phone's timing table "Interval" became "Int", the time columns stopped sharing spare room with the driver's, the pit column narrowed, and the chequered flag steps aside once a session is over, so a name and DNF fit.
- **Store keys and versions**: none changed.
- **Tested**: on a production build at 390, 1366 and 1920: all three menus' words and current state, going to each view and part from each, the sheet, the line filling, Today, the icons' place matching every other page, and every view's height, cut-off text and sideways scroll against the previous build. No page errors. Not tried on a real phone, or during a live session: between sessions the page shows the last race, so the running-only states (pit lane, alerts, commentary, delay) were checked in code and by types only.

### Round 20, live centre fit pass: a whole season's data, level cards, 3440x1440 (Nov 6 2026)

The reader's Season view showed Antonelli on 297 points against a real 380, and the Weekend's poles were empty. They also asked for the live centre's cards to end level, and named 3440x1440 as the size it should work best at.

- **Jolpica paced** (`lib/live/jolpica.ts`, new: `jolpicaGet`, `jolpicaRaces`, `JolpicaUnavailable`): `pages` in `f1-season.ts` sent 15 requests at once and returned an empty list for any that failed, so a 429 quietly removed whole rounds from the totals and a circuit's poles from its history. All Jolpica calls (`f1-season.ts`, `f1-h2h.ts`, the `jolpica` helper in `f1.ts`) now queue 300 ms apart, wait and retry a 429 or 5xx up to four tries, read pages one after another, and throw rather than return part of an answer. Checked on a cold server against Jolpica's own standings: ANT 380, VER 261, HAM 259, RUS 250. With four routes hit together, all four answered in 20 seconds.
- **A failed read keeps the last good one** (`getSeason`): a complete season is kept 3 hours as before and 30 days under a second key, which is served if a rebuild fails. A throw from `circuitHistory` is caught in `f1-weekend.ts` and `/api/f1/benchmarks`, so the Weekend still prints without history.
- **Which F1 source does what, as it stands**: the live centre reads F1's own timing feed; its Season, head-to-head, history and benchmarks read Jolpica; the main page's sidebar and calendar read OpenF1 first, then the kept copy, then Jolpica (see F1 sidebar and markets (current)). OpenF1 stays out of the live centre at the reader's request, and it answers 401 to keyless callers during any live session and holds nothing before 2023. The stale header in `f1.ts` that credited OpenF1 with the standings is gone, and the README now names Jolpica.
- **Cards end level, on a laptop too** (`.pace-grid`, `.pace-rows`, `.bench-list`, `#track .live-map`, `.week-form`, `useFitRows` in `Stops`): the Pace benchmarks run as a row over Speed traps and Best sectors; the map grows to fill its card; Across the weekend's table fills its height; Quickest stops shows as many rows as fit beside the strategy chart. With no timed stops there is no empty card, and the chart takes the row.
- **From 2400 px** (the `min-width: 2400px` block in `globals.css`; 2560x1080 and 3440x1440): `.live-page` drops the page's width cap. Live is three columns (order, map and followed driver, feed) with Stewards under them. The order's rows share the column's height (`.timing-box`, `.timing-rows`), so it ends level with the map instead of leaving a gap. The Feed view reads in three columns with its filters on top. Tyres and Stewards sit side by side. On the Weekend, Across the weekend turns on its side, a driver a column across the full width (`week-form-across` in `Form`, `Place` shared with the upright table), with Recent years, Lap benchmarks and After this sharing the row under it. The upright table's 22 rows had left blank space in the cards beside it; 3440x1440's Weekend is now 1.5 screens, with no card half empty.
- **Names fit** (`LiveTiming`): the driver column's share rose from 1.4–1.5fr to 2.4fr, and the chequered flag, which steps aside on a phone once a session is over, now does so at every size, since everyone has it by then. Names cut short at 1536, 1920 and 2560 went from 14 rows to at most 2.
- **A wrong round** (`after` in `Weekend.tsx`): After this skipped the next round when it fell within two days, so Mexico's page went from round 19 to 21. It now lists the rounds after the one on show.
- **Store keys and versions**: `f1:season:v5` → `v6`, `f1:circuit-history:v2` → `v3`, `f1:bench:v3` → `v4`, because the old copies could hold partial answers. They are no longer read, and expire by themselves within a week. `f1:season:last:v1` is new (30 days).
- **Tested**: on a production build at seven sizes (390x844, 820x1180, 1366x768, 1536x864, 1920x1080, 2560x1080, 3440x1440), every view: no sideways scroll, nothing under 11 px, no page errors, cards level but for a tall card beside a stack that ends level with it. The menu, navigation and interaction checks all pass. On a phone, row 18's DNF and steward mark still clip slightly. Timed stops come from the store, which is empty on a cold local build, so Quickest stops' fitted rows were not seen on the final build, only its absence. Not tried on a real phone or in a live session.

### Round 20, session switching pass: opening live, moving between sessions, the Pit wall's table (Nov 6 2026)

The reader said a live session sometimes took a while to open from the main page, and asked for switching between live and past sessions to be intuitive and smooth, and for the main page's table during a session to be checked.

- **A live session opens at once** (`getLive`, `readSession` in `lib/live/f1-live.ts`; `lib/use-f1-live.ts`; `app/f1/live/page.tsx`): three things held it up. A read that found another reader refreshing, or a feed that didn't answer, said `{ live: false }`, and the page took that for "no session" and didn't look again for 60 seconds. A first look after 5 quiet seconds waited for a whole read of the feed and the car data. And the page itself waited on the server for the weekend's timetable before asking for anything. Now the page waits for nothing on the server and reads the timetable beside the session (`/api/f1?part=map`). A page's first look (`&first=1`) takes the latest copy of the running session, up to 10 minutes old, while the read carries on behind the answer (`after` from `next/server`), and looks again 1.5 seconds later. A read that can't get the session answers `retry: true`: nothing on screen changes and the page asks again every 1.5 seconds, six times at most, before it counts as no session. So the Pit wall's card no longer flips back to the race result for a moment either. The live centre also looks every 5 seconds whenever the timetable says a session is on, instead of every minute. Later polls still wait for the fresh read, so timing during a session is no staler than before.
- **Between sessions and back** (`ArchiveStrip`, `useOnTrack`, `pathLabel` in `f1/LiveCentre.tsx`; `f1/PastSessions.tsx`): viewing a past session, a strip stands where "Nothing on track" does: Archive, the session's name and one tap back to the latest. When the timetable says a session is on it turns red and reads "Live now · FP1" ("Starting soon" from 15 minutes before). While a picked session loads, what's on screen stays and dims (`answeredFor` from `useF1Live`, `aria-busy`), and the button and strip already name the new one. The list marks the session on show even when it's simply the latest, has the same "Live now" row at the top, and is a sheet on a phone. Picking the latest session goes back to the plain address, so one race doesn't have two addresses.
- **"Live" means live** (`useViews`, `setOnAir` in `f1/live-views.ts`): the first view reads "Timing", with a list icon, when no session is on, and "Live" during one. The address stays `#live`. On a phone, the status now shows in the line above the heading while a session is live or replaying.
- **The right copy of a past session** (`pastSession`): an earlier read of F1's archive was preferred over the copy kept when the flag fell. The archive can stop short: its Mexico 2026 race ends at lap 57 of 71, with Hamilton +1.233 instead of the official +0.799. The kept copy now comes first. Production's Weekend figures already matched Jolpica for the six of the last seven races checked, so this is a guard. Mexico's replay still ends at lap 57, since that's all F1's recording holds, and the bar now says so (`ReplayBar`).
- **The Pit wall's table during a session** (`f1/LiveCard.tsx`, `StartingGrid`): the card sat in a block that stretched while it didn't, so it stopped at 8 rows with a gap of up to 440 px below at 3440x1440. It now ends level with the cards beside it and shows as many drivers as fit, measured from the distance between real rows (18 of 22 at most sizes from a laptop up). The last row no longer runs into "Show all" (the row height was assumed, and wrong), and above a phone a long race control message shortens rather than taking a second line. On a phone, "Show all" opens a sheet and stays on one line.
- **Names and DNFs in small tables** (`statusWord`, `movedWord` in `LiveTiming`): on a phone and in a card, DNF, Out and KO moved to the first time column, and a phone's column gaps tightened. Before this every DNF row clipped at 375 px and below; now nothing clips from 360 px up.
- **Round numbers** (`withOfficialRounds` in `lib/live/f1.ts`; `seasonSessions`): the Pit wall read São Paulo as Round 22 when it's Round 20, because OpenF1's season still lists cancelled rounds. Past sessions showed Miami as R6, from F1's index. Both now agree with Jolpica across all 19 past meetings.
- **The tab icon** (`app/icon.svg`, `app/apple-icon.tsx`): the old icon's 25 purple and mint dots blurred at tab size. It's now DI in the masthead's type (Big Shoulders 800, outlined, so no font is loaded), leaning like the big headings, over a section's red rule, on a dark tile, or a light one where the browser reports a light theme.
- **Radio transcripts, tested, not changed**: Groq's Whisper against Gemini on Mexico's 25 clips (a script outside the project; the app doesn't read `GROQ_API_KEY`). `whisper-large-v3` shared 81% of its words with Gemini on the 12 clips Gemini had written, and `whisper-large-v3-turbo` 60%. Whisper misheard names and terms ("hit by a mask" for Max) and gave no words for 5 of 25 clips. It has no speaker labels; a text model can add them, but it gets mid-line speaker changes wrong. Gemini stays the writer.
- **Store keys and versions**: none changed.
- **Tested**: on a production build against the real São Paulo FP1. The running order opened in a median 399 ms against production's 1,463 ms over 29 openings of each (slowest 2,131 ms against 3,733 ms, both the first of the run), and the main page's card, the click through, "Live now" over a past session and the tap back all worked at 3440, 1536, 1366, 820 and 390. Production never answered "no session" in those 29 openings, so the 60-second stall wasn't seen live: the retry was tested by feeding the page two `retry` answers, when it opened in about 3 seconds and never said "Nothing on track". The seven-size audit, the menu checks and all 41 behaviour checks pass. The dimming, strip and picker were also checked on production's data. Not tried on a real phone, and a cold local server has no kept copy of a past race, so its Mexico still reads lap 57 there.

### Round 20, last visual pass: a finished session's numbers, and each side's Gemini models (Nov 6 2026)

The reader reviewed the suggestions from the live centre's visual check and asked for all six, and for radio and the paper to stop sharing anything.

- **The followed driver, once a session is over** (`SessionResult`, `SessionSummary`, `SessionFigure` in `f1/LiveCentre.tsx`): the car ahead and behind, stint, last laps, clipping and "if they pitted now" were all dashes after the flag. They give way to the result (grid to finish, places gained or lost, or DNF and the lap) and four figures: best lap rank, top speed and its rank, quickest stop (or laps, off a race) and the stewards. During a session and in a replay the card is unchanged. The card is shorter, which also shortens the page.
- **Stewards** (`Stewards` in `centre/Analysis.tsx`): four tiles at the foot of Open cases from a laptop up: penalties, seconds added, cleared and track limits, so the card isn't half empty when few cases are open.
- **Weekend's circuit tiles** (`Weekend.tsx`): Corners also gives the race laps, and A pit stop costs gives the session's quickest stop when stops were timed.
- **Smaller changes**: the alert pop-up sits below the row of controls it used to cover (`centre/Alerts.tsx`). The Fastest lap tile reads Best lap, which fits a phone. From a container width of 1700 px, Paddock Notes' stories take a narrower column (1.15:1, was 1.5:1), so they run longer beside the Pit wall. The map's loading card no longer pushes the page sideways on an ultrawide, since its fixed shape stretched with the row.
- **More stories, not done**: the number of Paddock Notes stories is the F1 section's article count in the reader's preferences, and more stories means more of the paper's Gemini calls. The column change above was made instead, which narrows the gap without adding any.
- **Radio on its own key, always** (`lib/live/f1-radio.ts`): the fallback to `GEMINI_API_KEY`, the shared model list and its 60-a-day cap are gone. Without `GEMINI_F1_API_KEY` radio is off and the page stops asking. Writers in turn: gemini-3.6-flash, 3.7-flash, 3.5-flash, then gemini-3.5-flash-lite and 3.1-flash-lite. gemini-3.8-flash is left for the paper. The second listen goes to Flash-Lite, then gemini-3.5-transcribe, so the Flash models' 20 a day all go to writing. A race's 100 or so calls fit well inside Flash-Lite's 1,000 a day.
- **The paper's order in the environment** (`summaryModels` in `lib/server/gemini.ts`): `GEMINI_MODEL`, then `GEMINI_FALLBACK_MODEL`, both of which can list several. If no fallback is set, gemini-3.5-flash-lite and 3.1-flash-lite follow, so a Flash model's 20 a day can't stop the paper. `GEMINI_FALLBACK_MODEL` used to replace only the second of those; now it replaces both. Vercel's `GEMINI_MODEL` is gemini-3.8-flash.
- **Store keys and versions**: none changed. Radio's per-minute and block keys were already `f1:radio:*:own:*` with its own key; the `shared` ones and `f1:radio:day:*` are no longer read and expire by themselves within two days.

### Round 20, insights pass: a session written up, and why a market moved (Nov 6 2026)

The reader asked for Gemini to add insight where it fits, as part of the page and without getting in the way. These designs were approved as screenshots on the real pages. A fourth, Catch me up, is being redesigned and isn't built.

- **Session recap** (`lib/live/f1-insights.ts`, `/api/f1/insights`, `SessionRecapCard` in `f1/centre/Insights.tsx`, `Weekend.tsx`): under the session cards on the Weekend, about the session on show, with the result card's chequered edge. A headline, the story, and for a race the flag stretches along a lap bar and the turning points by lap, which open the Lap chart. The lap bar comes from race control itself; only the words come from Gemini, given the classification, race control and the championship order and told to use nothing else. A phone shows the first sentence with More in place. Only once a session is over.
- **On the main page** (`widgets/RaceRecapLine.tsx`, `StartingGrid.tsx`): the headline and first sentence under the podium on the race result card, linking to the Weekend, when the latest race's recap is about the race on the card.
- **Radio moments** (`momentsFor`, `RadioMoments`, `.moments` in `globals.css`): three to five clips in cards in the team's colour with the driver's photo and a play button, chosen once at least four clips have transcripts, and chosen again when five more have arrived. Above the panel in the Feed view; at the top of the Feed column on an ultrawide and a phone; left out of a laptop's short Feed panel. A quote must appear word for word in that clip's transcript, or the clip is dropped. `usePlayer` now stops any other player's clip.
- **Why it moved** (`lib/live/market-why.ts`, `lib/live/news-search.ts`, `/api/markets/why`, `widgets/MarketWhyLine.tsx`, `MarketChartSheet.tsx`): between the region cards and index tiles in Market Pulse, and under the move in that region's chart, only when the region's average is 1% or more. One sentence on what today's headlines credit, worded as reports rather than fact, with its source. Publishers the paper knows are preferred. If the headlines give no reason, nothing shows. `searchNews` moved out of `/api/odds/why`, which behaves as before.
- **Which key and model**: the recap and moments use radio's key and order; why it moved uses the paper's key with `GEMINI_LIGHT_MODEL`. The test used `gemini-3.5-flash-lite` for both after the day's Flash calls had run out. A race costs about two calls more than before, and why it moved at most eight a day.
- **Guards**: a race copy that stops short of the flag gets no recap (`cutShort`), since F1's archive can end early. One attempt at a time per session, with five minutes between tries after a failure, so a busy minute only delays it.
- **Store keys and versions**: new: `f1:recap:v1:<session>` and `f1:moments:v1:<session>` (400 days), `markets:why:v1:<region>:<day>:<direction>` (a day, an hour after a failed call). Nothing older changes.
- **Tested**: on a production build with real Gemini calls on the United States race: recap, six transcripts and moments, and the market line, plus the seven-size audit, the navigation checks and all 41 behaviour checks. Lap numbers were checked against that race's race control. Radio's order ran for real, with `gemini-3.6-flash` then Flash-Lite. Not seen: the line under the podium, since the card only shows its podium outside a race weekend, and it would first show after Sunday's race. Not tried on a real phone.
