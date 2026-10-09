"use client";

import { useEffect, useState } from "react";
import type { AheadEvent, WeekAhead as WeekAheadData } from "@/lib/types";
import { loadPersonalization } from "@/lib/personalization";

// The Week Ahead: seven days across the page under the front page, each
// day a column of what's dated in it — policy decisions, market closures,
// public holidays, IPO dates, the F1 weekend and your Valorant teams'
// matches — all in IST. On a phone
// and tablet the days stack as an agenda, the date beside its events,
// three days open and the rest a tap away. Beyond the week, the next policy dates wait at
// the end. Nothing is printed until the dates arrive, and a day with
// nothing on it stays quiet.

const KIND: Record<AheadEvent["kind"], { label: string; hue: string }> = {
  policy: { label: "Policy", hue: "var(--hue-money)" },
  markets: { label: "Markets", hue: "var(--hue-markets)" },
  holiday: { label: "Holiday", hue: "var(--hue-cities)" },
  ipo: { label: "IPO", hue: "var(--hue-markets)" },
  f1: { label: "F1", hue: "var(--hue-f1)" },
  esports: { label: "Valorant", hue: "var(--hue-clutch)" },
};

/** Days a phone shows before "the rest of the week". */
const SHOWN = 3;

const DAY = (iso: string) => new Date(`${iso}T12:00:00Z`);

function addDays(iso: string, n: number): string {
  const d = DAY(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Event({ e }: { e: AheadEvent }) {
  const kind = KIND[e.kind];
  const body = (
    <>
      <span className="flex items-center gap-1.5 font-label text-[8px]" style={{ color: kind.hue }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: kind.hue }} aria-hidden="true" />
        {kind.label}
        {e.time && <span className="font-mono text-ink-soft normal-case tracking-normal">{e.time}</span>}
      </span>
      <span className="text-[13px] leading-snug mt-0.5 line-clamp-4" title={e.label}>{e.label}</span>
    </>
  );
  return (
    <li>
      {e.url ? (
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="block hover:text-[color:var(--section-hue)]">
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}

export default function WeekAhead() {
  const [week, setWeek] = useState<WeekAheadData | null>(null);
  const [whole, setWhole] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const teams = loadPersonalization().valorantTeams.join(",");
    fetch(`/api/ahead${teams ? `?vt=${encodeURIComponent(teams)}` : ""}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<WeekAheadData>) : null))
      .then((w) => w && setWeek(w))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!week || (week.events.length === 0 && week.later.length === 0)) return null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.from, i));

  return (
    <section aria-label="The week ahead" className="mt-14 border-y hairline py-6" style={{ ["--section-hue" as string]: "var(--hue-money)" }} data-reveal>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="font-display font-bold text-[1.6rem] leading-none">The Week Ahead</h2>
        <span className="font-mono text-[10px] text-ink-soft">All times IST</span>
      </div>
      <ol className="divide-y hairline lg:divide-y-0 lg:grid lg:grid-cols-7">
        {days.map((date, i) => {
          const d = DAY(date);
          const events = week.events.filter((e) => e.date === date);
          const today = i === 0;
          return (
            <li
              key={date}
              className={`min-w-0 ${!whole && i >= SHOWN ? "hidden" : "grid"} grid-cols-[4.25rem_minmax(0,1fr)] gap-3 py-3 lg:block lg:py-0 lg:px-3 ${i > 0 ? "lg:border-l hairline" : "lg:pl-0"}`}
            >
              <div className="flex flex-col lg:flex-row lg:items-baseline gap-0.5 lg:gap-2 lg:mb-3">
                <span className={`font-display font-bold text-[1.7rem] leading-none tabular-nums ${today ? "text-[color:var(--section-hue)]" : ""}`}>
                  {d.getUTCDate()}
                </span>
                <span className="font-label text-[9px] text-ink-soft">
                  {today ? "Today" : d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                  {(i === 0 || d.getUTCDate() === 1) && ` · ${d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}`}
                </span>
              </div>
              {events.length > 0 ? (
                <ul className="space-y-3">
                  {events.map((e) => (
                    <Event key={`${e.kind}-${e.label}`} e={e} />
                  ))}
                </ul>
              ) : (
                <span className="block h-px w-6 bg-rule mt-2" aria-label="Nothing dated" />
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => setWhole((w) => !w)}
        aria-expanded={whole}
        className="lg:hidden w-full border-t hairline pt-3 font-mono text-[11px] text-ink-soft hover:text-ink text-left"
      >
        {whole ? "Show less ▴" : `The rest of the week · ${week.events.filter((e) => e.date >= days[SHOWN]).length} more ▾`}
      </button>
      {week.later.length > 0 && (
        <p className="font-mono text-[11px] text-ink-soft mt-5">
          Later:{" "}
          {week.later
            .map((e) => `${e.label}, ${DAY(e.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}${e.time ? ` ${e.time}` : ""}`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}
