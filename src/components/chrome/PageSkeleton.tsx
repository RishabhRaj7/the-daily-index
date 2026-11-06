import SiteNav from "@/components/chrome/SiteNav";

// What shows the moment a link is followed, while the page is put together
// on the server (each route's loading.tsx): the menu straight away and the
// page's shape in quiet blocks, so a click always answers at once.
// The top bar and the page are zoomed together on big screens (one
// .page-scale wrapper, as on the front page), so their edges line up.

const Block = ({ className = "" }: { className?: string }) => <div className={`rounded-xl bg-[var(--card-bg)] animate-pulse ${className}`} />;

export default function PageSkeleton({ kind, label }: { kind: "edition" | "live" | "archive"; label: string }) {
  return (
    <>
      <div className="page-scale with-rail flex-1 flex flex-col w-full">
      <SiteNav />
      <main className="page-skeleton flex-1 page-wrap px-4 sm:px-6 pt-10 pb-28 w-full" aria-busy="true" aria-label={label}>
        <p className="font-label text-[11px] text-ink-faint mb-6">{label}</p>
        {kind === "edition" && (
          <>
            {/* The paper's shape: the slim wordmark, the numbers, the briefing beside the lead. */}
            <Block className="h-16 md:h-20 w-full" />
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Block className="h-14 md:h-20" />
              <Block className="h-14 md:h-20" />
              <Block className="h-14 md:h-20" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)] gap-6 mt-5">
              <div className="space-y-3">
                <Block className="h-14" />
                <Block className="h-14" />
                <Block className="h-14" />
                <Block className="h-14" />
              </div>
              <Block className="h-72" />
            </div>
          </>
        )}
        {kind === "live" && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-6">
            <Block className="h-[28rem]" />
            <Block className="h-[28rem]" />
          </div>
        )}
        {kind === "archive" && (
          <>
            <Block className="h-28 w-2/3" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
              {Array.from({ length: 8 }, (_, i) => (
                <Block key={i} className="h-24" />
              ))}
            </div>
          </>
        )}
      </main>
      </div>
    </>
  );
}
