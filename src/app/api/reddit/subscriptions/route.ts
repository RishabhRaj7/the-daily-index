import { getRedditConnection, getUserSubreddits } from "@/lib/reddit-auth";

export const dynamic = "force-dynamic";

// GET /api/reddit/subscriptions — the connected account's subscribed
// subreddit names, for the Settings "import my subscriptions" button.
export async function GET() {
  const conn = await getRedditConnection();
  if (!conn) return Response.json({ connected: false, subs: [] });
  const subs = await getUserSubreddits();
  return Response.json({ connected: true, username: conn.redditUsername, subs });
}
