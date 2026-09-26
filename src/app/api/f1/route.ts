import {
  getF1Map,
  getF1Drivers,
  getF1Calendar,
  getF1Constructors,
  getF1DriverStandings,
  getF1Results,
  type F1PartResult,
} from "@/lib/live/f1";

export const dynamic = "force-dynamic";

// GET /api/f1?part=map|drivers|calendar|constructors|standings|results
//
// The F1 sidebar fetches its data progressively instead of blocking the whole
// edition render on one long upstream chain. Each part resolves independently:
// a slow or failing OpenF1 endpoint degrades its own block (the client shows
// a scoped retry there, keeping any data it already had) and never takes the
// rest of the sidebar down with it.
//
// Parts are listed here in the order the sidebar fills them in:
//   map          — next race + circuit map        (fastest)
//   drivers      — driver details                 (static data, no network)
//   calendar     — upcoming race calendar
//   constructors — constructors' championship
//   standings    — drivers' championship
//   results      — latest race result + grid      (slowest)
//
// Caching: upstream OpenF1/Ergast responses are cached by the Next Data Cache
// (revalidate 900–21600) plus a 10-minute process memo in lib/live/f1.ts, and
// the client keeps its own per-part sessionStorage cache — so the sidebar's
// refresh reuses local data instead of re-hitting these endpoints.

const NO_STORE = { "Cache-Control": "no-store" } as const;

const PARTS = {
  map: { fn: getF1Map, empty: "The circuit map didn't answer." },
  drivers: { fn: getF1Drivers, empty: "The driver list is unavailable." },
  calendar: { fn: getF1Calendar, empty: "The race calendar didn't answer." },
  constructors: { fn: getF1Constructors, empty: "The constructors' table didn't answer." },
  standings: { fn: getF1DriverStandings, empty: "The drivers' table didn't answer." },
  results: { fn: getF1Results, empty: "The timing screens didn't answer." },
} as const;

type PartName = keyof typeof PARTS;

function isPartName(value: string): value is PartName {
  return Object.prototype.hasOwnProperty.call(PARTS, value);
}

async function runPart<T>(
  fn: () => Promise<T | null>,
  emptyMessage: string,
): Promise<F1PartResult<T>> {
  const fetchedAt = new Date().toISOString();
  try {
    const data = await fn();
    if (data === null) return { ok: false, error: emptyMessage, fetchedAt };
    return { ok: true, data, fetchedAt };
  } catch (err) {
    console.error("[f1] part failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "request failed",
      fetchedAt,
    };
  }
}

export async function GET(req: Request) {
  const part = new URL(req.url).searchParams.get("part") ?? "";

  if (!isPartName(part)) {
    return Response.json(
      { error: `unknown part "${part}"`, parts: Object.keys(PARTS) },
      { status: 400, headers: NO_STORE },
    );
  }

  const { fn, empty } = PARTS[part];
  // The union of part return types collapses to `unknown` here on purpose —
  // each part's concrete shape is asserted by its caller in F1Sidebar.
  const result = await runPart(fn as () => Promise<unknown | null>, empty);
  return Response.json(result, { headers: NO_STORE });
}
