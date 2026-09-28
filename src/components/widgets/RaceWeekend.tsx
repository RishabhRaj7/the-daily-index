"use client";

import { useSyncExternalStore } from "react";
import type { F1Session } from "@/lib/types";

// The next race weekend, session by session, in the reader's own time:
// practice, sprint qualifying / sprint on sprint weekends, qualifying and
// the race. Finished sessions dim, a running one is marked live, and the
// next one carries a countdown.

function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 30_000);
  return () => window.clearInterval(id);
}
const now = () => Math.floor(Date.now() / 30_000) * 30_000;

const SHORT: Record<string, string> = {
  "Practice 1": "FP1",
  "Practice 2": "FP2",
  "Practice 3": "FP3",
  "Sprint Qualifying": "Sprint Quali",
  "Sprint Shootout": "Sprint Quali",
};

function until(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m % 60}m`;
  return `in ${m}m`;
}

export default function RaceWeekend({ sessions }: { sessions: F1Session[] }) {
  const at = useSyncExternalStore(subscribe, now, () => null);
  if (sessions.length === 0) return null;

  const tz = new Intl.DateTimeFormat("en-IN", { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;
  const nextIdx = at === null ? -1 : sessions.findIndex((s) => Date.parse(s.end) > at);
  const isSprint = sessions.some((s) => /sprint/i.test(s.name));

  // Group by day, in the reader's calendar.
  const days: Array<{ day: string; items: Array<{ s: F1Session; i: number }> }> = [];
  sessions.forEach((s, i) => {
    const day = new Date(s.start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    const last = days.at(-1);
    if (last && last.day === day) last.items.push({ s, i });
    else days.push({ day, items: [{ s, i }] });
  });

  return (
    <div className="module" data-reveal>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="font-label text-[10px] text-ink-soft">
          Race weekend{isSprint ? " · sprint" : ""}
        </div>
        {tz && <div className="font-mono text-[10px] text-ink-faint">times in {tz}</div>}
      </div>
      <ol className="space-y-3">
        {days.map(({ day, items }) => (
          <li key={day}>
            <div className="font-label text-[9px] text-ink-faint mb-1">{day}</div>
            <ul className="space-y-1">
              {items.map(({ s, i }) => {
                const start = Date.parse(s.start);
                const end = Date.parse(s.end);
                const live = at !== null && at >= start && at < end;
                const done = at !== null && at >= end;
                const next = i === nextIdx && !live;
                const main = /^(qualifying|race|sprint)$/i.test(s.name);
                return (
                  <li
                    key={s.name + s.start}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 ${
                      next || live ? "bg-card-bg" : ""
                    } ${done ? "opacity-45" : ""}`}
                    style={next || live ? { boxShadow: "inset 3px 0 0 var(--section-hue, var(--accent))" } : undefined}
                  >
                    <span className={`truncate text-[13px] ${main ? "font-semibold" : ""}`}>
                      {SHORT[s.name] ?? s.name}
                      {live && <span className="ml-2 font-mono text-[10px] text-down">● live</span>}
                      {next && at !== null && (
                        <span className="ml-2 font-mono text-[10px] text-ink-soft">{until(start - at)}</span>
                      )}
                      {done && <span className="ml-2 font-mono text-[10px]">✓</span>}
                    </span>
                    <span className="font-mono text-[12px] tabular-nums">
                      {new Date(s.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
