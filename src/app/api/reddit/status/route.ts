import { getRedditConnection, redditAuthAvailable } from "@/lib/reddit-auth";

export const dynamic = "force-dynamic";

// GET /api/reddit/status — safe for the browser: username + subscription
// count only, never tokens.
export async function GET() {
  if (!redditAuthAvailable()) {
    return Response.json({ configured: false, connected: false });
  }
  const conn = await getRedditConnection();
  if (!conn) {
    return Response.json({ configured: true, connected: false });
  }
  return Response.json({
    configured: true,
    connected: true,
    username: conn.redditUsername,
    subCount: (conn.subreddits ?? []).length,
  });
}
