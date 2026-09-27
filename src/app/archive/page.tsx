import Link from "next/link";
import { cookies } from "next/headers";
import TopBar from "@/components/chrome/TopBar";
import { RisingWords } from "@/components/story/SectionHeader";
import { archiveAvailable, archiveDates, archivedEdition, readSnapshot } from "@/lib/server/editions";
import type { EditionRecord } from "@/lib/server/editions";
import type { EditionSnapshot } from "@/lib/server/snapshot";
import { EDITION_COOKIE } from "@/lib/edition-client";
import { editionDate } from "@/lib/edition-date";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Archive — The Daily Index" };

// The archive as a stack of back issues: each day's front page in one line —
// its lead story, the next two headlines, how many stories ran in each desk,
// and how the market closed that day. Newest first, the latest one large.

const SHOWN = 60;

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

interface Issue {
  date: string;
  lead: { title: string; section: string } | null;
  more: string[];
  desks: Array<{ label: string; count: number }>;
  total: number;
  market: { name: string; changePct: number } | null;
}

function toIssue(date: string, edition: EditionRecord | null, snapshot: EditionSnapshot | null): Issue {
  const digest = edition?.digest;
  const layout = edition?.layout
    ? [...edition.layout].sort((a, b) => a.order - b.order)
    : Object.keys(digest?.sections ?? {}).map((id) => ({ id, label: id }));
  const desks = layout
    .map((s) => ({ label: s.label, articles: digest?.sections[s.id] ?? [] }))
    .filter((d) => d.articles.length > 0);
  // The day's lead is the editor's first briefing pick; older editions
  // without a briefing fall back to the first desk's top story.
  const glance = digest?.atAGlance?.[0];
  const lead = glance
    ? { title: glance.title, section: glance.pool }
    : desks[0]?.articles[0]
      ? { title: desks[0].articles[0].title, section: desks[0].label }
      : null;
  const more = desks
    .map((d) => d.articles[0]?.title)
    .filter((t): t is string => Boolean(t) && t !== lead?.title)
    .slice(0, 2);
  const market = snapshot?.markets.find((m) => /nifty 50/i.test(m.name)) ?? snapshot?.markets[0] ?? null;
  return {
    date,
    lead,
    more,
    desks: desks.map((d) => ({ label: d.label, count: d.articles.length })),
    total: desks.reduce((n, d) => n + d.articles.length, 0),
    market: market ? { name: market.name, changePct: market.changePct } : null,
  };
}

function Market({ market }: { market: Issue["market"] }) {
  if (!market) return null;
  const up = market.changePct >= 0;
  return (
    <span className="font-mono text-[11px] text-ink-soft">
      {market.name}{" "}
      <span className={up ? "text-up" : "text-down"}>
        {up ? "▲" : "▼"} {Math.abs(market.changePct).toFixed(2)}%
      </span>
    </span>
  );
}

