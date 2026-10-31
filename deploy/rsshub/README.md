# RSSHub for The Daily Index

Reads X for the Grapevine, IPO chatter and Clutch's transfer window
(`src/lib/live/social.ts`). Reddit does not go through here: the site reads
Reddit's own RSS directly.

It runs RSSHub's official Docker image on Render's free tier: no build, no
fork to keep in step, and the image is the one RSSHub's maintainers test.
(Hugging Face now charges for Docker Spaces, and RSSHub's own code no longer
loads on Vercel's functions.)

## Set up (once, about 10 minutes)

1. **A burner X account.** Make a new X account just for this — not your own.
   X can lock or suspend accounts that read it automatically, and a burner
   costs nothing to replace. Log in to it once in a normal browser and leave
   it otherwise unused.
2. **Its auth token.** While logged in as the burner on x.com, open the
   browser's developer tools → Application (Storage) → Cookies →
   `https://x.com` and copy the value of `auth_token`.
3. **The service.** On render.com: New → Web Service → **Existing image** →
   `docker.io/diygod/rsshub:latest` → instance type **Free**.
4. **Its environment variables** (Environment tab):
   - `TWITTER_AUTH_TOKEN` = the `auth_token` from step 2
   - `ACCESS_KEY` = a long random string (e.g. `openssl rand -hex 24`) — every
     request must carry it, so nobody else can use the instance or the burner
   - `CACHE_EXPIRE` = `600`
5. **Check it:** `https://<service>.onrender.com/twitter/user/X?key=<ACCESS_KEY>`
   should return an RSS feed; without `?key=` it answers 403.
6. **The site.** In Vercel → the-daily-index → Settings → Environment
   Variables (Production), add:
   - `RSSHUB_URL` = `https://<service>.onrender.com`
   - `RSSHUB_ACCESS_KEY` = the same `ACCESS_KEY`
   then redeploy.

## Staying free

- A free Render service sleeps after 15 minutes without a request, and waking
  takes most of a minute. The site's `feeds-warm` job
  (`.github/workflows/feeds-warm.yml`) touches it every 10 minutes, so it
  stays awake. Running all month uses about 744 of Render's 750 free instance
  hours, so keep this the only free Render service on the account.
- Each X account or search is read at most once per 10 minutes (the site's
  store and RSSHub's own cache both hold it that long): with 10 accounts and a
  few searches that is under 100 reads an hour, well inside what X allows one
  logged-in account.
- If a GitHub run is late and the service has dozed off, the site serves the
  last copy it kept while it wakes.

## When it stops

- **Feeds go quiet and the column says they didn't answer:** X has probably
  logged the burner out. Log in again, copy the new `auth_token`, update the
  variable on Render (it redeploys itself).
- **X suspends the burner:** make another and do the same.
- **RSSHub updates:** Render → Manual Deploy → "Deploy latest reference"
  pulls the newest image.
