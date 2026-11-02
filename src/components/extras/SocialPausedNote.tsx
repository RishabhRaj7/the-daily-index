"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SectionKey } from "@/lib/types";
import { loadPersonalization, PERSONALIZATION_CHANGED_EVENT } from "@/lib/personalization";
import { isPaused, retrySocial, useSocialHealth } from "@/lib/social-health";

// The one place on the page that says X or Reddit is paused (it failed three
// reads in a row; lib/social-health.ts), with "Try again". Only there while
// something is paused, in the paper's small mono type. It sits in the
// Grapevine; when the reader has hidden that, in the next section on the page
// that reads X or Reddit, so it's never out of reach.

const PLACES: SectionKey[] = ["grapevine", "paddock-notes", "market-pulse"];

const subscribe = (fn: () => void) => {
  window.addEventListener(PERSONALIZATION_CHANGED_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(PERSONALIZATION_CHANGED_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};
const hiddenKey = () => {
  try {
    return loadPersonalization().hiddenSections.join(",");
  } catch {
    return "";
  }
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function SocialPausedNote({ place, className = "" }: { place: SectionKey; className?: string }) {
  const { health, now } = useSocialHealth();
  const hidden = useSyncExternalStore(subscribe, hiddenKey, () => "");
  const [trying, setTrying] = useState(false);
  const retrying = health.x.retrying || health.reddit.retrying;
  // The spinner holds until the reads come back (or a quarter of a minute).
  useEffect(() => {
    if (!trying) return;
    if (!retrying) {
      const t = window.setTimeout(() => setTrying(false), 600);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setTrying(false), 15_000);
    return () => window.clearTimeout(t);
  }, [trying, retrying]);

  const off = hidden.split(",").filter(Boolean);
  if (PLACES.find((p) => !off.includes(p)) !== place) return null;
  const paused = (["x", "reddit"] as const).filter((s) => isPaused(health[s], now));
  if (!paused.length && !trying) return null;
  const names = paused.map((s) => (s === "x" ? "X" : "Reddit")).join(" and ");
  const until = Math.max(...paused.map((s) => health[s].pausedUntil));

  return (
    <p className={`font-mono text-[10px] text-ink-faint flex items-center gap-1.5 ${className}`} role="status">
      {trying ? (
        <>
          <svg viewBox="0 0 16 16" className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.7-4" />
          </svg>
          Trying X and Reddit again…
        </>
      ) : (
        <>
          <span title="It didn't answer three times in a row, so the page stopped asking for a while">
            {names} paused until {clock(until)}
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => {
              setTrying(true);
              retrySocial();
            }}
            className="underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            Try again
          </button>
        </>
      )}
    </p>
  );
}
