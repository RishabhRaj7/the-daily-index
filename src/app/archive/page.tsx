import Link from "next/link";
import MorgueClient from "@/components/archive/MorgueClient";

export const metadata = { title: "The Morgue — The Daily Index" };

export default function ArchivePage() {
  return (
    <main className="flex-1 max-w-5xl mx-auto px-4 py-10 w-full">
      <div className="font-label text-xs text-masthead-red mb-1">The Morgue</div>
      <h1 className="font-headline text-4xl md:text-5xl font-semibold mb-1">Your back issues</h1>
      <p className="font-headline italic text-ink-soft mb-4 text-lg">
        Every edition you opened, what led it, and where you lingered. Filed on this device only.
      </p>
      <Link href="/" className="font-label text-[11px] text-masthead-red underline">
        ← Back to today&rsquo;s edition
      </Link>
      <MorgueClient />
    </main>
  );
}
