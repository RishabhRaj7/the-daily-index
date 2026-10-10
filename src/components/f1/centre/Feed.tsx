"use client";

import { useMemo, useState } from "react";
import type { LivePitStop, LiveRadio, LiveSnapshot } from "@/lib/f1-live-types";
import { readRaceControl, type RcItem, type RcTone } from "@/lib/f1-race-control";
import TyreIcon, { TYRE } from "../TyreIcon";
import { RadioRow, usePlayer, useTranscripts } from "./Radio";
import { Empty, Seg, clock } from "./ui";

// The session as it happens, in one stream: race control (read plainly —
// lib/f1-race-control.ts), team radio with transcripts, and every pit stop
// (time standing, time in the lane, the tyres it went out on). Filed under
// All · Flags · Stewards · Track limits · Pits · Radio · Info, with a switch
// for just the reader's drivers. Blue flags are in Flags only (a race has
// dozens). On the Live view a short version shows the latest few.

type Filter = "all" | "flags" | "stewards" | "limits" | "pits" | "radio" | "info";

type Item = { t: number; kind: "rc"; rc: RcItem } | { t: number; kind: "radio"; radio: LiveRadio } | { t: number; kind: "pit"; pit: LivePitStop; tyre: { compound: keyof typeof TYRE; fresh: boolean } | null };

const when = (utc: string) => Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(utc) ? utc : `${utc}Z`) || 0;

export const TONE_COLOUR: Record<RcTone, string> = {
  yellow: "var(--f1-slower)",
  red: "var(--down)",
  green: "var(--f1-personal)",
  sc: "#ff9f1a",
  blue: "#3b82f6",
  chequered: "var(--ink)",
  bw: "var(--ink)",
  stewards: "#c084fc",
  penalty: "var(--down)",
  limits: "#fb923c",
  info: "var(--ink-faint)",
};

const KIND_LABEL: Record<RcItem["kind"], string> = { flags: "Flag", stewards: "Stewards", limits: "Track limits", info: "Info" };

function useItems(snap: LiveSnapshot): Item[] {
  return useMemo(() => {
    const numbers = new Map(snap.rows.map((r) => [r.number, r.code]));
    const rc: Item[] = readRaceControl(snap.raceControl ?? [], numbers).map((x) => ({ t: when(x.utc), kind: "rc", rc: x }));
    const radio: Item[] = (snap.radio ?? []).map((r) => ({ t: when(r.utc), kind: "radio", radio: r }));
    // The tyres each stop put on: stop n opens stint n + 1.
    const pits: Item[] = [];
    const byCode = new Map<string, LivePitStop[]>();
    for (const p of snap.pitStops ?? []) byCode.set(p.code, [...(byCode.get(p.code) ?? []), p]);
    for (const [code, stops] of byCode) {
      const stints = snap.stints?.find((s) => s.code === code)?.stints ?? [];
      [...stops]
        .sort((a, b) => a.lap - b.lap)
        .forEach((p, i) => {
          const s = stints[i + 1];
          pits.push({ t: when(p.utc), kind: "pit", pit: p, tyre: s ? { compound: s.compound, fresh: s.fresh } : null });
        });
    }
    return [...rc, ...radio, ...pits].sort((a, b) => b.t - a.t);
  }, [snap.raceControl, snap.radio, snap.pitStops, snap.stints, snap.rows]);
}

const matches = (it: Item, f: Filter) =>
  f === "all" ? !(it.kind === "rc" && it.rc.minor) : f === "radio" ? it.kind === "radio" : f === "pits" ? it.kind === "pit" : it.kind === "rc" && it.rc.kind === f;

const about = (it: Item): string[] => (it.kind === "rc" ? it.rc.drivers : it.kind === "radio" ? [it.radio.code] : [it.pit.code]);

function RcRow({ it }: { it: RcItem }) {
  const c = TONE_COLOUR[it.tone];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
      <span className="flex items-center gap-1.5 font-label text-[8.5px]" style={{ color: it.tone === "info" ? "var(--ink-faint)" : c }}>
        <span className={`w-1.5 h-1.5 ${it.tone === "chequered" ? "rounded-[1px]" : "rounded-full"}`} style={{ background: c }} />
        {it.tone === "penalty" ? "Penalty" : it.tone === "sc" ? "Safety car" : KIND_LABEL[it.kind]}
      </span>
      <span className="text-[13px] leading-snug">
        {it.text}
        {it.cleared && <span className="font-mono text-[10.5px] text-ink-faint"> · cleared {clock(it.cleared)}</span>}
      </span>
    </div>
  );
}

