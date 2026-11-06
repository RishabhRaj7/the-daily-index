"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";
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
            <MoonIcon size={14} weight="fill" aria-hidden="true" />
          ) : (
            <SunIcon size={14} weight="fill" aria-hidden="true" />
          )}
        </span>
      </button>
      {isManual && !compact && (
        <button
          onClick={resetToAuto}
          className="font-label text-[11px] text-ink-soft hover:text-ink transition-colors px-1"
          title="Follow the clock again"
        >
          Auto
        </button>
      )}
    </div>
  );
}
