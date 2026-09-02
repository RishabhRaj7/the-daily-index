"use client";

export default function SummaryBanner({
  state,
  onApply,
}: {
  state: "loading" | "done";
  onApply: () => void;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-50">
      {state === "loading" ? (
        <div className="bg-ink text-paper px-4 py-2 rounded-full font-label text-[11px] shadow-lg flex items-center gap-2 opacity-80">
          <span className="animate-pulse">✦</span>
          <span>Summarising…</span>
        </div>
      ) : (
        <button
          onClick={onApply}
          className="bg-masthead-red text-paper px-4 py-2.5 rounded-full font-label text-[11px] shadow-lg flex items-center gap-2 hover:opacity-90 active:scale-95 transition-transform cursor-pointer"
        >
          <span>✦</span>
          <span>Summaries ready — tap to update</span>
        </button>
      )}
    </div>
  );
}
