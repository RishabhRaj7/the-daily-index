import Link from "next/link";
import { cookies } from "next/headers";
import TopBar from "@/components/chrome/TopBar";
import { RisingWords } from "@/components/story/SectionHeader";
import { archiveAvailable, archiveDates, archivedEdition, readSnapshot } from "@/lib/server/editions";
import type { EditionRecord } from "@/lib/server/editions";
import type { EditionSnapshot } from "@/lib/server/snapshot";
import { EDITION_COOKIE } from "@/lib/edition-client";

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
  const [latest, ...rest] = issues;

  const byMonth = new Map<string, Issue[]>();
  for (const issue of rest) {
    const month = fmt(issue.date, { month: "long", year: "numeric" });
    byMonth.set(month, [...(byMonth.get(month) ?? []), issue]);
  }

  return (
    <>
      <TopBar sections={[]} isArchive alwaysShowLogo />
      <main className="flex-1 max-w-[1240px] mx-auto px-4 sm:px-6 pt-14 pb-24 w-full">
        <header data-reveal="fade">
          <h1 className="font-display font-extrabold text-[clamp(3.4rem,13vw,9rem)] leading-[0.82]">
            <RisingWords text="Back issues" />
          </h1>
          <div className="mt-5 h-[3px] rule-draw bg-accent" />
          <div className="flex flex-wrap items-baseline justify-between gap-4 mt-6">
            <p className="font-headline italic text-ink-soft text-xl max-w-[52ch]">
              Every edition as it was printed that morning, filed away for good.
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
            {/* The latest issue, set like a front page. */}
            <Link
              href={`/archive/${latest.date}`}
              className="group block mt-14 rounded-3xl border hairline p-6 sm:p-10 transition-colors hover:border-[color:var(--accent)]"
              data-reveal
            >
              <div className="grid md:grid-cols-[auto_minmax(0,1fr)] gap-x-10 gap-y-6">
                <div>
                  <div className="font-label text-[10px] text-accent">Latest edition</div>
                  <div className="font-display font-extrabold text-[7rem] leading-[0.78] mt-3">
                    {fmt(latest.date, { day: "2-digit" })}
                  </div>
                  <div className="font-display font-bold text-[1.6rem] leading-none mt-2 text-ink-soft">
                    {fmt(latest.date, { weekday: "long" })}
                    <br />
                    {fmt(latest.date, { month: "long", year: "numeric" })}
                  </div>
                </div>
                <div className="min-w-0 md:border-l hairline md:pl-10">
                  {latest.lead && (
                    <>
                      <div className="font-label text-[10px] text-ink-soft">{latest.lead.section}</div>
                      <p className="font-headline text-[clamp(1.8rem,3.6vw,2.8rem)] leading-[1.06] mt-2 text-balance">
                        <span className="headline-link">{latest.lead.title}</span>
                      </p>
                    </>
                  )}
                  {latest.more.length > 0 && (
                    <ul className="mt-5 space-y-2">
                      {latest.more.map((t) => (
                        <li key={t} className="font-headline text-[17px] leading-snug text-ink-soft">
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-6">
                    {latest.desks.map((d) => (
                      <span key={d.label} className="rounded-full border hairline px-3 py-1 font-sans text-[12px]">
                        {d.label} <span className="font-mono text-ink-soft">{d.count}</span>
                      </span>
                    ))}
                    <span className="ml-auto">
                      <Market market={latest.market} />
                    </span>
                  </div>
                </div>
              </div>
            </Link>

            {[...byMonth.entries()].map(([month, list]) => (
              <section key={month} className="mt-16">
                <h2 className="font-display font-bold text-[2.2rem] leading-none mb-2" data-reveal>
                  {month}
                </h2>
                <ol className="border-t hairline">
                  {list.map((issue, i) => (
                    <li key={issue.date} className="border-b hairline" data-reveal style={{ ["--reveal-i" as string]: i % 6 }}>
                      <Link
                        href={`/archive/${issue.date}`}
                        className="group grid grid-cols-[4.2rem_minmax(0,1fr)] sm:grid-cols-[5rem_minmax(0,1fr)_auto] gap-x-5 items-center py-5"
                      >
                        <span className="text-center">
                          <span className="block font-display font-extrabold text-[2.8rem] leading-[0.8] transition-colors group-hover:text-accent">
                            {fmt(issue.date, { day: "2-digit" })}
                          </span>
                          <span className="block font-label text-[9px] text-ink-soft mt-1">
                            {fmt(issue.date, { weekday: "short" })}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block font-headline text-[1.25rem] leading-snug truncate">
                            <span className="headline-link">{issue.lead?.title ?? "Edition"}</span>
                          </span>
                          <span className="block font-sans text-[12px] text-ink-soft mt-1 truncate">
                            {issue.total} stories · {issue.desks.map((d) => d.label).join(" · ")}
                          </span>
                        </span>
                        <span className="hidden sm:flex items-center gap-4">
                          <Market market={issue.market} />
                          <span className="text-ink-faint transition-transform group-hover:translate-x-1" aria-hidden="true">
                            →
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </main>
    </>
  );
}
