"use client";

import type { WireBrief } from "@/lib/types";
import LiveBadge from "./LiveBadge";

function metaLine(b: WireBrief): string {
  const parts: string[] = [];
  if (typeof b.points === "number") parts.push(`${b.points} pts`);
  if (typeof b.comments === "number") parts.push(`${b.comments} comments`);
  if (b.postedAgo) parts.push(b.postedAgo);
  return parts.join(" · ");
}

export default function WireBriefsList({
  briefs,
  title = "From the Wire",
}: {
  briefs: WireBrief[];
  title?: string;
}) {
  return (
    <div className="border hairline rounded-sm p-4 bg-card-bg">
      <div className="flex items-center justify-between mb-2">
        <div className="font-label text-[10px] text-ink-soft">{title}</div>
        <LiveBadge />
      </div>
      <ul className="divide-y hairline">
        {briefs.map((b) => (
          <li key={b.id} className="flex gap-2 py-2.5 first:pt-0 last:pb-0">
            {b.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.image}
                alt=""
                width={48}
                height={48}
                className="w-12 h-12 object-cover rounded-sm shrink-0 border hairline"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug">{b.title}</div>
              {b.summary && (
                <p className="text-xs text-ink-soft mt-0.5 leading-snug">
                  {b.summary}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="font-mono text-[10px] text-ink-soft truncate">
                  {[b.domain, metaLine(b)].filter(Boolean).join(" · ")}
                </span>
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-label text-[10px] text-masthead-red hover:underline shrink-0"
                >
                  Read ↗
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
