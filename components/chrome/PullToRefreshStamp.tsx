"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function PullToRefreshStamp() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={isPending}
      className="font-label text-xs px-3 py-1.5 border hairline rounded-sm hover:bg-card-bg transition-colors flex items-center gap-2 disabled:opacity-60"
    >
      {isPending ? (
        <>
          <svg
            className="animate-spin w-3 h-3 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
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
          Refreshing…
        </>
      ) : (
        "Refresh edition"
      )}
    </button>
  );
}
