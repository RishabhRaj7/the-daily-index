"use client";

import { useSyncExternalStore } from "react";

// How long ago a story was published, worked out where it is shown (from the
// source's own publish time) and moving on a minute at a time, so a page left
// open or an edition built this morning never says "2h ago" all day. Without
// a time (an edition saved before times were kept, an undated feed) it prints
// what it was given.

const minute = (fn: () => void) => {
  const t = setInterval(fn, 60_000);
  return () => clearInterval(t);
};
const nowMinute = () => Math.floor(Date.now() / 60_000);

export function agoText(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const hours = Math.floor((now - at) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Ago({ iso, fallback = "", upper = false }: { iso?: string; fallback?: string; upper?: boolean }) {
  // The server (and the first paint) print the fallback; the browser then works it out.
  const m = useSyncExternalStore(minute, nowMinute, () => 0);
  const text = iso && m ? agoText(iso, m * 60_000) || fallback : fallback;
  return <>{upper ? text.toUpperCase() : text}</>;
}
