"use client";

import { useSyncExternalStore } from "react";

/** A phone, as the page's layout means it (Tailwind's `md`). */
export const PHONE = "(max-width: 767.98px)";

/**
 * Whether a media query matches, kept current. False on the server and on the
 * first client render, so the HTML and the page agree: use it for behaviour, like
 * what a "see more" opens or how many rows a list shows. Layout belongs in CSS.
 */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (changed) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", changed);
      return () => list.removeEventListener("change", changed);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
