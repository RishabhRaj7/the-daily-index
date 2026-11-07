"use client";

import { useSyncExternalStore } from "react";

// The driver the reader last tapped in the live centre, remembered on this device
// across sessions and visits until they tap another. Until then the live centre follows
// their first selected driver. Tapping here doesn't change the drivers picked on the
// main page, which are what the table highlights.

const KEY = "daily-index:f1-followed:v1";
const CHANGED = "daily-index:f1-followed-changed";

// Where the browser refuses to store it, it holds until the page closes.
let held: string | null = null;

function read(): string | null {
  try {
    return localStorage.getItem(KEY) ?? held;
  } catch {
    return held;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function followDriver(code: string) {
  held = code;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // Held for this page instead.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function useFollowedDriver(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
