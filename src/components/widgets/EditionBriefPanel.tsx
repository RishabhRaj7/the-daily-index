"use client";

import { useState } from "react";
import type { EditionBrief } from "@/lib/types";

const SECTION_ICONS: Record<string, string> = {
  World:   "⊕",
  Markets: "↗",
  Sports:  "◎",
  Tech:    "◈",
  Cards:   "▣",
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
          className="fixed bottom-[3.75rem] left-4 z-40 w-[300px] bg-paper border hairline rounded-sm shadow-2xl flex flex-col"
          style={{ maxHeight: "70vh" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-4 py-3 border-b hairline shrink-0">
            <div>
              <div className="font-label text-[10px] text-masthead-red leading-tight">
                At a Glance
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
                    <span className="text-masthead-red font-mono text-[13px] shrink-0 mt-px leading-tight">
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
        className="fixed bottom-5 left-4 z-40 bg-ink text-paper px-4 py-2.5 rounded-full font-label text-[11px] shadow-lg flex items-center gap-2 hover:opacity-90 active:scale-95 transition-transform cursor-pointer"
      >
        <span className={isLoading && !brief ? "animate-pulse" : ""}>✦</span>
        <span>{open ? "Close" : "At a Glance"}</span>
      </button>
    </>
  );
}
