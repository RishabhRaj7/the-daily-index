"use client";

import { useEffect, useState } from "react";
import type { F1Race } from "@/lib/types";
import type { LiveSnapshot } from "@/lib/f1-live-types";
import type { PastMeeting } from "@/lib/live/f1-live";
import type { Season } from "@/lib/live/f1-season";
import TrackMap, { useTrack } from "../TrackMap";
import { TeamGlyph } from "../LiveTiming";
import { Benchmarks } from "./Analysis";
import { Panel } from "./ui";

// The race weekend around the session on show: every session in order —
// finished ones with who topped them (tap to open that session here; the one
// on show is marked), the rest with their start times — the circuit (its
// map, corners, what a pit stop costs, a sprint weekend or not), the lap
// references, and the rounds after this one.

interface Top {
  code: string;
  name: string;
  team: string;
  colour: string;
  time: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short" });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function useMeeting(name: string): PastMeeting | null {
  const [m, setM] = useState<{ name: string; m: PastMeeting | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/f1/sessions")
      .then((r) => (r.ok ? (r.json() as Promise<PastMeeting[]>) : []))
      .then((list) => live && setM({ name, m: list.find((x) => x.meeting === name) ?? null }))
      .catch(() => live && setM({ name, m: null }));
    return () => {
      live = false;
    };
  }, [name]);
  return m?.name === name ? m.m : null;
}

/** Who topped each finished session (from the kept copies). */
function useTops(paths: string[]): Record<string, Top | null> {
  const [tops, setTops] = useState<Record<string, Top | null>>({});
  const key = paths.join(",");
  useEffect(() => {
    let live = true;
    for (const path of key ? key.split(",") : []) {
      fetch(`/api/f1/live?session=${encodeURIComponent(path)}`)
        .then((r) => r.json())
        .then((d: { last?: LiveSnapshot | null }) => {
          const r = d.last?.rows[0];
          if (!live) return;
          setTops((t) => ({ ...t, [path]: r ? { code: r.code, name: r.name, team: r.team, colour: r.colour, time: d.last?.type === "Race" ? "" : r.best } : null }));
        })
        .catch(() => live && setTops((t) => ({ ...t, [path]: null })));
    }
    return () => {
      live = false;
    };
  }, [key]);
  return tops;
}

function useSeason(): Season | null {
  const [s, setS] = useState<Season | null>(null);
  useEffect(() => {
    fetch("/api/f1/season")
      .then((r) => (r.ok ? (r.json() as Promise<Season>) : null))
      .then(setS)
      .catch(() => {});
  }, []);
  return s;
}

