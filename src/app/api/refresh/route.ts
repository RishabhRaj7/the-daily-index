import { revalidatePath } from "next/cache";
import { clearRedditCache } from "@/lib/live/reddit";

export const dynamic = "force-dynamic";

// POST /api/refresh — purges everything the edition caches server-side, so
// the "Refresh edition" button produces genuinely fresh content instead of a
// pixel-identical re-render:
//
//   1. Next.js Data Cache for "/" (all `fetch(url, { next: { revalidate } })`
//      calls in the RSS / markets / standings pipeline).
//   2. The in-memory Reddit subreddit + OAuth-token cache.
//
// The client then does a full `window.location.reload()`, which re-renders
// the server components with cold caches and refetches client-side weather
// and AI summaries from scratch.
export async function POST() {
  try {
    clearRedditCache();
  } catch (err) {
    console.error("[refresh] reddit cache clear failed:", err);
  }
  try {
    revalidatePath("/", "page");
    revalidatePath("/", "layout");
  } catch (err) {
    console.error("[refresh] revalidatePath failed:", err);
  }
  return Response.json(
    { ok: true, refreshedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
