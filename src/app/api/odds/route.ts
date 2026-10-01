import { after } from "next/server";
import { getOddsUniverse } from "@/lib/live/odds";
import { oddsRecordSummary, updateOddsRecord } from "@/lib/live/odds-record";
import { getStore } from "@/lib/server/store";

// GET /api/odds?f=Max Verstappen|Real Madrid&w=Fed decision|…&p=pm:slug,ks:TICKER
// Every candidate market for Straw Poll, classified and cleaned
// (lib/live/odds.ts). `f` adds a search for each name the reader follows,
// `w` one for each question on their watchlist, `p` reads starred markets
// by id. The page chooses what to print (lib/odds-pick.ts). The cleaned
// reading is kept a quarter of an hour and refreshed in the background;
// the edge keeps each answer 5 minutes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const list = (v: string | null, sep: string, max: number, len: number) =>
  (v ?? "")
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= len)
    .slice(0, max);

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const follows = list(params.get("f"), "|", 8, 40);
  const watch = list(params.get("w"), "|", 12, 80);
  const pins = list(params.get("p"), ",", 12, 120).filter((id) => /^(pm|ks):[\w.-]+$/i.test(id));
  // A stale reading is served at once; the fresh one is read after the response.
  const [universe, record] = await Promise.all([
    getOddsUniverse(follows, (task) => after(task), watch, pins),
    oddsRecordSummary().catch(() => null),
  ]);
  // No track record yet: build one from the past month's settled questions,
  // once, after this response (the morning cron keeps it up after that).
  if (!record) {
    after(async () => {
      const store = getStore();
      if (!(await store.setIfAbsent("odds:record:building", 1, 600).catch(() => false))) return;
      // A failed build frees the lock, so the next visit tries again.
      await updateOddsRecord().catch(() => store.del("odds:record:building").catch(() => {}));
    });
  }
  if (universe.markets.length === 0) {
    return Response.json({ error: "odds unavailable", ...universe }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ...universe, record }, {
    headers: { "Cache-Control": "public, max-age=120, s-maxage=300, stale-while-revalidate=900" },
  });
}
