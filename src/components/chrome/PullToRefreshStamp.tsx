"use client";

import { useState } from "react";
import { clearSummaryCaches, requestForcedSummarize } from "@/lib/summary-cache";
import { clearDigestCache, markEditionRefresh } from "@/lib/digest-cache";
import { clearWeatherCache } from "@/lib/live/weather";
import { clearF1ClientCache } from "@/lib/f1-cache";

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
    clearDigestCache();
    clearWeatherCache();
    clearF1ClientCache();
    requestForcedSummarize();
    // Tell the next mount's prep overlay this is a deliberate re-print, so it
    // covers the page with "Printing a fresh edition…" while the whole
    // pipeline (RSS → collate → AI summary) runs from scratch.
    markEditionRefresh();
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
      className="chip group"
      title="Clear every cache and print a fresh edition"
    >
      <svg
        viewBox="0 0 16 16"
        className={`w-3.5 h-3.5 transition-transform duration-500 group-hover:rotate-180 ${refreshing ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
        <path d="M13.8 2.2v2.9h-2.9" />
      </svg>
      {refreshing ? "Printing…" : "Refresh"}
    </button>
  );
}
