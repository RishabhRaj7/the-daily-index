"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReaderMemory, SectionKey } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";
import {
  buildProfile,
  clearMemory,
  engagementsSince,
  lastSevenDays,
  loadMemory,
} from "@/lib/reader-memory";

// "The Morgue" is what newspapers call their archive. Ours is personal: it
// holds only the issues *you* opened, what led each one, and what you read.

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", opts);
}

function kicker(section: SectionKey) {
  return SECTION_META[section]?.kicker ?? section;
}

export default function MorgueClient() {
  const [memory, setMemory] = useState<ReaderMemory | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setMemory(loadMemory());
    const onMemory = () => setMemory(loadMemory());
    window.addEventListener("daily-index:memory", onMemory);
    return () => window.removeEventListener("daily-index:memory", onMemory);
  }, []);

  const profile = useMemo(() => (memory ? buildProfile(memory) : null), [memory]);
  const week = useMemo(() => (memory ? lastSevenDays(memory) : []), [memory]);
  const weekEngagements = useMemo(() => (memory ? engagementsSince(memory, 7) : []), [memory]);

  const weekSections = useMemo(() => {
    const counts = new Map<SectionKey, number>();
    for (const e of weekEngagements) counts.set(e.section, (counts.get(e.section) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [weekEngagements]);

  const issuesByMonth = useMemo(() => {
    if (!memory) return [] as Array<[string, ReaderMemory["issues"]]>;
    const groups = new Map<string, ReaderMemory["issues"]>();
    for (const i of [...memory.issues].reverse()) {
      const key = fmt(i.isoDate, { month: "long", year: "numeric" });
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    return [...groups.entries()];
  }, [memory]);

  if (!memory || !profile) {
    return <p className="font-body italic text-sm text-ink-soft mt-8">Opening the drawers…</p>;
  }

  if (memory.issues.length === 0) {
    return (
      <div className="mt-10 border-y-2 border-ink py-8">
        <p className="font-headline text-xl font-semibold">The drawers are empty.</p>
        <p className="font-body text-ink-soft mt-2 leading-relaxed max-w-lg">
          The Morgue fills up as you read. Every edition you open is filed here, along with what led
          the front page and the stories you unfolded — kept on this device only.
        </p>
        <Link href="/" className="font-label text-[11px] text-masthead-red underline mt-4 inline-block">
          Open today&rsquo;s edition →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-12">
      {/* Ledger strip */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 border-y-2 border-ink divide-x hairline">
        {[
          ["Issues opened", String(profile.totalIssues)],
          ["Current streak", `${profile.streak}d`],
          ["Longest streak", `${profile.longestStreak}d`],
          ["Stories unfolded", String(memory.engagements.length)],
        ].map(([l, v]) => (
          <div key={l} className="px-3 py-3 first:pl-0">
            <dt className="font-label text-[9px] text-ink-soft">{l}</dt>
            <dd className="font-mono text-2xl tabular-nums leading-none mt-1">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Weekly recap */}
      <section id="week">
        <div className="h-[3px] bg-masthead-red mb-2" />
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-label text-sm">The Week in Your Index</h2>
          <div className="h-px flex-1 bg-rule" />
          <span className="font-mono text-[10px] text-ink-soft">last 7 days</span>
        </div>
        {week.length === 0 ? (
          <p className="font-body italic text-sm text-ink-soft">No editions opened this week yet.</p>
        ) : (
          <div className="grid md:grid-cols-[1fr_240px] gap-8">
            <ol className="divide-y hairline">
              {[...week].reverse().map((i) => (
                <li key={i.isoDate} className="py-3 first:pt-0 grid grid-cols-[5.5rem_1fr] gap-3">
                  <div>
                    <div className="font-label text-[10px] text-ink-soft">
                      {fmt(i.isoDate, { weekday: "short" })}
                    </div>
                    <div className="font-mono text-xs">{fmt(i.isoDate, { day: "2-digit", month: "short" })}</div>
                  </div>
                  <div className="min-w-0">
                    <p className="font-headline text-base font-semibold leading-snug">
                      {i.heroHeadline || <span className="italic text-ink-soft font-normal">No lead recorded</span>}
                    </p>
                    <p className="font-mono text-[10px] text-ink-soft mt-1">
                      No. {i.issue} · led by {kicker(i.heroSection)}
                      {i.sectionsRead.length > 0 && ` · read ${i.sectionsRead.map(kicker).join(", ")}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <aside className="md:border-l hairline md:pl-6 space-y-4">
              <div>
                <div className="font-label text-[9px] text-ink-soft mb-1">Days opened</div>
                <div className="font-mono text-2xl tabular-nums">{week.length}<span className="text-sm text-ink-soft">/7</span></div>
              </div>
              <div>
                <div className="font-label text-[9px] text-ink-soft mb-1">Stories unfolded</div>
                <div className="font-mono text-2xl tabular-nums">{weekEngagements.length}</div>
              </div>
              {weekSections.length > 0 && (
                <div>
                  <div className="font-label text-[9px] text-ink-soft mb-1">Where you lingered</div>
                  <ul className="divide-y hairline">
                    {weekSections.map(([s, n]) => (
                      <li key={s} className="flex justify-between py-1">
                        <span className="font-headline text-sm">{kicker(s)}</span>
                        <span className="font-mono text-xs tabular-nums text-ink-soft">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {weekEngagements.length > 0 && (
                <div>
                  <div className="font-label text-[9px] text-ink-soft mb-1">Last thing you read</div>
                  <p className="font-headline text-sm leading-snug">
                    {weekEngagements[weekEngagements.length - 1].headline}
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </section>

      {/* Back issues */}
      <section>
        <div className="h-[3px] bg-masthead-red mb-2" />
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-label text-sm">Back Issues</h2>
          <div className="h-px flex-1 bg-rule" />
        </div>
        {issuesByMonth.map(([month, issues]) => (
          <div key={month} className="mb-6">
            <h3 className="font-label text-[10px] text-masthead-red mb-2">{month}</h3>
            <ul className="divide-y hairline">
              {issues.map((i) => (
                <li key={i.isoDate} className="py-2 grid grid-cols-[4.5rem_1fr] gap-3 items-baseline">
                  <span className="font-mono text-xs text-ink-soft">{fmt(i.isoDate, { day: "2-digit", month: "short" })}</span>
                  <span className="font-headline text-[15px] leading-snug">
                    {i.heroHeadline || <span className="italic text-ink-soft">—</span>}
                    <span className="font-mono text-[10px] text-ink-soft ml-2">No. {i.issue}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Privacy */}
      <section className="border-t hairline pt-4">
        <p className="font-body text-xs text-ink-soft leading-relaxed max-w-xl">
          Everything on this page lives in your browser&rsquo;s local storage. It is never uploaded.
          Only aggregate counts and headlines you already unfolded are sent when the Editor&rsquo;s
          Desk note is written.
        </p>
        {confirming ? (
          <div className="mt-3 flex items-center gap-3">
            <span className="font-body text-xs">Burn the archive? This can&rsquo;t be undone.</span>
            <button
              onClick={() => {
                clearMemory();
                setConfirming(false);
              }}
              className="font-label text-[10px] text-masthead-red underline"
            >
              Yes, forget me
            </button>
            <button onClick={() => setConfirming(false)} className="font-label text-[10px] underline">
              Keep it
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="font-label text-[10px] text-ink-soft underline mt-3">
            Forget everything the paper knows about me
          </button>
        )}
      </section>
    </div>
  );
}
