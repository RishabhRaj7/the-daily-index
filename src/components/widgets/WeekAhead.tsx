"use client";

import { ArrowRightIcon, BankIcon, BellRingingIcon, CaretDownIcon, CaretUpIcon, ChartLineUpIcon, ClockIcon, ConfettiIcon, CrosshairIcon, FlagCheckeredIcon, type Icon } from "@phosphor-icons/react";
import Sheet from "@/components/extras/Sheet";
import { PHONE, useMedia } from "@/lib/use-media";
import { useEffect, useState } from "react";
import type { AheadEvent, WeekAhead as WeekAheadData } from "@/lib/types";
import { loadPersonalization } from "@/lib/personalization";

// The Week Ahead: in the Next group, after the odds, seven days across the page, each
// day a column of what's dated in it — policy decisions, market closures,
// public holidays, IPO dates, the F1 weekend and your Valorant teams'
// matches — all in IST. On a phone
// and tablet the days stack as an agenda, the date beside its events, three days
// open: a phone's rest of the week slides up in a sheet, a tablet's opens in place.
// A small icon marks each kind of event. Beyond the week, the next policy dates wait at
// the end. Nothing is printed until the dates arrive, and a day with
// nothing on it stays quiet.

const KIND: Record<AheadEvent["kind"], { label: string; hue: string; icon: Icon }> = {
  policy: { label: "Policy", hue: "var(--hue-money)", icon: BankIcon },
  markets: { label: "Markets", hue: "var(--hue-markets)", icon: ChartLineUpIcon },
  holiday: { label: "Holiday", hue: "var(--hue-cities)", icon: ConfettiIcon },
  ipo: { label: "IPO", hue: "var(--hue-markets)", icon: BellRingingIcon },
  f1: { label: "F1", hue: "var(--hue-f1)", icon: FlagCheckeredIcon },
  esports: { label: "Valorant", hue: "var(--hue-clutch)", icon: CrosshairIcon },
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
      <span className="flex items-center gap-1.5 font-label text-[11px]" style={{ color: kind.hue }}>
        <kind.icon size={13} weight="fill" className="shrink-0" aria-hidden="true" />
        {kind.label}
        {e.time && <span className="font-mono text-ink-soft normal-case tracking-normal">{e.time}</span>}
      </span>
      <span className="font-sans text-[13px] leading-snug mt-0.5 line-clamp-4" title={e.label}>{e.label}</span>
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
  const phone = useMedia(PHONE);

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
  // On a phone the rest of the week slides up in a sheet; a tablet opens it in place.
  const dayRow = (date: string, i: number, always: boolean) => {
    const d = DAY(date);
    const events = week.events.filter((e) => e.date === date);
    const today = i === 0;
    return (
      <li
        key={date}
        className={`min-w-0 ${!always && i >= SHOWN ? "hidden" : "grid"} grid-cols-[4.25rem_minmax(0,1fr)] gap-3 py-3 ${always && phone ? "" : `lg:block lg:py-0 lg:px-3 ${i > 0 ? "lg:border-l hairline" : "lg:pl-0"}`}`}
      >
        <div className="flex flex-col lg:flex-row lg:items-baseline gap-0.5 lg:gap-2 lg:mb-3">
          <span className={`font-display font-bold text-[1.7rem] leading-none tabular-nums ${today ? "text-[color:var(--section-hue)]" : ""}`}>
            {d.getUTCDate()}
          </span>
          <span className="font-label text-[11px] text-ink-soft">
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
  };

  return (
    <section id="week-ahead" aria-label="The week ahead" className="mt-6 border-y hairline py-4" style={{ ["--section-hue" as string]: "var(--hue-money)" }} data-reveal>
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="font-display font-bold text-[1.6rem] leading-none">The Week Ahead</h2>
        <span className="font-mono text-[11px] text-ink-soft inline-flex items-center gap-1">
          <ClockIcon size={13} aria-hidden="true" />
          IST
        </span>
      </div>
      <ol className="divide-y hairline lg:divide-y-0 lg:grid lg:grid-cols-7">
        {days.map((date, i) => dayRow(date, i, whole && !phone))}
      </ol>
      <button
        type="button"
        onClick={() => setWhole((w) => !w)}
        aria-expanded={whole}
        className="lg:hidden w-full border-t hairline pt-3 font-mono text-[11px] text-ink-soft hover:text-ink text-left inline-flex items-center gap-1"
      >
        {whole && !phone ? "Show less" : `The rest of the week · ${week.events.filter((e) => e.date >= days[SHOWN]).length} more`}
        {phone ? <ArrowRightIcon size={13} weight="bold" aria-hidden="true" /> : whole ? <CaretUpIcon size={13} weight="bold" aria-hidden="true" /> : <CaretDownIcon size={13} weight="bold" aria-hidden="true" />}
      </button>
      {whole && phone && (
        <Sheet title="The Week Ahead" kicker="All times IST" onClose={() => setWhole(false)} hue="var(--hue-money)">
          <ol className="divide-y hairline">{days.map((date, i) => dayRow(date, i, true))}</ol>
        </Sheet>
      )}
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
