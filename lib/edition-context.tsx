"use client";

import {
  createContext,
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

export function EditionProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<EditionMode>("morning");
  const [isManual, setIsManual] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "morning" || stored === "evening") {
      setModeState(stored);
      setIsManual(true);
      return;
    }
    setModeState(autoModeForHour(new Date().getHours()));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-edition", mode);
  }, [mode]);

  const setMode = (next: EditionMode) => {
    setModeState(next);
    setIsManual(true);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const resetToAuto = () => {
    setIsManual(false);
    window.localStorage.removeItem(STORAGE_KEY);
    setModeState(autoModeForHour(new Date().getHours()));
  };

  const value = useMemo(
    () => ({ mode, isManual, setMode, resetToAuto }),
    [mode, isManual],
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
