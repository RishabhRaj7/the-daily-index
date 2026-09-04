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
| `lib/live/rss.ts` | fetchRssFeed, interleaveWires, dedupeWires — core RSS utilities |
| `lib/live/f1-news.ts` | getF1News — Autosport + Motorsport feeds |
| `lib/live/football-news.ts` | getFootballNews — BBC Sport + Sky Sports football feeds |
| `lib/live/tennis-news.ts` | getTennisNews — BBC Sport + Sky Sports tennis feeds |
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
