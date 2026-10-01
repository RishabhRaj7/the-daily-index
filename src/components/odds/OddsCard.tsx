"use client";

import { useState } from "react";
import type { OddsMarket } from "@/lib/types";
import { compactMoney, ladderLevel, ladderLine, type OddsPick } from "@/lib/odds-pick";
import OddsSheet from "@/components/widgets/OddsSheet";
import Spark from "./Spark";
import { useSpark } from "./odds-context";
import { SERIES_COLORS } from "./OddsChart";

// The paper's odds card, the unit of every strip: the reason it's here,
// the question, the favourite's chance in big type beside a week's line,
// and the field as one split bar (the leader in the section's colour), so
// a glance says both who leads and by how much. A price ladder shows its
// levels instead; a deadline ladder its nearest dates. It opens the sheet.

export function Move({ v, className = "" }: { v: number | null | undefined; className?: string }) {
  if (v == null || Math.abs(v) < 1) return null;
  return (
    <span className={`font-mono text-[10.5px] font-semibold tabular-nums whitespace-nowrap ${v > 0 ? "text-up" : "text-down"} ${className}`}>
      {v > 0 ? "▲" : "▼"} {Math.abs(Math.round(v))}
    </span>
  );
}

const leaderName = (m: OddsMarket) => (m.lead.name === "Yes" ? "Yes" : m.lead.name);

/** The field as one bar: each contender's share, the leader first. */
export function FieldBar({ m, height = 6 }: { m: OddsMarket; height?: number }) {
  // A yes/no, or a deadline ladder (its dates overlap, so they don't share one bar).
  if (m.binary || m.ladder) {
    return (
      <span className="flex rounded-full overflow-hidden bg-[color:var(--rule)]" style={{ height }}>
        <span className="h-full" style={{ width: `${m.lead.prob}%`, background: SERIES_COLORS[0] }} />
      </span>
    );
  }
  const top = m.outcomes.slice(0, 3);
  const total = Math.max(100, top.reduce((s, o) => s + o.prob, 0));
  return (
    <span className="flex rounded-full overflow-hidden bg-[color:var(--rule)] gap-[2px]" style={{ height }}>
      {top.map((o, i) => (
        <span key={o.name} className="h-full" style={{ width: `${(o.prob / total) * 100}%`, background: SERIES_COLORS[i], opacity: i === 0 ? 1 : 0.75 }} title={`${o.name} ${Math.round(o.prob)}%`} />
      ))}
    </span>
  );
}

