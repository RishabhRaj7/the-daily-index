"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { NavChapter } from "@/components/chrome/TopBar";
import { CHAPTERS } from "./chapters";
import { SECTION_META } from "./sections";

// The menu on the pages around the paper (the archive, settings, the live centre):
// the paper's own, so the words and their order never differ. The paper saves it
// here each time it prints, with the reader's order and their own sections, and
// without the day's numbers, which belong to the paper. Before the paper has been
// opened on this device, the usual running order stands in. It's in this browser
// only and is rewritten by the next print, so nothing depends on it being there.

const KEY = "daily-index:menu";

export interface SavedMenu {
  chapters: NavChapter[];
  date?: string;
  issue?: string;
}

const STANDARD: SavedMenu = {
  chapters: CHAPTERS.map((c) => ({
    id: `ch-${c.id}`,
    label: c.label,
    sections: [
      ...c.sections.map((key) => ({ id: SECTION_META[key].slug, name: SECTION_META[key].name, hue: SECTION_META[key].hue })),
      ...(c.id === "next" ? [{ id: "week-ahead", name: "The Week Ahead", hue: "var(--hue-money)" }] : []),
    ],
  })),
};

/** The paper's menu, for the pages around it. */
export function saveMenu(menu: SavedMenu): void {
  try {
    const chapters = menu.chapters.map((c) => ({ ...c, sections: c.sections.map(({ id, name, hue }) => ({ id, name, hue })) }));
    localStorage.setItem(KEY, JSON.stringify({ ...menu, chapters }));
  } catch {}
}

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

function subscribe(changed: () => void) {
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
}

export function useSavedMenu(): SavedMenu {
  const saved = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => {
    if (!saved) return STANDARD;
    try {
      const menu = JSON.parse(saved) as SavedMenu;
      return menu.chapters?.length ? menu : STANDARD;
    } catch {
      return STANDARD;
    }
  }, [saved]);
}
