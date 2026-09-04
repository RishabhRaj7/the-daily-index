import { eq } from "drizzle-orm";
import { db } from "@/db";
import { redditConnections, type RedditConnection } from "@/db/schema";

// ---------------------------------------------------------------------------
// Login-with-Reddit (user OAuth) — lets the Grapevine read the reader's
// *actual* subscriptions instead of a hand-typed subreddit list.
//
// Uses the SAME free script-app credentials as the app-only feed
// (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET). The only extra setup is adding
// the callback URL to the app's "redirect uri" field on reddit.com/prefs/apps:
//   https://<your-domain>/api/reddit/callback
//   (and http://localhost:3000/api/reddit/callback for local dev)
//
// Everything token-shaped stays server-side in Postgres; the browser only
// ever sees the username in a plain cookie for display purposes.
// ---------------------------------------------------------------------------

const ROW_ID = "default";
const SUBS_TTL_MS = 24 * 60 * 60 * 1000;

const USER_AGENT =
  process.env.REDDIT_USER_AGENT ??
  "web:the-daily-index:v1.1 (personal newspaper; by /u/the_daily_index)";

function oauthCreds(): { id: string; secret: string } | null {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export function redditAuthAvailable(): boolean {
  return oauthCreds() !== null;
}

export async function getRedditConnection(): Promise<RedditConnection | null> {
  try {
    const rows = await db
      .select()
      .from(redditConnections)
      .where(eq(redditConnections.id, ROW_ID))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    console.error("[reddit-auth] read connection failed:", err);
    return null;
  }
}

export async function saveRedditConnection(input: {
  redditUsername: string;
  refreshToken: string;
  accessToken?: string;
  accessExpiresAt?: Date;
}): Promise<void> {
  await db
    .insert(redditConnections)
    .values({
      id: ROW_ID,
      redditUsername: input.redditUsername,
      refreshToken: input.refreshToken,
      accessToken: input.accessToken ?? null,
      accessExpiresAt: input.accessExpiresAt ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: redditConnections.id,
      set: {
        redditUsername: input.redditUsername,
        refreshToken: input.refreshToken,
        accessToken: input.accessToken ?? null,
        accessExpiresAt: input.accessExpiresAt ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function clearRedditConnection(): Promise<void> {
  try {
    await db.delete(redditConnections).where(eq(redditConnections.id, ROW_ID));
  } catch (err) {
    console.error("[reddit-auth] delete connection failed:", err);
  }
}

async function tokenRequest(body: string): Promise<{ access: string; expiresIn: number; refresh?: string } | null> {
  const creds = oauthCreds();
  if (!creds) return null;
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[reddit-auth] token exchange failed:", res.status);
      return null;
    }
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!json.access_token) return null;
    return { access: json.access_token, expiresIn: json.expires_in ?? 3600, refresh: json.refresh_token };
  } catch (err) {
    console.error("[reddit-auth] token request error:", err);
    return null;
  }
}

export function redditCallbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/reddit/callback`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ access: string; expiresIn: number; refresh?: string } | null> {
  return tokenRequest(
    `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  );
}

async function refreshUserToken(conn: RedditConnection): Promise<string | null> {
  const out = await tokenRequest(
    `grant_type=refresh_token&refresh_token=${encodeURIComponent(conn.refreshToken)}`,
  );
  if (!out) return null;
  try {
    await db
      .update(redditConnections)
      .set({
        accessToken: out.access,
        accessExpiresAt: new Date(Date.now() + out.expiresIn * 1000),
        updatedAt: new Date(),
      })
      .where(eq(redditConnections.id, ROW_ID));
  } catch (err) {
    console.error("[reddit-auth] persist refreshed token failed:", err);
  }
  return out.access;
}

/** A valid user access token, refreshing transparently when expired. */
export async function getUserAccessToken(): Promise<string | null> {
  const conn = await getRedditConnection();
  if (!conn) return null;
  if (
    conn.accessToken &&
    conn.accessExpiresAt &&
    conn.accessExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return conn.accessToken;
  }
  return refreshUserToken(conn);
}

export async function fetchRedditUsername(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://oauth.reddit.com/api/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { name?: string };
    return json.name ?? null;
  } catch {
    return null;
  }
}

/**
 * The reader's subscribed subreddit names. Cached in Postgres for 24h so the
 * homepage doesn't pay for this call on every render.
 */
export async function getUserSubreddits(): Promise<string[]> {
  const conn = await getRedditConnection();
  if (!conn) return [];
  const cached = (conn.subreddits ?? []).filter((s) => typeof s === "string");
  if (
    cached.length > 0 &&
    conn.subsFetchedAt &&
    Date.now() - conn.subsFetchedAt.getTime() < SUBS_TTL_MS
  ) {
    return cached;
  }

  const token = await getUserAccessToken();
  if (!token) return cached;
  try {
    const res = await fetch(
      "https://oauth.reddit.com/subreddits/mine/subscriber?limit=100&raw_json=1",
      {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) {
      console.error("[reddit-auth] subscriptions fetch failed:", res.status);
      return cached;
    }
    const json = (await res.json()) as {
      data?: { children?: Array<{ data?: { display_name?: string; over18?: boolean } }> };
    };
    const names = (json.data?.children ?? [])
      .map((c) => c.data?.display_name)
      .filter(
        (n): n is string => typeof n === "string" && n.length > 0 && !n.toLowerCase().startsWith("u_"),
      );
    const unique = [...new Set(names)].slice(0, 100);
    if (unique.length > 0) {
      await db
        .update(redditConnections)
        .set({ subreddits: unique, subsFetchedAt: new Date(), updatedAt: new Date() })
        .where(eq(redditConnections.id, ROW_ID));
      return unique;
    }
    return cached;
  } catch (err) {
    console.error("[reddit-auth] subscriptions error:", err);
    return cached;
  }
}