/** A price ladder in miniature: each level's chance as a bar, highest level on top. */
export function HitLadder({ m, rows = 6, size = "sm" }: { m: OddsMarket; rows?: number; size?: "sm" | "lg" }) {
  const ups = m.outcomes.filter((o) => o.name.startsWith("↑"));
  const downs = m.outcomes.filter((o) => o.name.startsWith("↓"));
  // The levels nearest the even-money line on each side.
  const near = (list: typeof ups) => [...list].sort((a, b) => Math.abs(a.prob - 50) - Math.abs(b.prob - 50)).slice(0, Math.ceil(rows / 2));
  const shown = [...near(ups).sort((a, b) => ladderLevel(b.name) - ladderLevel(a.name)), ...near(downs).sort((a, b) => ladderLevel(b.name) - ladderLevel(a.name))];
  const big = size === "lg";
  return (
    <span className="block">
      {shown.map((o, i) => {
        const up = o.name.startsWith("↑");
        const first = !up && (i === 0 || shown[i - 1].name.startsWith("↑"));
        return (
          <span key={o.name} className="block">
            {first && i > 0 && (
              <span className="flex items-center gap-2 my-1 font-label text-[8px] text-ink-faint">
                <span className="flex-1 border-t border-dashed hairline" /> today <span className="flex-1 border-t border-dashed hairline" />
              </span>
            )}
            <span className={`grid items-center gap-2 ${big ? "grid-cols-[5.5rem_minmax(0,1fr)_3rem] text-[13px] py-0.5" : "grid-cols-[3.8rem_minmax(0,1fr)_2.2rem] text-[11px]"}`}>
              <span className="font-mono tabular-nums" style={{ color: up ? "var(--up)" : "var(--down)" }}>
                {o.name}
              </span>
              <span className="h-1.5 rounded-full bg-[color:var(--rule)] overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${o.prob}%`, background: up ? "var(--up)" : "var(--down)", opacity: 0.8 }} />
              </span>
              <span className="font-mono tabular-nums text-right">{Math.round(o.prob)}%</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

export default function OddsCard({ pick, compact = false }: { pick: OddsPick; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const m = pick.market;
  const spark = useSpark(m.id);
  const runners = m.binary || m.hit ? [] : m.outcomes.slice(1, 3);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group text-left w-full h-full flex flex-col rounded-2xl border hairline bg-card-bg/40 p-3.5 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:border-[color:var(--section-hue)] hover:bg-card-bg"
      >
        <span className="flex items-center justify-between gap-2 font-label text-[8.5px]">
          <span className="truncate" style={{ color: "var(--section-hue)" }}>
            {pick.watched ? "★ " : ""}
            {pick.why}
          </span>
          <Move v={pick.move || m.lead.move} />
        </span>
        <span className={`block font-headline leading-snug mt-1.5 ${compact ? "text-[14px] line-clamp-2" : "text-[15.5px] line-clamp-3"} group-hover:underline decoration-dotted underline-offset-2`}>
          {m.title}
        </span>
        <span className="mt-auto pt-3 block">
          {m.hit ? (
            <>
              <HitLadder m={m} rows={4} />
              <span className="block font-mono text-[10px] text-ink-soft mt-1.5 leading-snug">{ladderLine(m)}</span>
            </>
          ) : (
            <>
              <span className="flex items-end justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-display font-bold text-[2rem] leading-none tabular-nums">{Math.round(m.lead.prob)}%</span>
                  <span className="block font-sans text-[12px] font-semibold truncate mt-0.5">{leaderName(m)}</span>
                </span>
                <Spark points={spark} width={84} height={34} />
              </span>
              <span className="block mt-2.5">
                <FieldBar m={m} />
              </span>
              {runners.length > 0 && (
                <span className="block font-mono text-[10px] text-ink-soft mt-1.5 truncate">
                  {runners.map((o, i) => (
                    <span key={o.name}>
                      {i > 0 && " · "}
                      <span style={{ color: SERIES_COLORS[i + 1] }}>●</span> {o.name} {Math.round(o.prob)}%
                    </span>
                  ))}
                </span>
              )}
            </>
          )}
          <span className="block font-mono text-[9.5px] text-ink-faint mt-1.5 truncate">
            {m.source} · ${compactMoney(m.vol)}
            {m.also?.length ? ` · ${m.also.map((a) => `${a.source} ${Math.round(a.prob)}%`).join(" · ")}` : ""}
          </span>
        </span>
      </button>
      {open && <OddsSheet market={m} why={pick.why} watched={pick.watched} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * A section's odds: three or four cards under a thin label, at the foot of
 * the section. On a phone they scroll sideways.
 */
export function OddsStrip({ picks, label = "What traders expect" }: { picks: OddsPick[]; label?: string }) {
  if (picks.length === 0) return null;
  const cols = picks.length >= 4 ? "lg:grid-cols-4" : picks.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
  return (
    <div className="mt-10" data-clip-ignore="true">
      <div className="flex items-baseline justify-between gap-3 border-t hairline pt-3 mb-3">
        <span className="font-label text-[9.5px]">
          <span style={{ color: "var(--hue-poll)" }}>Straw Poll</span>
          <span className="text-ink-soft"> · {label}</span>
        </span>
        <a href="#straw-poll" className="font-mono text-[10px] text-ink-faint hover:text-ink">
          more odds ↓
        </a>
      </div>
      <div className={`grid grid-flow-col auto-cols-[78%] sm:auto-cols-[46%] lg:grid-flow-row lg:auto-cols-auto ${cols} gap-3 overflow-x-auto lg:overflow-visible snap-x snap-mandatory pb-1 -mx-1 px-1`}>
        {picks.map((p) => (
          <div key={p.market.id} className="snap-start min-w-0">
            <OddsCard pick={p} />
          </div>
        ))}
      </div>
    </div>
  );
}
