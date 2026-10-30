import TopBar from "@/components/chrome/TopBar";

// What shows the moment a link is followed, while the page is put together
// on the server (each route's loading.tsx): the top bar straight away and the
// page's shape in quiet blocks, so a click always answers at once.

const Block = ({ className = "" }: { className?: string }) => <div className={`rounded-xl bg-[var(--card-bg)] animate-pulse ${className}`} />;

export default function PageSkeleton({ kind, label }: { kind: "edition" | "live" | "archive"; label: string }) {
  return (
    <>
      <TopBar sections={[]} alwaysShowLogo />
      <main className="page-skeleton flex-1 page-scale page-wrap px-4 sm:px-6 pt-10 pb-28 w-full" aria-busy="true" aria-label={label}>
        <p className="font-label text-[10px] text-ink-faint mb-6">{label}</p>
        {kind === "edition" && (
          <>
            <Block className="h-24 sm:h-36 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 mt-8">
              <Block className="h-72" />
              <div className="space-y-4">
                <Block className="h-20" />
                <Block className="h-20" />
                <Block className="h-20" />
              </div>
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
    </>
  );
}
