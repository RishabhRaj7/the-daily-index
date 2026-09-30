"use client";

import { createContext, useContext, useState } from "react";
import type { OddsPick } from "@/lib/odds-pick";
import OddsSheet from "@/components/widgets/OddsSheet";

// Odds under the news: when a prediction market is about a story in
// today's paper, the story carries one line of what traders expect —
// "Markets: 64% the ceasefire holds to 31 Oct ▲ 6". The page decides which
// stories get one (lib/odds-pick.ts storyOdds) and hands them down by
// headline.

export const StoryOddsContext = createContext<Map<string, OddsPick>>(new Map());

export default function StoryOdds({ headline }: { headline: string }) {
  const pick = useContext(StoryOddsContext).get(headline);
  const [open, setOpen] = useState(false);
  if (!pick) return null;
  const m = pick.market;
  const who = m.lead.name === "Yes" ? "yes" : m.lead.name;
  const move = m.lead.move != null && Math.abs(m.lead.move) >= 1 ? m.lead.move : null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full text-left rounded-lg border px-3 py-2 flex items-baseline gap-2 min-w-0 group"
        style={{ borderColor: "color-mix(in srgb, var(--hue-poll) 45%, transparent)" }}
        data-clip-ignore="true"
      >
        <span className="font-label text-[9px] shrink-0" style={{ color: "var(--hue-poll)" }}>
          Markets
        </span>
        <span className="font-display font-bold text-[1rem] tabular-nums shrink-0">{Math.round(m.lead.prob)}%</span>
        <span className="font-sans text-[12.5px] text-ink-soft truncate min-w-0 group-hover:text-ink">
          {who} · {m.title}
        </span>
        {move != null && (
          <span className={`font-mono text-[10px] shrink-0 ${move > 0 ? "text-up" : "text-down"}`}>
            {move > 0 ? "▲" : "▼"} {Math.abs(Math.round(move))}
          </span>
        )}
      </button>
      {open && <OddsSheet market={m} why="In today's news" onClose={() => setOpen(false)} />}
    </>
  );
}