export default function Weekend({ snap, race, current, onPick }: { snap: LiveSnapshot; race: F1Race | null; current: string | null; onPick: (path: string | null) => void }) {
  const meeting = useMeeting(snap.meeting);
  const done = meeting?.sessions ?? [];
  const tops = useTops(done.map((s) => s.path));
  const track = useTrack(snap.circuitKey);
  const season = useSeason();
  const [now] = useState(() => Date.now());

  // The sessions still to come, when this is the next race's weekend.
  const sameWeekend = race && (race.name === snap.meeting || race.circuitKey === snap.circuitKey);
  const upcoming = sameWeekend ? (race.sessions ?? []).filter((s) => !done.some((d) => d.name === s.name) && Date.parse(s.end || s.start) > now - 3 * 3_600_000) : [];
  const sprint = [...done.map((d) => d.name), ...upcoming.map((u) => u.name)].some((n) => /^Sprint$/.test(n));
  const shown = current ?? snap.path;

  const after = season?.rounds.filter((r) => !r.done && new Date(r.date).getTime() > now + 2 * 86_400_000).slice(0, 3) ?? [];

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] gap-6 items-start">
      <div className="space-y-6 min-w-0">
        <Panel label="This weekend" meta={meeting ? `Round ${meeting.round}${sprint ? " · sprint weekend" : ""}` : undefined}>
          <ol>
            {done.map((s) => {
              const top = tops[s.path];
              const on = s.path === shown;
              return (
                <li key={s.path}>
                  <button
                    type="button"
                    onClick={() => onPick(s.path)}
                    className={`w-full grid grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${on ? "" : "hover:bg-[var(--card-bg)]"}`}
                    style={on ? { background: "color-mix(in srgb, var(--hue-f1) 14%, transparent)", boxShadow: "inset 3px 0 0 var(--hue-f1)" } : undefined}
                    aria-current={on || undefined}
                  >
                    <span className="font-mono text-[10.5px] text-ink-soft leading-tight">
                      {day(s.end)}
                      <span className="block text-ink-faint">done</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-sans font-semibold text-[13.5px]">{s.name}</span>
                      {top === undefined ? (
                        <span className="block font-mono text-[10.5px] shimmer-text">Reading…</span>
                      ) : top ? (
                        <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-soft mt-0.5">
                          <span className="font-label text-[8px]" style={{ color: "var(--hue-f1)" }}>
                            P1
                          </span>
                          <TeamGlyph team={top.team} colour={top.colour} size={12} />
                          <b className="font-sans text-ink">{top.name}</b>
                          {top.time && <span>{top.time}</span>}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-label text-[8.5px] text-ink-faint">{on ? "On show" : "Open →"}</span>
                  </button>
                </li>
              );
            })}
            {upcoming.map((s) => (
              <li key={s.name} className="grid grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
                <span className="font-mono text-[10.5px] text-ink-soft leading-tight">
                  {day(s.start)}
                  <span className="block text-ink-faint">{hm(s.start)}</span>
                </span>
                <span className="font-sans font-semibold text-[13.5px] text-ink-soft">{s.name}</span>
                <span className="font-label text-[8.5px] text-ink-faint">To come</span>
              </li>
            ))}
            {!meeting && done.length === 0 && upcoming.length === 0 && <li className="font-mono text-[11px] text-ink-faint px-3 py-3 shimmer-text">Reading the weekend…</li>}
          </ol>
          {current && (
            <button type="button" onClick={() => onPick(null)} className="mt-3 font-sans text-[12px] font-semibold text-ink-soft hover:text-ink">
              ← Back to the latest session
            </button>
          )}
        </Panel>

        {after.length > 0 && (
          <Panel label="After this">
            <ol className="grid sm:grid-cols-3 gap-3">
              {after.map((r) => (
                <li key={r.round} className="rounded-xl border hairline px-3.5 py-3">
                  <div className="font-label text-[8.5px] text-ink-faint">Round {r.round}</div>
                  <div className="font-display font-extrabold uppercase text-[1.25rem] leading-none mt-1.5">{r.name}</div>
                  <div className="font-mono text-[10.5px] text-ink-soft mt-1.5">
                    {new Date(r.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    {r.sprint ? " · sprint" : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        )}
      </div>

      <div className="space-y-6 min-w-0">
        <Panel label={track?.name || snap.location || "The circuit"} meta={snap.location}>
          {track ? <TrackMap model={track} /> : <div className="aspect-[4/3] rounded-xl bg-[var(--rule)] animate-pulse opacity-40" />}
          <dl className="grid grid-cols-3 gap-2 mt-4">
            {[
              { k: "Corners", v: track?.corners.length ? String(track.corners.length) : "—" },
              { k: "A pit stop", v: track?.pitLoss ? `~${Math.round(track.pitLoss)} s` : "—" },
              { k: snap.type === "Race" && snap.lap ? "Race laps" : "Format", v: snap.type === "Race" && snap.lap ? String(snap.lap.total) : sprint ? "Sprint" : "Standard" },
            ].map((x) => (
              <div key={x.k} className="rounded-xl border hairline px-3 py-2">
                <dt className="font-label text-[8px] text-ink-faint">{x.k}</dt>
                <dd className="font-display font-extrabold text-[1.3rem] leading-none mt-1.5">{x.v}</dd>
              </div>
            ))}
          </dl>
          <p className="font-mono text-[9.5px] text-ink-faint mt-2">A pit stop: time lost against staying out, under green (MultiViewer).</p>
        </Panel>
        <Panel label="Lap benchmarks">
          <Benchmarks snap={snap} />
        </Panel>
      </div>
    </div>
  );
}
