import { NextResponse } from "next/server";
import { redditAuthAvailable, redditCallbackUrl } from "@/lib/reddit-auth";

export const dynamic = "force-dynamic";

// GET /api/reddit/connect — starts Login-with-Reddit. Redirects to Reddit's
// authorize page; Reddit sends the reader back to /api/reddit/callback.
export async function GET(req: Request) {
  if (!redditAuthAvailable()) {
    return NextResponse.json(
      { error: "Reddit API credentials are not configured on the server." },
      { status: 500 },
    );
  }
  const origin = new URL(req.url).origin;
  const redirectUri = redditCallbackUrl(origin);
  const state = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const params = new URLSearchParams({
    client_id: process.env.REDDIT_CLIENT_ID!,
    response_type: "code",
    state,
    redirect_uri: redirectUri,
    duration: "permanent", // gives us a refresh token: stay connected
    scope: "identity mysubreddits read",
  });

  const res = NextResponse.redirect(
    `https://www.reddit.com/api/v1/authorize?${params}`,
  );
  res.cookies.set("daily-index:reddit-state", state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure: origin.startsWith("https://"),
  });
  return res;
}
