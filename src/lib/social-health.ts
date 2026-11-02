"use client";

import { useSyncExternalStore } from "react";
import type { SocialSource, SourceState } from "@/lib/live/social-context";

// How X and Reddit are doing on this device, shared by every list on the
// page (the Grapevine, the trends, the paddock card, IPO chatter, Clutch) and
// by the reader's other tabs. A source that fails three reads in a row (reads
// within the same minute count once: one page load asks from several lists)
// is paused for an hour: its posts are hidden, and the page doesn't ask for
// it at all (/api/social's skip). After the hour one read is tried; if that
// fails it is paused again straight away. Any good read clears it. The
// reader's "Try again" (SocialPausedNote) gives both one more read now.
//
// Kept per device on purpose: a bad connection on the phone shouldn't hide
// X on the laptop.

export type { SocialSource };

export const FAILS_TO_PAUSE = 3;
export const PAUSE_MS = 60 * 60_000;
/** Failures closer together than this count once. */
const SAME_ROUND_MS = 45_000;
/** Before the pause: the next read after one failure, then after two. */
export const RETRY_AFTER_MS = [60_000, 180_000];

export interface SourceHealth {
  /** Failed reads in a row. */
  fails: number;
  lastFailAt: number;
  /** Hidden and not asked until then (ms); 0 when not paused. */
  pausedUntil: number;
  /** The reader asked to try again: hidden until it gives something, paused again if it fails. */
  retrying: boolean;
}
export type Health = Record<SocialSource, SourceHealth>;

const KEY = "daily-index:social-health";
export const SOCIAL_HEALTH_EVENT = "daily-index:social-health";
/** The reader pressed "Try again": every list reads again now. */
export const SOCIAL_RETRY_EVENT = "daily-index:social-retry";

const fresh = (): SourceHealth => ({ fails: 0, lastFailAt: 0, pausedUntil: 0, retrying: false });
const EMPTY: Health = { x: fresh(), reddit: fresh() };

let memory: Health = EMPTY;
let cachedRaw: string | null | undefined;
let cached: Health = EMPTY;

function read(): Health {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    const v = raw ? (JSON.parse(raw) as Partial<Health>) : {};
    cached = { x: { ...fresh(), ...v.x }, reddit: { ...fresh(), ...v.reddit } };
    return cached;
  } catch {
    // No storage (a private window): this visit only.
    return memory;
  }
}

function write(next: Health) {
  memory = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(SOCIAL_HEALTH_EVENT));
}

export function readHealth(): Health {
  return typeof window === "undefined" ? EMPTY : read();
}

export const isPaused = (h: SourceHealth, now = Date.now()) => h.pausedUntil > now;

/** Sources not to ask for now (paused). */
export function pausedSources(now = Date.now()): SocialSource[] {
  const h = readHealth();
  return (["x", "reddit"] as const).filter((s) => isPaused(h[s], now));
}

/** What one read said about a source. Waiting and off say nothing either way. */
export function report(src: SocialSource, state: SourceState | "failed") {
  if (state !== "ok" && state !== "failed") return;
  const all = readHealth();
  const h = all[src];
  const now = Date.now();
  if (state === "ok") {
    if (h.fails === 0 && !h.pausedUntil && !h.retrying) return;
    return write({ ...all, [src]: fresh() });
  }
  // Paused already: nothing was asked, nothing to count.
  if (isPaused(h, now)) return;
  if (now - h.lastFailAt < SAME_ROUND_MS && !h.retrying) return;
  const fails = h.fails + 1;
  // After a pause (or a "Try again") one failure is enough to pause again.
  const pause = fails >= FAILS_TO_PAUSE || h.retrying;
  write({ ...all, [src]: { fails: Math.max(fails, pause ? FAILS_TO_PAUSE : 0), lastFailAt: now, pausedUntil: pause ? now + PAUSE_MS : 0, retrying: false } });
}

/** "Try again": both sources get one read now. */
export function retrySocial() {
  const all = readHealth();
  const one = (h: SourceHealth): SourceHealth => (isPaused(h) || h.fails > 0 ? { fails: FAILS_TO_PAUSE, lastFailAt: 0, pausedUntil: 0, retrying: true } : h);
  write({ x: one(all.x), reddit: one(all.reddit) });
  window.dispatchEvent(new Event(SOCIAL_RETRY_EVENT));
}

const subscribe = (fn: () => void) => {
  window.addEventListener(SOCIAL_HEALTH_EVENT, fn);
  window.addEventListener("storage", fn);
  // A pause running out shows without anything else happening.
  const t = window.setInterval(fn, 15_000);
  return () => {
    window.removeEventListener(SOCIAL_HEALTH_EVENT, fn);
    window.removeEventListener("storage", fn);
    window.clearInterval(t);
  };
};

/** The health and the time it was read at (to the quarter minute, so a pause running out shows). */
export interface HealthNow {
  health: Health;
  now: number;
}
const SERVER: HealthNow = { health: EMPTY, now: 0 };
let current: HealthNow = SERVER;
function readNow(): HealthNow {
  const health = readHealth();
  const now = Math.floor(Date.now() / 15_000) * 15_000;
  if (current.health !== health || current.now !== now) current = { health, now };
  return current;
}

/** The two sources' health, kept current. Before mounting, nothing is paused. */
export function useSocialHealth(): HealthNow {
  return useSyncExternalStore(subscribe, readNow, () => SERVER);
}

/**
 * Whether a source's part of a list shows: "show" (it has posts), "wait"
 * (nothing yet but it's still being tried: a quiet placeholder), or "hide".
 */
export function sourceView(h: SourceHealth, hasPosts: boolean, state: SourceState | undefined, now = Date.now()): "show" | "wait" | "hide" {
  if (isPaused(h, now)) return "hide";
  if (hasPosts) return "show";
  if (h.retrying) return "hide";
  if (state === "off") return "hide";
  // Not read yet, its turn not come, or failing but not yet paused.
  if (state === undefined || state === "waiting" || (state === "failed" && h.fails < FAILS_TO_PAUSE)) return "wait";
  return "hide";
}
