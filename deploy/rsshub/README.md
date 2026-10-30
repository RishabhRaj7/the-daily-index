---
title: Daily Index RSSHub
emoji: 📰
colorFrom: gray
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# RSSHub for The Daily Index

Reads X for the Grapevine, IPO chatter and Clutch's transfer window
(`src/lib/live/social.ts`). Reddit does not go through here: the site reads
Reddit's own RSS directly.

## Set up (once, about 10 minutes)

1. **A burner X account.** Make a new X account just for this — not your own.
   X can lock or suspend accounts that read it automatically, and a burner
   costs nothing to replace. Log in to it once in a normal browser and follow
   nobody; leave it otherwise unused.
2. **Its auth token.** While logged in as the burner on x.com, open the
   browser's developer tools → Application (Storage) → Cookies →
   `https://x.com` and copy the value of `auth_token`.
3. **The Space.** On huggingface.co (free account): New Space → SDK **Docker**
   → Blank → visibility **Public** (the access key below keeps it private in
   practice; a private Space would need a Hugging Face token on every read).
   Upload this folder's `Dockerfile` and `README.md` to it.
4. **Its secrets.** Space → Settings → Variables and secrets → New secret:
   - `TWITTER_AUTH_TOKEN` = the `auth_token` from step 2
   - `ACCESS_KEY` = any long random string (e.g. `openssl rand -hex 24`)
5. **The site.** In Vercel → the project → Settings → Environment Variables
   (Production), add:
   - `RSSHUB_URL` = the Space's direct address, `https://<user>-<space>.hf.space`
   - `RSSHUB_ACCESS_KEY` = the same `ACCESS_KEY`
   then redeploy.

Check it: `https://<user>-<space>.hf.space/twitter/user/X?key=<ACCESS_KEY>`
should return an RSS feed.

## Staying free

- Hugging Face's free CPU Spaces sleep after 48 hours without a visit; the
  site's `feeds-warm` job touches `/healthz` every 30 minutes, so it never does.
- Each X account or search is read at most once per 10 minutes (the site's
  store and RSSHub's own cache both hold it that long): with 10 accounts and
  a few searches that is under 100 reads an hour — well inside what X allows
  one logged-in account.
- If X logs the burner out (the feeds go quiet and the column says the feeds
  didn't answer), log in again, copy the new `auth_token` and update the
  secret. If X suspends it, make another burner and do the same.
