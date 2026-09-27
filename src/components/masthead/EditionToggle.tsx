"use client";

import { useEdition } from "@/lib/edition-context";

// Morning ⇄ evening as one switch: a knob that slides between a sun and a
// moon. "Auto" (follow the clock) appears once the reader has overridden it.
export default function EditionToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode, resetToAuto, isManual } = useEdition();
  const evening = mode === "evening";

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => setMode(evening ? "morning" : "evening")}
        role="switch"
        aria-checked={evening}
        aria-label={`Evening edition ${evening ? "on" : "off"}`}
        title={evening ? "Switch to the morning edition" : "Switch to the evening edition"}
        className="relative h-8 w-[3.6rem] rounded-full border hairline transition-colors hover:border-[color:var(--ink-soft)]"
      >
        <span
          className="absolute top-1/2 left-1 h-6 w-6 rounded-full bg-ink text-paper grid place-items-center transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{ transform: `translate(${evening ? "1.6rem" : "0"}, -50%)` }}
        >
          {evening ? (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
              <path d="M13.5 10.2A5.8 5.8 0 0 1 5.8 2.5a5.8 5.8 0 1 0 7.7 7.7Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <circle cx="8" cy="8" r="2.6" fill="currentColor" stroke="none" />
              <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
            </svg>
          )}
        </span>
      </button>
      {isManual && !compact && (
        <button
          onClick={resetToAuto}
          className="font-label text-[10px] text-ink-soft hover:text-ink transition-colors px-1"
          title="Follow the clock again"
        >
          Auto
        </button>
      )}
    </div>
  );
}
