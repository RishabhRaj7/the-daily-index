import { AsyncLocalStorage } from "node:async_hooks";

// What one /api/social request asked for and what it was given, without
// threading it through every reader: whether the reader pressed refresh
// (`force`: copies older than a minute are read again, still in turn), when
// each copy it was served was read, whether a feed has nothing yet and is
// waiting for its turn (the page then asks again shortly), which sources the
// page has paused (`skip`: not read at all), and how each source fared.

export type SocialSource = "x" | "reddit";
/** ok: it gave something (fresh or a kept copy) · failed: it was asked and gave nothing · waiting: nothing yet, its turn hasn't come · off: not asked. */
export type SourceState = "ok" | "failed" | "waiting" | "off";

export interface SocialCtx {
  force: boolean;
  copies: number[];
  waiting: boolean;
  skip: Set<SocialSource>;
  seen: Record<SocialSource, { ok: number; failed: number; waiting: number }>;
}

const als = new AsyncLocalStorage<SocialCtx>();

export const socialCtx = () => als.getStore();

export function withSocial<T>(force: boolean, fn: () => Promise<T>, skip: SocialSource[] = []): Promise<T> {
  return als.run(
    { force, copies: [], waiting: false, skip: new Set(skip), seen: { x: { ok: 0, failed: 0, waiting: 0 }, reddit: { ok: 0, failed: 0, waiting: 0 } } },
    fn,
  );
}

/** A copy served (when it was read), or a feed still waiting for its first read. */
export function noteCopy(at: number | null | undefined, waiting = false): void {
  const c = als.getStore();
  if (!c) return;
  if (at) c.copies.push(at);
  if (waiting) c.waiting = true;
}

/** The page has paused this source: it isn't read. */
export const skipped = (src: SocialSource) => !!als.getStore()?.skip.has(src);

/** How one read of a source went. */
export function noteSource(src: SocialSource, outcome: "ok" | "failed" | "waiting"): void {
  const c = als.getStore();
  if (c) c.seen[src][outcome]++;
}

/** Each source's state for this request: anything given counts as ok. */
export function sourceStates(): Record<SocialSource, SourceState> {
  const c = als.getStore();
  const one = (src: SocialSource): SourceState => {
    const s = c?.seen[src];
    if (!s || c.skip.has(src)) return "off";
    return s.ok > 0 ? "ok" : s.waiting > 0 ? "waiting" : s.failed > 0 ? "failed" : "off";
  };
  return { x: one("x"), reddit: one("reddit") };
}
