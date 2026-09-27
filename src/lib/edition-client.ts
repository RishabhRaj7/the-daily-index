// Browser side of the server-built editions (see lib/server/editions.ts).
//
// The reader's preferences live in localStorage. We post them; the server
// hashes them and answers with that edition's state. When it is still
// building we poll until it is ready. The hash is mirrored into a cookie so
// server-rendered pages (the archive) know which edition is this reader's.

import type { DigestPreferences, DigestResult } from "@/lib/preferences/types";

export interface EditionResponse {
  state: "ready" | "building" | "failed" | "missing";
  date?: string;
  hash?: string;
  digest?: DigestResult;
  builtAt?: string;
  /** Ready, but a fresher build is running in the background. */
  refreshing?: boolean;
  note?: string;
  error?: string;
}

export const EDITION_COOKIE = "daily-index:edition";
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 180_000;

function rememberHash(hash: string | undefined) {
  if (!hash) return;
  document.cookie = `${EDITION_COOKIE}=${hash};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

async function parse(res: Response): Promise<EditionResponse> {
  const body = (await res.json().catch(() => null)) as EditionResponse | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `edition ${res.status}`);
  rememberHash(body.hash);
  return body;
}

/** Ask for today's edition for these preferences (starts a build if needed). */
export async function requestEdition(
  preferences: DigestPreferences,
  opts: { force?: boolean; signal?: AbortSignal; keepalive?: boolean } = {},
): Promise<EditionResponse> {
  const res = await fetch("/api/edition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: opts.signal,
    // Lets a settings save kick off the build even as the page navigates away.
    keepalive: opts.keepalive,
    body: JSON.stringify({ preferences, force: opts.force === true }),
  });
  return parse(res);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

/**
 * Poll until the edition is ready or failed. With `waitForFresh`, a ready
 * edition that is still refreshing keeps polling until the fresh build lands
 * (used after "Refresh edition").
 */
export async function waitForEdition(
  hash: string,
  date: string,
  opts: { signal?: AbortSignal; waitForFresh?: boolean; after?: string } = {},
): Promise<EditionResponse> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS, opts.signal);
    const res = await fetch(`/api/edition?hash=${hash}&date=${date}`, {
      cache: "no-store",
      signal: opts.signal,
    });
    const body = await parse(res);
    if (body.state === "failed") return body;
    if (body.state === "ready") {
      const fresh = !opts.after || (body.builtAt ?? "") > opts.after;
      if (!opts.waitForFresh || !body.refreshing || fresh) return body;
    }
    // "missing" right after a POST means the build record hasn't landed yet
    // (or expired) — keep waiting until the deadline.
  }
  return { state: "failed", error: "The edition is taking too long. Try again in a minute." };
}
