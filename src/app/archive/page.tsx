import Link from "next/link";
import MorgueClient from "@/components/archive/MorgueClient";
import TopBar from "@/components/chrome/TopBar";
import { RisingWords } from "@/components/story/SectionHeader";
import { archiveAvailable, archiveDates } from "@/lib/server/editions";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Archive — The Daily Index" };

// Dates are stored as YYYY-MM-DD in the edition's time zone; noon UTC keeps
// the label on the right calendar day wherever the page renders.
function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

export default async function ArchivePage() {
  const available = archiveAvailable();
  const dates = available
    ? await archiveDates().catch((err) => {
        console.error("[archive] listing dates failed:", err);
        return [] as string[];
      })
    : [];

  const byMonth = new Map<string, string[]>();
  for (const d of dates) {
    const month = fmt(d, { month: "long", year: "numeric" });
    byMonth.set(month, [...(byMonth.get(month) ?? []), d]);
  }

  return (
    <>
      <TopBar sections={[]} isArchive alwaysShowLogo />
      <main className="flex-1 max-w-[1240px] mx-auto px-4 sm:px-6 pt-14 pb-20 w-full">
        <header data-reveal="fade" style={{ ["--section-hue" as string]: "var(--accent)" }}>
          <div className="font-mono text-[11px] text-ink-soft mb-3 flex items-center gap-3">
            <span>{dates.length} EDITIONS FILED</span>
            <span className="h-px w-6 bg-rule" />
            <Link href="/" className="link-slide text-ink">
              ← Today&rsquo;s edition
            </Link>
          </div>
          <h1 className="font-display font-extrabold text-[clamp(3.4rem,13vw,9rem)] leading-[0.82]">
            <RisingWords text="The Archive" />
          </h1>
          <div className="mt-5 h-[3px] rule-draw bg-accent" />
          <p className="font-headline italic text-ink-soft text-xl mt-6 max-w-[52ch]">
            The paper as it was printed each morning: the stories, and the numbers that day.
          </p>
        </header>

        <section className="mt-14">
          {!available ? (
            <p className="font-body text-[15px] text-ink-soft leading-relaxed max-w-xl">
              The archive needs a place to keep editions between visits. Add the free Upstash Redis
              integration to this project on Vercel (Storage → Upstash for Redis) and every
              morning&rsquo;s edition is filed here automatically.
            </p>
          ) : dates.length === 0 ? (
            <p className="font-headline italic text-lg text-ink-soft">
              Nothing filed yet. The first edition lands here tomorrow morning.
            </p>
          ) : (
            <div className="space-y-12">
              {[...byMonth.entries()].map(([month, days]) => (
                <div key={month} data-reveal>
                  <h2 className="font-display font-bold text-[2.2rem] leading-none mb-5">{month}</h2>
                  <ul className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2.5">
                    {days.map((d) => (
                      <li key={d}>
                        <Link
                          href={`/archive/${d}`}
                          className="group block rounded-xl border hairline px-3.5 py-3 transition-all duration-300 hover:bg-accent hover:border-accent hover:-translate-y-0.5"
                        >
                          <span className="block font-label text-[9px] text-ink-soft group-hover:text-accent-ink">
                            {fmt(d, { weekday: "short" })}
                          </span>
                          <span className="block font-display font-extrabold text-[2.4rem] leading-[0.85] mt-1 group-hover:text-accent-ink">
                            {fmt(d, { day: "2-digit" })}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-24" data-reveal>
          <h2 className="font-display font-extrabold text-[clamp(2.6rem,8vw,5rem)] leading-[0.85]">The Morgue</h2>
          <p className="font-headline italic text-ink-soft text-lg mt-3 mb-6">
            Your own reading: which editions you opened and where you lingered. Kept on this device only.
          </p>
          <MorgueClient />
        </section>
      </main>
    </>
  );
}
