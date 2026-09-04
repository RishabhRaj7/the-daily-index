import {
  getRedditConnection,
  redditAuthAvailable,
  redditStorageAvailable,
} from "@/lib/reddit-auth";

export const dynamic = "force-dynamic";

// GET /api/reddit/status — safe for the browser: username + subscription
// count only, never tokens. `storage` tells the UI whether a database exists
// to remember a connected account (the app runs fine without one).
export async function GET() {
  const storage = redditStorageAvailable();
  if (!redditAuthAvailable()) {
    return Response.json({ configured: false, connected: false, storage });
  }
  if (!storage) {
    return Response.json({ configured: true, connected: false, storage });
  }
  const conn = await getRedditConnection();
  if (!conn) {
    return Response.json({ configured: true, connected: false, storage });
  }
  return Response.json({
    configured: true,
    connected: true,
    storage,
    username: conn.redditUsername,
    subCount: (conn.subreddits ?? []).length,
  });
}