function PitRow({ p, tyre }: { p: LivePitStop; tyre: { compound: keyof typeof TYRE; fresh: boolean } | null }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-label text-[8.5px]" style={{ color: "var(--f1-pit)" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--f1-pit)" }} /> Pit stop
        </span>
        <span className="block text-[13px] leading-snug">
          <b className="font-sans">{p.code}</b> pits on lap {p.lap}
          {p.stationary !== null && <> · {p.stationary.toFixed(1)} s standing</>}
          {p.lane !== null && <span className="text-ink-soft"> · {p.lane.toFixed(1)} s in the lane</span>}
        </span>
      </span>
      {tyre && (
        <span className="flex items-center gap-1 font-mono text-[10px] text-ink-soft" title={`Out on ${tyre.fresh ? "new" : "used"} ${TYRE[tyre.compound].name.toLowerCase()}s`}>
          → <TyreIcon compound={tyre.compound} fresh={tyre.fresh} size={18} />
        </span>
      )}
    </div>
  );
}

export default function Feed({ snap, mine, photos, limit, onMore }: { snap: LiveSnapshot; mine: Set<string>; photos: Record<string, string>; limit?: number; onMore?: () => void }) {
  const items = useItems(snap);
  const [filter, setFilter] = useState<Filter>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [count, setCount] = useState(40);
  const player = usePlayer();
  const compact = limit !== undefined;

  const filtered = items.filter((it) => matches(it, compact ? "all" : filter) && (!onlyMine || about(it).some((c) => mine.has(c))));
  const shown = filtered.slice(0, compact ? limit : count);
  const clips = shown.flatMap((it) => (it.kind === "radio" ? [it.radio] : []));
  const { text, pending, paused } = useTranscripts(clips);

  const n = (f: Filter) => items.filter((it) => matches(it, f) && (!onlyMine || about(it).some((c) => mine.has(c)))).length;
  const options: { value: Filter; label: string; count?: number }[] = [
    { value: "all", label: "All" },
    { value: "flags", label: "Flags", count: n("flags") },
    { value: "stewards", label: "Stewards", count: n("stewards") },
    { value: "limits", label: "Track limits", count: n("limits") },
    { value: "pits", label: "Pits", count: n("pits") },
    { value: "radio", label: "Radio", count: n("radio") },
    { value: "info", label: "Info", count: n("info") },
  ];
  const visible = options.filter((o) => o.value === "all" || o.value === filter || (o.count ?? 0) > 0);

  return (
    <div className="min-w-0">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="min-w-0 flex-1">
            <Seg label="Show" value={filter} onChange={setFilter} options={visible} size="sm" />
          </div>
          {mine.size > 0 && (
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              aria-pressed={onlyMine}
              className={`rounded-full border h-8 px-3 font-sans text-[12px] font-semibold transition-colors shrink-0 ${onlyMine ? "text-[color:var(--paper)] border-transparent" : "hairline text-ink-soft hover:text-ink"}`}
              style={onlyMine ? { background: "var(--hue-f1)" } : undefined}
            >
              Your drivers
            </button>
          )}
        </div>
      )}
      {shown.length === 0 ? (
        <Empty>{onlyMine ? "Nothing about your drivers here yet." : "Nothing here yet."}</Empty>
      ) : (
        <ol>
          {shown.map((it, i) => (
            <li key={`${it.kind}-${it.t}-${i}`} className="grid grid-cols-[2.6rem_minmax(0,1fr)] gap-3 border-t hairline first:border-t-0 py-2.5 animate-[fade-in_0.3s_ease]">
              <span className="font-mono text-[10.5px] text-ink-soft tabular-nums leading-tight pt-[1px]">
                {clock(new Date(it.t).toISOString())}
                {it.kind === "rc" && it.rc.lap != null && <span className="block text-ink-faint">L{it.rc.lap}</span>}
              </span>
              {it.kind === "rc" ? (
                <RcRow it={it.rc} />
              ) : it.kind === "pit" ? (
                <PitRow p={it.pit} tyre={it.tyre} />
              ) : (
                <RadioRow clip={it.radio} photo={photos[it.radio.code]} written={text[it.radio.url]} pending={pending} paused={paused} player={player} compact />
              )}
            </li>
          ))}
        </ol>
      )}
      {compact
        ? onMore &&
          filtered.length > shown.length && (
            <button type="button" onClick={onMore} className="mt-3 font-sans text-[12px] font-semibold text-ink-soft hover:text-ink">
              The whole feed ({filtered.length}) →
            </button>
          )
        : filtered.length > shown.length && (
            <button type="button" onClick={() => setCount((c) => c + 40)} className="mt-3 font-sans text-[12px] font-semibold text-ink-soft hover:text-ink">
              Earlier ({filtered.length - shown.length} more)
            </button>
          )}
    </div>
  );
}
