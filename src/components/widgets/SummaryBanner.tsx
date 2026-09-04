"use client";

export type SummaryBannerState = "loading" | "done" | "unchanged" | "failed";

export default function SummaryBanner({
  state,
  onApply,
  onRetry,
}: {
  state: SummaryBannerState;
  onApply: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-50" role="status" aria-live="polite">
      {state === "loading" && (
        <div className="bg-ink text-paper px-4 py-2 rounded-full font-label text-[11px] shadow-lg flex items-center gap-2 opacity-80">
          <span className="animate-pulse">✦</span>
          <span>Summarising…</span>
        </div>
      )}

      {state === "done" && (
        <button
          type="button"
          onClick={onApply}
          className="bg-masthead-red text-paper px-4 py-2.5 rounded-full font-label text-[11px] shadow-lg flex items-center gap-2 hover:opacity-90 active:scale-95 transition-transform cursor-pointer"
        >
          <span>✦</span>
          <span>Summaries ready — tap to update</span>
        </button>
      )}

      {state === "unchanged" && (
        <div className="bg-ink text-paper px-4 py-2 rounded-full font-label text-[11px] shadow-lg flex items-center gap-2 opacity-80">
          <span>✦</span>
          <span>Edition already up to date</span>
        </div>
      )}

      {state === "failed" && (
        <button
          type="button"
          onClick={onRetry}
          className="bg-ink text-paper px-4 py-2.5 rounded-full font-label text-[11px] shadow-lg flex items-center gap-2 hover:opacity-90 active:scale-95 transition-transform cursor-pointer"
        >
          <span>↻</span>
          <span>Summaries unavailable — tap to retry</span>
        </button>
      )}
    </div>
  );
}
