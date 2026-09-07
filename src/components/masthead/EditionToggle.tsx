"use client";

import { useEdition } from "@/lib/edition-context";

export default function EditionToggle() {
  const { mode, setMode, resetToAuto, isManual } = useEdition();

  return (
    <div className="flex items-center gap-2 font-label text-xs">
      <button
        onClick={() => setMode("morning")}
        className={`px-2 py-1 border hairline rounded-sm transition-colors ${
          mode === "morning" ? "bg-masthead-red text-paper border-masthead-red" : ""
        }`}
        aria-pressed={mode === "morning"}
      >
        Morning
      </button>
      <button
        onClick={() => setMode("evening")}
        className={`px-2 py-1 border hairline rounded-sm transition-colors ${
          mode === "evening" ? "bg-masthead-red text-paper border-masthead-red" : ""
        }`}
        aria-pressed={mode === "evening"}
      >
        Evening
      </button>
      {isManual && (
        <button
          onClick={resetToAuto}
          className={`px-2 py-1 border hairline rounded-sm transition-colors ${
            !isManual
              ? "bg-masthead-red text-paper border-masthead-red"
              : "text-ink-soft border-transparent hover:border-hairline"
          }`}
          aria-pressed={!isManual}
        >
          Auto
        </button>
      )}
    </div>
  );
}