export default async function ArchivePage() {
  const available = archiveAvailable();
  const readerHash = (await cookies()).get(EDITION_COOKIE)?.value ?? null;
  const dates = available
    ? await archiveDates().catch((err) => {
        console.error("[archive] listing dates failed:", err);
        return [] as string[];
      })
    : [];

  const issues = await Promise.all(
    dates.slice(0, SHOWN).map(async (date) => {
      const [found, snapshot] = await Promise.all([
        archivedEdition(date, readerHash).catch(() => null),
        readSnapshot(date).catch(() => null),
      ]);
      return toIssue(date, found?.edition ?? null, snapshot);
    }),
  );
  const [latest] = issues;
  const byDate = new Map(issues.map((i) => [i.date, i]));
  const today = editionDate();

  // Every month from today back to the oldest filed edition, newest first.
  const months: Array<{ year: number; month: number }> = [];
  if (dates.length > 0) {
    const oldest = dates[Math.min(dates.length, SHOWN) - 1];
    let y = Number(today.slice(0, 4));
    let m = Number(today.slice(5, 7));
    const oy = Number(oldest.slice(0, 4));
    const om = Number(oldest.slice(5, 7));
    while (y > oy || (y === oy && m >= om)) {
      months.push({ year: y, month: m });
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
  }

  return (
    <>
      <TopBar sections={[]} isArchive alwaysShowLogo />
      <main className="flex-1 max-w-[1240px] mx-auto px-4 sm:px-6 pt-10 pb-28 w-full">
        <Link href="/" className="chip mb-10">
          <span aria-hidden="true">←</span> Back to today&rsquo;s edition
        </Link>

        <header data-reveal="fade">
          <h1 className="font-display font-extrabold text-[clamp(3.4rem,13vw,9rem)] leading-[0.82]">
            <RisingWords text="Back issues" />
          </h1>
          <div className="mt-5 h-[3px] rule-draw bg-accent" />
          <div className="flex flex-wrap items-baseline justify-between gap-4 mt-6">
            <p className="font-headline italic text-ink-soft text-xl max-w-[52ch]">
              Every edition as it was printed that morning, filed away for good. Pick a day.
            </p>
            {dates.length > 0 && (
              <span className="font-mono text-[11px] text-ink-soft">
                {dates.length} EDITION{dates.length === 1 ? "" : "S"} FILED
              </span>
            )}
          </div>
        </header>

        {!available ? (
          <p className="font-body text-[15px] text-ink-soft leading-relaxed max-w-xl mt-14">
            The archive needs a place to keep editions between visits. Add the free Upstash Redis integration to
            this project on Vercel (Storage → Upstash for Redis) and every morning&rsquo;s edition is filed here
            automatically.
          </p>
        ) : !latest ? (
          <p className="font-headline italic text-xl text-ink-soft mt-14">
            Nothing filed yet. The first edition lands here tomorrow morning.
          </p>
        ) : (
          <>
            <LatestIssue issue={latest} />
            {months.map(({ year, month }) => (
              <CalendarMonth key={`${year}-${month}`} year={year} month={month} byDate={byDate} today={today} />
            ))}
          </>
        )}
      </main>

      {/* Always a way home, however far down the calendar the reader is. */}
      <Link
        href="/"
        className="fixed bottom-5 right-5 z-40 chip chip-signal h-11 px-5 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.5)]"
      >
        Today&rsquo;s paper <span aria-hidden="true">→</span>
      </Link>
    </>
  );
}

function LatestIssue({ issue }: { issue: Issue }) {
  return (
    <Link
      href={`/archive/${issue.date}`}
      className="group block mt-12 rounded-3xl border hairline p-6 sm:p-9 transition-colors hover:border-[color:var(--accent)]"
      data-reveal
    >
      <div className="grid md:grid-cols-[auto_minmax(0,1fr)] gap-x-10 gap-y-5">
        <div>
          <div className="font-label text-[10px] text-accent">Latest edition</div>
          <div className="font-display font-extrabold text-[6rem] leading-[0.78] mt-3">
            {fmt(issue.date, { day: "2-digit" })}
          </div>
          <div className="font-display font-bold text-[1.4rem] leading-none mt-2 text-ink-soft">
            {fmt(issue.date, { weekday: "long" })}
            <br />
            {fmt(issue.date, { month: "long", year: "numeric" })}
          </div>
        </div>
        <div className="min-w-0 md:border-l hairline md:pl-10">
          {issue.lead && (
            <>
              <div className="font-label text-[10px] text-ink-soft">{issue.lead.section}</div>
              <p className="font-headline text-[clamp(1.6rem,3.2vw,2.5rem)] leading-[1.08] mt-2 text-balance">
                <span className="headline-link">{issue.lead.title}</span>
              </p>
            </>
          )}
          {issue.more.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {issue.more.map((t) => (
                <li key={t} className="font-headline text-[16px] leading-snug text-ink-soft">
                  {t}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-5">
            {issue.desks.map((d) => (
              <span key={d.label} className="rounded-full border hairline px-3 py-1 font-sans text-[12px]">
                {d.label} <span className="font-mono text-ink-soft">{d.count}</span>
              </span>
            ))}
            <span className="ml-auto">
              <Market market={issue.market} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One month as a calendar: filed days are tiles you can open. */
function CalendarMonth({
  year,
  month,
  byDate,
  today,
}: {
  year: number;
  month: number;
  byDate: Map<string, Issue>;
  today: string;
}) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysIn = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const iso = (d: number) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const filed = Array.from({ length: daysIn }, (_, i) => byDate.has(iso(i + 1))).filter(Boolean).length;

  return (
    <section className="mt-16" data-reveal>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="font-display font-bold text-[2.4rem] leading-none">
          {first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
        </h2>
        <span className="font-mono text-[11px] text-ink-soft">
          {filed} OF {daysIn} DAYS
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEKDAYS.map((d) => (
          <div key={d} className="font-label text-[9px] text-ink-soft text-center pb-1">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysIn }, (_, i) => i + 1).map((day) => {
          const date = iso(day);
          const issue = byDate.get(date);
          const isToday = date === today;
          const future = date > today;
          if (!issue) {
            return (
              <div
                key={date}
                className={`aspect-square sm:aspect-auto sm:min-h-[7.5rem] rounded-xl border border-dashed hairline p-2 sm:p-3 ${
                  future ? "opacity-30" : "opacity-60"
                }`}
              >
                <span className={`font-display font-bold text-[1.3rem] sm:text-[1.6rem] leading-none ${isToday ? "text-accent" : "text-ink-faint"}`}>
                  {day}
                </span>
              </div>
            );
          }
          const up = issue.market ? issue.market.changePct >= 0 : null;
          return (
            <Link
              key={date}
              href={`/archive/${date}`}
              title={issue.lead?.title}
              className={`group aspect-square sm:aspect-auto sm:min-h-[7.5rem] rounded-xl border p-2 sm:p-3 flex flex-col transition-all duration-300 hover:-translate-y-0.5 hover:bg-accent hover:border-accent ${
                isToday ? "border-accent" : "hairline bg-card-bg"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="font-display font-extrabold text-[1.3rem] sm:text-[1.6rem] leading-none group-hover:text-accent-ink">
                  {day}
                </span>
                {up !== null && (
                  <span className={`w-1.5 h-1.5 rounded-full ${up ? "bg-up" : "bg-down"}`} aria-label={up ? "Market up" : "Market down"} />
                )}
              </span>
              {issue.lead && (
                <span className="hidden sm:block font-headline text-[12px] leading-snug mt-2 line-clamp-3 text-ink-soft group-hover:text-accent-ink">
                  {issue.lead.title}
                </span>
              )}
              <span className="hidden sm:block mt-auto pt-1 font-mono text-[9px] text-ink-faint group-hover:text-accent-ink">
                {issue.total} STORIES
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
