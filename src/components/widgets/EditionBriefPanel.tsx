"use client";

import { useState } from "react";
import type { EditionBrief } from "@/lib/types";

const SECTION_ICONS: Record<string, string> = {
  World:   "⊕",
  Markets: "↗",
  Sports:  "◎",
  Tech:    "◈",
};

export default function EditionBriefPanel({
  brief,
  date,
  isLoading,
}: {
  brief: EditionBrief | null;
  date: string;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Panel — appears above the trigger button */}
      {open && (
        <div
          className="fixed bottom-[4.25rem] left-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] bg-surface border hairline rounded-2xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] flex flex-col origin-bottom-left animate-[pop-in_0.35s_var(--ease-out)]"
          style={{ maxHeight: "70vh" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-4 py-3 border-b hairline shrink-0">
            <div>
              <div className="font-display font-extrabold text-[1.6rem] leading-none">
                At a glance
              </div>
              <div className="text-[10px] text-ink-soft mt-0.5 font-mono">{date}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-ink-soft hover:text-ink text-lg leading-none ml-2 shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto px-4 py-3">
            {isLoading && !brief && (
              <p className="text-[12px] text-ink-soft italic flex items-center gap-2">
                <span className="animate-pulse">✦</span> Generating your brief…
              </p>
            )}

            {!isLoading && !brief && (
              <p className="text-[12px] text-ink-soft italic">Brief unavailable today.</p>
            )}

            {brief && (
              <ul className="space-y-3">
                {brief.bullets.map((b) => (
                  <li key={b.section} className="flex gap-2.5">
                    <span className="text-accent font-mono text-[13px] shrink-0 mt-px leading-tight">
                      {SECTION_ICONS[b.section] ?? "·"}
                    </span>
                    <div className="min-w-0">
                      <span className="font-label text-[9px] text-ink-soft block mb-0.5">
                        {b.section}
                      </span>
                      <p className="text-[12px] leading-snug text-ink">{b.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 left-4 z-40 chip chip-signal h-10 px-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
      >
        <span className={isLoading && !brief ? "animate-pulse" : ""}>✦</span>
        <span>{open ? "Close" : "At a Glance"}</span>
      </button>
    </>
  );
}
