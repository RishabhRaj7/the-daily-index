import { AsyncLocalStorage } from "node:async_hooks";

// What one edition build did, measured as it runs: every feed it read (ok,
// items, how many survived the age window, time, error), each stage's time,
// the corpus by pool, how full text and Google link decoding went, and the
// copy checks on the model's writing. Stored beside the edition so "why is
// today thin?" has an answer without reading function logs.
//
// Collection rides on AsyncLocalStorage: code deep in the pipeline (the RSS
// fetcher) records into whichever build is running, without the report
// being threaded through every call. Outside a build nothing is recorded.

export interface FeedStat {
  url: string;
  name: string;
  ok: boolean;
  status?: number;
  /** Entries in the feed as served. */
  items: number;
  /** Entries kept after the age window and filters. */
  kept: number;
  ms: number;
  error?: string;
}

export interface BuildReport {
  startedAt: string;
  ms: number;
  engine: "ai" | "heuristic";
  /** Why the build fell back to the heuristic paper, when it did. */
  fallback?: string;
  model?: string;
  stages: Record<string, number>;
  feeds: FeedStat[];
  feedsOk: number;
  feedsTotal: number;
  /** Corpus articles per pool (World, India, Money, F1…). */
  pools: Record<string, number>;
  corpus: number;
  signals?: { clusters: number; matched: number; added: number };
  fullText?: { attempted: number; fetched: number };
  googleLinks?: { attempted: number; resolved: number; cached: number; failed: number; limited: boolean };
  copy?: { issues: number; repaired: number; fixed: number };
  /** Printed stories, distinct publisher domains among them, and how many
   *  still link through news.google.com. */
  printed?: { stories: number; domains: number; viaGoogle: number };
  /** Pools that came back thin, and feeds that failed — empty when healthy. */
  degraded: string[];
}

interface Collector {
  feeds: FeedStat[];
  extra: Partial<BuildReport>;
}

const current = new AsyncLocalStorage<Collector>();

export function startCollector(): Collector {
  return { feeds: [], extra: {} };
}

export function runWithCollector<T>(collector: Collector, fn: () => Promise<T>): Promise<T> {
  return current.run(collector, fn);
}

/** Record one feed fetch into the running build, if any. */
export function recordFeed(stat: FeedStat): void {
  const c = current.getStore();
  if (!c) return;
  // One feed can be read twice in a build (a pool and a signal); keep the last.
  const at = c.feeds.findIndex((f) => f.url === stat.url);
  if (at >= 0) c.feeds[at] = stat;
  else c.feeds.push(stat);
}

/** Record a stage figure (signals, full text, links, copy) into the running build. */
export function recordExtra(extra: Partial<BuildReport>): void {
  const c = current.getStore();
  if (c) Object.assign(c.extra, extra);
}

/** Time a stage of the running build. */
export async function timed<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const c = current.getStore();
    if (c) c.extra.stages = { ...(c.extra.stages ?? {}), [stage]: Date.now() - t0 };
  }
}

// A pool this thin means its desk will print short or be padded.
const THIN_POOL = 3;

export function finishReport(
  collector: Collector,
  base: { startedAt: number; engine: "ai" | "heuristic"; pools: Record<string, number>; corpus: number },
): BuildReport {
  const feedsOk = collector.feeds.filter((f) => f.ok).length;
  const degraded: string[] = [];
  for (const [pool, n] of Object.entries(base.pools)) if (n < THIN_POOL) degraded.push(`pool ${pool}: ${n} articles`);
  const feedsTotal = collector.feeds.length;
  if (feedsTotal > 0 && feedsOk / feedsTotal < 0.8) degraded.push(`feeds: ${feedsOk} of ${feedsTotal} answered`);
  if (base.engine === "heuristic" && collector.extra.fallback) degraded.push(`engine: ${collector.extra.fallback}`);
  return {
    stages: {},
    ...collector.extra,
    startedAt: new Date(base.startedAt).toISOString(),
    ms: Date.now() - base.startedAt,
    engine: base.engine,
    feeds: collector.feeds,
    feedsOk,
    feedsTotal,
    pools: base.pools,
    corpus: base.corpus,
    degraded,
  };
}
