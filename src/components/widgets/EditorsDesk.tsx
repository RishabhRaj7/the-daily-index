"use client";

import Link from "next/link";
import type { IssueRecord, ReaderProfile } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";

// "From the Editor's Desk" — a short note that proves the paper remembers
// you, plus a small ledger of your reading habit. All data is local.

function formatShort(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function EditorsDesk({
  note,
  noteSource,
  profile,
  onThisDay,
  isSunday,
}: {
  note: string;
  noteSource: "ai" | "desk";
  profile: ReaderProfile;
  onThisDay: Array<{ label: string; issue: IssueRecord }>;
  isSunday: boolean;
}) {
  const fav = profile.favouriteSection ? SECTION_META[profile.favouriteSection].kicker : null;

  return (
    <aside
      aria-label="From the Editor's Desk"
      className="my-10 border-y-2 border-ink py-5 grid md:grid-cols-[1fr_260px] gap-8"
    >
      <div>
        <div className="flex items-baseline gap-3 mb-2">
          <h2 className="font-label text-[11px] text-masthead-red">From the Editor&rsquo;s Desk</h2>
          <span className="font-mono text-[10px] text-ink-soft">
            {noteSource === "ai" ? "written this morning" : "set in standing type"}
          </span>
        </div>
        <p className="font-headline italic text-lg md:text-xl leading-relaxed text-ink">{note}</p>
        {isSunday && profile.totalIssues >= 3 && (
          <p className="font-body text-sm text-ink-soft mt-3">
            It&rsquo;s Sunday —{" "}
            <Link href="/archive#week" className="text-masthead-red underline underline-offset-2">
              your week in review
            </Link>{" "}
            is ready in the Morgue.
          </p>
        )}
      </div>

      <dl className="md:border-l hairline md:pl-6 grid grid-cols-3 md:grid-cols-1 gap-x-4 gap-y-3 content-start">
        <div>
          <dt className="font-label text-[9px] text-ink-soft">Streak</dt>
          <dd className="font-mono text-2xl leading-none mt-1 tabular-nums">
            {profile.streak}
            <span className="font-body text-xs text-ink-soft ml-1">
              {profile.streak === 1 ? "day" : "days"}
            </span>
          </dd>
          {profile.longestStreak > profile.streak && (
            <dd className="font-mono text-[10px] text-ink-soft mt-0.5">best {profile.longestStreak}</dd>
          )}
        </div>
        <div>
          <dt className="font-label text-[9px] text-ink-soft">Issues opened</dt>
          <dd className="font-mono text-2xl leading-none mt-1 tabular-nums">{profile.totalIssues}</dd>
          {profile.firstOpened && (
            <dd className="font-mono text-[10px] text-ink-soft mt-0.5">
              since {formatShort(profile.firstOpened.slice(0, 10))}
            </dd>
          )}
        </div>
        <div>
          <dt className="font-label text-[9px] text-ink-soft">Most read</dt>
          <dd className="font-headline text-base leading-tight mt-1">{fav ?? "—"}</dd>
          {profile.favouriteSource && (
            <dd className="font-mono text-[10px] text-ink-soft mt-0.5 truncate">via {profile.favouriteSource}</dd>
          )}
        </div>

        {onThisDay.length > 0 && (
          <div className="col-span-3 md:col-span-1 border-t hairline pt-3 mt-1">
            <dt className="font-label text-[9px] text-ink-soft mb-1.5">Your front page, then</dt>
            {onThisDay.map(({ label, issue }) => (
              <dd key={issue.isoDate} className="mb-2 last:mb-0">
                <span className="font-mono text-[10px] text-ink-soft">
                  {label} · No. {issue.issue}
                </span>
                <p className="font-headline text-[13px] leading-snug">{issue.heroHeadline}</p>
              </dd>
            ))}
          </div>
        )}
      </dl>
    </aside>
  );
}
