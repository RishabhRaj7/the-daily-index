import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  fetchRedditUsername,
  getUserSubreddits,
  redditCallbackUrl,
  saveRedditConnection,
} from "@/lib/reddit-auth";

export const dynamic = "force-dynamic";

// GET /api/reddit/callback — Reddit returns here after the reader approves.
// Exchanges the code for tokens, stores them in Postgres, caches the user's
// subscriptions, and sends the reader back to Settings.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/settings?reddit=error&reason=${encodeURIComponent(reason)}`,
    );

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expected = cookieStore.get("daily-index:reddit-state")?.value;
  if (url.searchParams.get("error") || !code || !state || !expected || state !== expected) {
    return fail("auth");
  }

  const tokens = await exchangeCodeForTokens(code, redditCallbackUrl(origin));
  if (!tokens?.refresh) return fail("token");

  const username = await fetchRedditUsername(tokens.access);
  if (!username) return fail("identity");

  try {
    await saveRedditConnection({
      redditUsername: username,
      refreshToken: tokens.refresh,
      accessToken: tokens.access,
      accessExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    });
    // Warm the subscription cache now so the next edition render is instant.
    await getUserSubreddits();
  } catch (err) {
    console.error("[reddit] callback persist failed:", err);
    return fail("db");
  }

  const res = NextResponse.redirect(`${origin}/settings?reddit=connected`);
  res.cookies.set("daily-index:reddit-state", "", { path: "/", maxAge: 0 });
  res.cookies.set("daily-index:reddit", username, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
