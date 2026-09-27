import Link from "next/link";
import MorgueClient from "@/components/archive/MorgueClient";
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
    <main className="flex-1 max-w-5xl mx-auto px-4 py-10 w-full">
      <div className="font-label text-xs text-masthead-red mb-1">The Archive</div>
      <h1 className="font-headline text-4xl md:text-5xl font-semibold mb-1">Every edition, filed daily</h1>
      <p className="font-headline italic text-ink-soft mb-4 text-lg">
        The paper as it was printed each morning — the stories, and the numbers that day.
      </p>
      <Link href="/" className="font-label text-[11px] text-masthead-red underline">
        ← Back to today&rsquo;s edition
      </Link>

      <section className="mt-8">
        <div className="h-[3px] bg-masthead-red mb-2" />
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-label text-sm">Back issues</h2>
          <div className="h-px flex-1 bg-rule" />
          <span className="font-mono text-[10px] text-ink-soft">{dates.length} filed</span>
        </div>

        {!available ? (
          <p className="font-body text-sm text-ink-soft leading-relaxed max-w-xl">
            The archive needs a place to keep editions between visits. Add the free Upstash Redis
            integration to this project on Vercel (Storage → Upstash for Redis) and every
            morning&rsquo;s edition is filed here automatically.
          </p>
        ) : dates.length === 0 ? (
          <p className="font-body italic text-sm text-ink-soft">
            Nothing filed yet — the first edition lands here tomorrow morning.
          </p>
        ) : (
          <div className="space-y-6">
            {[...byMonth.entries()].map(([month, days]) => (
              <div key={month}>
                <h3 className="font-headline text-xl font-semibold mb-2">{month}</h3>
                <ul className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                  {days.map((d) => (
                    <li key={d} className="border hairline">
                      <Link href={`/archive/${d}`} className="block px-3 py-2 hover:bg-card-bg transition-colors">
                        <span className="block font-label text-[9px] text-ink-soft">
                          {fmt(d, { weekday: "short" })}
                        </span>
                        <span className="block font-mono text-lg tabular-nums leading-tight">
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

      <section className="mt-12">
        <div className="font-label text-xs text-masthead-red mb-1">The Morgue</div>
        <p className="font-headline italic text-ink-soft text-base">
          Your own reading — which editions you opened and where you lingered. Kept on this device only.
        </p>
        <MorgueClient />
      </section>
    </main>
  );
}
