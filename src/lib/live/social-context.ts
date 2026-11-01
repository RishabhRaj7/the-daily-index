import { AsyncLocalStorage } from "node:async_hooks";

// What one /api/social request asked for and what it was given, without
// threading it through every reader: whether the reader pressed refresh
// (`force`: copies older than a minute are read again, still in turn), when
// each copy it was served was read, and whether a feed has nothing yet and is
// waiting for its turn (the page then asks again shortly).

export interface SocialCtx {
  force: boolean;
  copies: number[];
  waiting: boolean;
}

const als = new AsyncLocalStorage<SocialCtx>();

export const socialCtx = () => als.getStore();

export function withSocial<T>(force: boolean, fn: () => Promise<T>): Promise<T> {
  return als.run({ force, copies: [], waiting: false }, fn);
}

/** A copy served (when it was read), or a feed still waiting for its first read. */
export function noteCopy(at: number | null | undefined, waiting = false): void {
  const c = als.getStore();
  if (!c) return;
  if (at) c.copies.push(at);
  if (waiting) c.waiting = true;
}
