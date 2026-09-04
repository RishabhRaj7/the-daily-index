"use client";

import Link from "next/link";
import type { IssueRecord, ReaderProfile } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";

// "From the Editor's Desk" — a standing front-page box in the right-hand
// column: the morning note, then a compact ledger of the reader's habit.
// Everything here is local to the browser.

function formatShort(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function Stat({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string | number;
  unit?: string;
  note?: string | null;
}) {
  return (
    <div className="py-2.5 border-b hairline last:border-b-0">
      <dt className="font-label text-[9px] text-ink-soft leading-none mb-1.5">{label}</dt>
      <dd className="font-mono text-[22px] leading-none tabular-nums">
        {value}
        {unit && <span className="font-body text-xs text-ink-soft ml-1.5">{unit}</span>}
      </dd>
      {note && <dd className="font-mono text-[10px] text-ink-soft mt-1 truncate">{note}</dd>}
    </div>
  );
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
    <aside aria-label="From the Editor's Desk" className="col-rule min-w-0 md:pt-1">
      <div className="paper-box paper-box-tight">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="font-label text-[10px] text-masthead-red leading-none">
            From the Editor&rsquo;s Desk
          </h2>
          <span className="font-mono text-[9px] text-ink-soft leading-none shrink-0">
            {noteSource === "ai" ? "written this morning" : "standing type"}
          </span>
        </div>
        <p className="font-headline italic text-[17px] leading-[1.45] text-ink">{note}</p>
        {isSunday && profile.totalIssues >= 3 && (
          <p className="font-body text-[13px] text-ink-soft mt-3 leading-snug">
            It&rsquo;s Sunday —{" "}
            <Link href="/archive#week" className="text-masthead-red underline underline-offset-2">
              your week in review
            </Link>{" "}
            is ready in the Morgue.
          </p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 md:grid-cols-1 gap-x-4">
        <Stat
          label="Streak"
          value={profile.streak}
          unit={profile.streak === 1 ? "day" : "days"}
          note={profile.longestStreak > profile.streak ? `best ${profile.longestStreak}` : null}
        />
        <Stat
          label="Issues opened"
          value={profile.totalIssues}
          note={profile.firstOpened ? `since ${formatShort(profile.firstOpened.slice(0, 10))}` : null}
        />
        <div className="py-2.5 border-b hairline md:last:border-b-0">
          <dt className="font-label text-[9px] text-ink-soft leading-none mb-1.5">Most read</dt>
          <dd className="font-headline text-[15px] leading-tight">{fav ?? "—"}</dd>
          {profile.favouriteSource && (
            <dd className="font-mono text-[10px] text-ink-soft mt-1 truncate">via {profile.favouriteSource}</dd>
          )}
        </div>
      </dl>

      {onThisDay.length > 0 && (
        <div className="mt-4 pt-3 border-t hairline">
          <div className="font-label text-[9px] text-ink-soft leading-none mb-2">Your front page, then</div>
          <ul className="space-y-2">
            {onThisDay.map(({ label, issue }) => (
              <li key={issue.isoDate}>
                <span className="font-mono text-[10px] text-ink-soft">
                  {label} · No. {issue.issue}
                </span>
                <p className="font-headline text-[13px] leading-snug">{issue.heroHeadline}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
