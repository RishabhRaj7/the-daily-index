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
// GET /api/f1?parts=map,drivers,…   (streamed, newline-delimited JSON)
//
// The sidebar loads every part it is missing in ONE streamed request: the
// server starts all of them at once — OpenF1 calls are paced inside
// lib/live/f1.ts (3/s, 30/min), which only works when they share a process —
// and writes each result as a line in the order asked for, so the reader
// still sees the sidebar fill top-down. `?part=` stays for scoped retries.
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

function streamParts(names: PartName[]): Response {
  // Start everything now; emit in request order as each one settles.
  const pending = names.map((name) =>
    runPart(PARTS[name].fn as () => Promise<unknown | null>, PARTS[name].empty),
  );
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < names.length; i++) {
        const result = await pending[i];
        controller.enqueue(encoder.encode(JSON.stringify({ part: names[i], result }) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { ...NO_STORE, "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const many = params.get("parts");
  if (many !== null) {
    const names = [...new Set(many.split(",").map((p) => p.trim()))].filter(isPartName);
    if (names.length === 0) {
      return Response.json(
        { error: "no known parts", parts: Object.keys(PARTS) },
        { status: 400, headers: NO_STORE },
      );
    }
    return streamParts(names);
  }

  const part = params.get("part") ?? "";

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
