"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type EditionMode = "morning" | "evening";

interface EditionContextValue {
  mode: EditionMode;
  isManual: boolean;
  setMode: (mode: EditionMode) => void;
  resetToAuto: () => void;
}

const STORAGE_KEY = "daily-index:edition-override";

function autoModeForHour(hour: number): EditionMode {
  return hour >= 18 || hour < 5 ? "evening" : "morning";
}

const EditionContext = createContext<EditionContextValue | null>(null);

// Cross-fade the whole page when the *reader* flips the edition. Initial
// load and auto mode apply instantly so there's no fade on first paint.
function animateSwitch() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.classList.add("theme-transition");
  window.setTimeout(() => root.classList.remove("theme-transition"), 500);
}

export function EditionProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<EditionMode>("morning");
  const [isManual, setIsManual] = useState(false);
  // The boot script in layout.tsx already set the right theme before paint;
  // don't overwrite it with the "morning" placeholder on the first effect.
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "morning" || stored === "evening") {
      // Saved choice and the local clock are browser-only; read after first render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModeState(stored);
      setIsManual(true);
    } else {
      setModeState(autoModeForHour(new Date().getHours()));
    }
    setSynced(true);
  }, []);

  useEffect(() => {
    if (synced) document.documentElement.setAttribute("data-edition", mode);
  }, [mode, synced]);

  // Stable callbacks, so the memoised context value only changes with state.
  const setMode = useCallback((next: EditionMode) => {
    animateSwitch();
    setModeState(next);
    setIsManual(true);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const resetToAuto = useCallback(() => {
    animateSwitch();
    setIsManual(false);
    window.localStorage.removeItem(STORAGE_KEY);
    setModeState(autoModeForHour(new Date().getHours()));
  }, []);

  const value = useMemo(
    () => ({ mode, isManual, setMode, resetToAuto }),
    [mode, isManual, setMode, resetToAuto],
  );

  return (
    <EditionContext.Provider value={value}>{children}</EditionContext.Provider>
  );
}

export function useEdition() {
  const ctx = useContext(EditionContext);
  if (!ctx) throw new Error("useEdition must be used within EditionProvider");
  return ctx;
}
