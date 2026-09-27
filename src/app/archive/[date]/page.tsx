import Link from "next/link";
import TopBar from "@/components/chrome/TopBar";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { archiveDates, archivedEdition, readSnapshot } from "@/lib/server/editions";
import { isEditionDate, EDITION_TIME_ZONE } from "@/lib/edition-date";
import { EDITION_COOKIE } from "@/lib/edition-client";

export const dynamic = "force-dynamic";

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return {
    title: isEditionDate(date)
      ? `${fmt(date, { day: "numeric", month: "long", year: "numeric" })} — The Daily Index`
      : "The Archive — The Daily Index",
  };
}

export default async function ArchivedEditionPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isEditionDate(date)) notFound();

  const readerHash = (await cookies()).get(EDITION_COOKIE)?.value ?? null;
  const [found, snapshot, dates] = await Promise.all([
    archivedEdition(date, readerHash).catch(() => null),
    readSnapshot(date).catch(() => null),
    archiveDates().catch(() => [] as string[]),
  ]);
  if (!found) notFound();

  const { edition, isReaders } = found;
  const { digest } = edition;
  // Dates are newest-first: the older neighbour sits after this one.
  const idx = dates.indexOf(date);
  const newer = idx > 0 ? dates[idx - 1] : null;
  const older = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

  const layout =
    edition.layout ??
    Object.keys(digest.sections).map((id, i) => ({ id, label: id, order: i, type: "topic" as const }));
  const printedAt = new Date(edition.builtAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EDITION_TIME_ZONE,
  });

  return (
    <>
    <TopBar sections={[]} isArchive alwaysShowLogo />
    <main className="flex-1 max-w-[1240px] mx-auto px-4 sm:px-6 pt-10 pb-20 w-full">
      <nav className="flex items-center justify-between gap-4 font-sans text-[13px] font-semibold mb-8">
        <span className="flex flex-wrap gap-2">
          <Link href="/" className="chip chip-signal">
            ← Today&rsquo;s paper
          </Link>
          <Link href="/archive" className="chip">
            All back issues
          </Link>
        </span>
        <span className="flex gap-4">
          {older && (
            <Link href={`/archive/${older}`} className="chip">
              ‹ {fmt(older, { day: "numeric", month: "short" })}
            </Link>
          )}
          {newer && (
            <Link href={`/archive/${newer}`} className="chip">
              {fmt(newer, { day: "numeric", month: "short" })} ›
            </Link>
          )}
        </span>
      </nav>

      <header className="pb-6 mb-12 border-b hairline" data-reveal="fade">
        <div className="font-label text-[11px] text-accent mb-3">From the archive</div>
        <h1 className="font-display font-extrabold text-[clamp(3rem,10vw,7rem)] leading-[0.84]">
          {fmt(date, { weekday: "long" })}
          <br />
          <span className="text-ink-soft">{fmt(date, { day: "numeric", month: "long", year: "numeric" })}</span>
        </h1>
        <p className="font-mono text-[11px] text-ink-soft mt-5">
          {isReaders ? "Your edition" : "The standard edition — none was printed for your preferences that day"}
          {" · "}printed {printedAt} · {digest.corpusSize} articles considered
          {digest.engine === "heuristic" ? " · assembled without the AI editor" : ""}
        </p>
      </header>

      <div className="grid md:grid-cols-[minmax(0,1fr)_300px] gap-12">
        <div className="space-y-16 min-w-0">
          {digest.atAGlance && digest.atAGlance.length > 0 && (
            <section>
              <h2 className="font-display font-extrabold text-[2.4rem] leading-none mb-4">At a glance</h2>
              <ol className="divide-y hairline border-y hairline">
                {digest.atAGlance.map((g, i) => (
                  <li key={g.url} className="py-2 grid grid-cols-[1.5rem_1fr] gap-2">
                    <span className="font-mono text-xs text-ink-soft tabular-nums">{i + 1}</span>
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group font-headline text-[1.05rem] leading-snug"
                    >
                      <span className="headline-link">{g.summary}</span>
                      <span className="font-mono text-[10px] text-ink-soft ml-2">{g.pool}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {layout.map((section) => {
            const articles = digest.sections[section.id] ?? [];
            if (articles.length === 0) return null;
            return (
              <section key={section.id}>
                <h2 className="font-display font-extrabold text-[clamp(2.4rem,6vw,3.6rem)] leading-[0.85]">{section.label}</h2>
                <div className="h-[3px] bg-accent mt-3 mb-6" />
                <div className="space-y-7">
                  {articles.map((a) => (
                    <article key={a.url}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group font-headline text-[1.4rem] leading-snug"
                      >
                        <span className="headline-link">{a.title}</span>
                      </a>
                      <p className="font-mono text-[10px] text-ink-soft mt-1">
                        {a.source}
                        {a.group && a.group !== "f1" ? ` · ${a.group}` : ""}
                        {a.matchedEntity ? ` · for you: ${a.matchedEntity}` : ""}
                      </p>
                      <p className="font-body text-[15px] leading-relaxed mt-1.5">{a.summary}</p>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {snapshot && (
          <aside className="space-y-5 h-fit md:sticky md:top-24">
            {snapshot.markets.length > 0 && (
              <div className="module">
                <h2 className="font-label text-[10px] text-ink-soft mb-3">Markets that day</h2>
                <table className="w-full font-mono text-xs">
                  <tbody className="divide-y hairline">
                    {snapshot.markets.map((m) => (
                      <tr key={m.name}>
                        <td className="py-1 pr-2">{m.name}</td>
                        <td className="py-1 text-right tabular-nums">
                          {m.level.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </td>
                        <td
                          className={`py-1 pl-2 text-right tabular-nums ${m.changePct >= 0 ? "text-up" : "text-down"}`}
                        >
                          {m.changePct >= 0 ? "+" : ""}
                          {m.changePct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {snapshot.f1.lastRace && snapshot.f1.lastRace.podium.length > 0 && (
              <div className="module">
                <h2 className="font-label text-[10px] text-ink-soft mb-2">Latest race</h2>
                <p className="font-headline text-sm mb-2">{snapshot.f1.lastRace.name}</p>
                <ol className="font-mono text-xs space-y-0.5">
                  {snapshot.f1.lastRace.podium.map((p) => (
                    <li key={p.position}>
                      P{p.position} {p.driver} <span className="text-ink-soft">{p.team}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {snapshot.f1.standings.length > 0 && (
              <div className="module">
                <h2 className="font-label text-[10px] text-ink-soft mb-3">Drivers&rsquo; championship</h2>
                <table className="w-full font-mono text-xs">
                  <tbody className="divide-y hairline">
                    {snapshot.f1.standings.map((s) => (
                      <tr key={s.position}>
                        <td className="py-1 pr-2 text-ink-soft tabular-nums">{s.position}</td>
                        <td className="py-1">{s.name}</td>
                        <td className="py-1 text-right tabular-nums">{s.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {snapshot.f1.nextRace && (
              <div className="module">
                <h2 className="font-label text-[10px] text-ink-soft mb-2">Next up</h2>
                <p className="font-headline text-sm">{snapshot.f1.nextRace.name}</p>
                <p className="font-mono text-[10px] text-ink-soft">
                  {new Date(snapshot.f1.nextRace.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    timeZone: EDITION_TIME_ZONE,
                  })}
                </p>
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
    </>
  );
}
