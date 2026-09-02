import Link from "next/link";

export const metadata = { title: "Archive — The Daily Index" };

export default function ArchivePage() {
  return (
    <main className="flex-1 max-w-3xl mx-auto px-4 py-10">
      <div className="font-label text-xs text-masthead-red mb-1">
        The Morgue
      </div>
      <h1 className="font-headline text-4xl font-semibold mb-1">Archive</h1>
      <p className="text-ink-soft italic mb-6">
        Past editions, browsable like flipping through old newsprint.
      </p>
      <Link href="/" className="text-sm underline">
        ← Back to today&rsquo;s edition
      </Link>

      <div className="mt-10 border hairline rounded-sm p-8 text-center bg-card-bg">
        <div className="font-label text-[11px] text-ink-soft inline-block border hairline rounded-sm px-3 py-1 mb-4">
          Under construction
        </div>
        <p className="text-ink-soft leading-relaxed max-w-sm mx-auto">
          Past editions will be saved here once the infrastructure to persist
          them is in place. For now, only today&rsquo;s live edition is available.
        </p>
      </div>
    </main>
  );
}
