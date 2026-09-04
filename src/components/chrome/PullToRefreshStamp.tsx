"use client";

import { useState } from "react";
import { clearSummaryCaches, requestForcedSummarize } from "@/lib/summary-cache";

// "Refresh edition" — purges the server-side caches via /api/refresh and then
// does a full page reload, so every section (news, sports, markets, Reddit,
// weather, AI summaries, Editor's Picks) is fetched and rendered from scratch.
// The old `router.refresh()` only re-ran the server component against warm
// fetch caches, which is why the button appeared to do nothing.
//
// The AI summaries live in sessionStorage, which survives a reload (and is
// untouched by the browser's "disable cache" switch). If we left them in
// place, EditionView would see a cache hit for today and never call
// /api/summarize for the freshly printed edition — so we purge them here and
// leave a one-shot flag asking the next mount to summarise from scratch.
export default function PullToRefreshStamp() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    clearSummaryCaches();
    requestForcedSummarize();
    try {
      await Promise.race([
        fetch("/api/refresh", { method: "POST" }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("refresh timeout")), 8000),
        ),
      ]);
    } catch {
      // Even if the purge call fails, a plain reload still re-renders the
      // edition and refetches everything reachable — never leave the reader
      // staring at a stuck spinner.
    }
    window.location.reload();
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      className="font-label text-xs px-3 py-1.5 border hairline rounded-sm hover:bg-card-bg transition-colors flex items-center gap-2 disabled:opacity-60"
    >
      {refreshing ? (
        <>
          <svg
            className="animate-spin w-3 h-3 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          Printing a fresh edition…
        </>
      ) : (
        "Refresh edition"
      )}
    </button>
  );
}
