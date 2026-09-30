"use client";

import { useState } from "react";
import type { OddsPick } from "@/lib/odds-pick";
import OddsSheet from "./OddsSheet";

// One market at the foot of a section, when that section has one worth a
// line: "STRAW POLL · 64% Norris wins the Mexico GP ▲ 6". It opens the
// market's sheet right here.
export default function OddsLine({ pick }: { pick: OddsPick }) {
  const [open, setOpen] = useState(false);
  const m = pick.market;
  const move = m.lead.move != null && Math.abs(m.lead.move) >= 1 ? m.lead.move : null;
  const who = m.lead.name === "Yes" ? "yes" : m.lead.name;
  return (
    <div className="mt-8 border-t hairline pt-3">
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left flex items-baseline gap-2 min-w-0 group">
        <span className="font-label text-[9px] shrink-0" style={{ color: "var(--hue-poll)" }}>
          Straw Poll
        </span>
        <span className="font-display font-bold text-[1.05rem] tabular-nums shrink-0">{Math.round(m.lead.prob)}%</span>
        <span className="font-sans text-[13px] truncate min-w-0 group-hover:underline decoration-dotted underline-offset-2">
          {who} · {m.title}
        </span>
        {move != null && (
          <span className={`font-mono text-[10px] shrink-0 ${move > 0 ? "text-up" : "text-down"}`}>
            {move > 0 ? "▲" : "▼"} {Math.abs(Math.round(move))}
          </span>
        )}
        <span className="font-mono text-[9px] text-ink-faint shrink-0 hidden sm:inline">{pick.why}</span>
      </button>
      {open && <OddsSheet market={m} why={pick.why} onClose={() => setOpen(false)} />}
    </div>
  );
}
