"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SectionKey } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";

// Page order: every section under the name the paper prints it with
// ("The Ledger"), its subject beneath ("Finance"), in the order it prints.
//
// Moving a row animates: the rows swap by sliding past each other (FLIP:
// measure where each row was, let React reorder, then play the difference
// back as a transform), and the moved row lifts and glows for a moment so
// the eye follows it. Reduced-motion readers get the instant swap.

const SLIDE_MS = 320;

export default function PageOrderList({
  order,
  hidden,
  onMove,
  onToggle,
}: {
  order: SectionKey[];
  hidden: SectionKey[];
  onMove: (key: SectionKey, dir: -1 | 1) => void;
  onToggle: (key: SectionKey) => void;
}) {
  const rows = useRef(new Map<SectionKey, HTMLLIElement>());
  const before = useRef(new Map<SectionKey, number>());
  const [moved, setMoved] = useState<SectionKey | null>(null);

  // Remember where each row sits before a move changes the order.
  const move = (key: SectionKey, dir: -1 | 1) => {
    before.current = new Map([...rows.current].map(([k, el]) => [k, el.getBoundingClientRect().top]));
    setMoved(key);
    onMove(key, dir);
  };

  // After React has put the rows in their new places, start each from where
  // it was and slide it home.
  useLayoutEffect(() => {
    const was = before.current;
    if (was.size === 0) return;
    before.current = new Map();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [key, el] of rows.current) {
      const from = was.get(key);
      if (from === undefined) continue;
      const dy = from - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
        { duration: SLIDE_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    }
  }, [order]);

  // The lift clears once the slide has landed.
  useEffect(() => {
    if (!moved) return;
    const t = window.setTimeout(() => setMoved(null), SLIDE_MS + 500);
    return () => window.clearTimeout(t);
  }, [moved, order]);

  return (
    <ol className="divide-y hairline border-y hairline">
      {order.map((key, idx) => {
        const meta = SECTION_META[key];
        const active = !hidden.includes(key);
        const position = order.slice(0, idx + 1).filter((k) => !hidden.includes(k)).length;
        const lifted = moved === key;
        return (
          <li
            key={key}
            ref={(el) => {
              if (el) rows.current.set(key, el);
              else rows.current.delete(key);
            }}
            className="relative flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg transition-[background-color,box-shadow] duration-500"
            style={
              lifted
                ? {
                    zIndex: 1,
                    background: `color-mix(in srgb, ${meta.hue} 10%, var(--paper))`,
                    boxShadow: `0 6px 18px -8px color-mix(in srgb, ${meta.hue} 55%, transparent)`,
                  }
                : undefined
            }
          >
            <span className={`font-mono text-xs w-5 tabular-nums ${active ? "" : "text-ink-soft/50"}`}>
              {active ? `${position}.` : "–"}
            </span>
            <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: active ? meta.hue : "var(--rule)" }} aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className={`block font-headline text-[15px] leading-tight ${active ? "font-semibold" : "text-ink-soft italic"}`}>
                {meta.name}
              </span>
              <span className="block font-label text-[9px] text-ink-soft mt-0.5">{meta.kicker}</span>
            </span>
            {active && (
              <span className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Move ${meta.name} up`}
                  disabled={idx === 0}
                  onClick={() => move(key, -1)}
                  className="font-mono text-xs px-1.5 py-0.5 border hairline rounded-full disabled:opacity-30 hover:bg-card-bg transition-transform active:-translate-y-0.5"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${meta.name} down`}
                  disabled={idx === order.length - 1}
                  onClick={() => move(key, 1)}
                  className="font-mono text-xs px-1.5 py-0.5 border hairline rounded-full disabled:opacity-30 hover:bg-card-bg transition-transform active:translate-y-0.5"
                >
                  ↓
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => onToggle(key)}
              aria-pressed={active}
              className={`font-label text-[10px] px-2.5 py-1 border hairline rounded-full transition-colors ${
                active ? "bg-accent text-accent-ink border-accent" : "hover:bg-card-bg"
              }`}
            >
              {active ? "Shown" : "Hidden"}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
