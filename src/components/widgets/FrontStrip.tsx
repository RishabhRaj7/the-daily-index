"use client";

import type { IssueRecord, OnThisDayEntry, WordOfDay } from "@/lib/types";

// Under the lead: the day's extras in one slim strip, three columns with
// hairline rules between them (on an ultrawide, stacked in a column of their
// own beside the lead) — the editor's note, one moment from this
// day in history, and the word of the day. Each is short; none competes
// with the news above.

/** The note, kept to its first two sentences. */
function short(note: string): string {
  const parts = note.match(/[^.!?]+[.!?]+["”’]?/g);
  return parts && parts.length > 2 ? parts.slice(0, 2).join("").trim() : note;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-label text-[10px] text-ink-soft mb-2.5">{children}</div>;
}

export default function FrontStrip({
  note,
  then,
  history,
  word,
}: {
  note: string | null;
  /** The reader's own front page on this date in earlier issues. */
  then: Array<{ label: string; issue: IssueRecord }>;
  history: OnThisDayEntry | null;
  word: WordOfDay | null;
}) {
  const cells = [
    note ? (
      <div key="note">
        <Label>From the editor</Label>
        <p className="font-headline italic text-[17px] leading-[1.4] text-ink">{short(note)}</p>
        {then[0] && (
          <p className="font-mono text-[10px] text-ink-soft mt-2.5">
            {then[0].label}, your lead was: <span className="font-sans not-italic text-ink">{then[0].issue.heroHeadline}</span>
          </p>
        )}
      </div>
    ) : null,
    history ? (
      <div key="history">
        <Label>On this day</Label>
        <div className="font-display font-bold text-[1.6rem] leading-none">{history.year}</div>
        <p className="text-[14px] leading-snug text-ink-soft mt-1.5 line-clamp-3">{history.text}</p>
      </div>
    ) : null,
    word?.word ? (
      <div key="word" id="word-of-the-day" className="scroll-mt-24">
        <Label>Word of the day</Label>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-headline italic text-[1.9rem] leading-none tracking-tight">{word.word}</span>
          {word.pronunciation && <span className="font-mono text-[11px] text-ink-soft">{word.pronunciation}</span>}
          {word.partOfSpeech && <span className="font-mono text-[10px] text-ink-soft uppercase">{word.partOfSpeech}</span>}
        </div>
        <p className="text-[14px] leading-snug mt-2 line-clamp-3">{word.definition}</p>
      </div>
    ) : null,
  ].filter(Boolean);

  if (cells.length === 0) return null;
  return (
    <aside
      aria-label="The day's extras"
      className="grid gap-y-6 md:grid-cols-3 pt-6 border-t hairline md:[&>*]:px-6 md:[&>*:first-child]:pl-0 md:[&>*:last-child]:pr-0 md:[&>*+*]:border-l md:[&>*]:border-[color:var(--rule)] uw:grid-cols-1 uw:pt-0 uw:border-t-0 uw:gap-y-0 uw:[&>*]:px-0 uw:[&>*+*]:border-l-0 uw:[&>*+*]:border-t uw:[&>*]:py-6 uw:[&>*:first-child]:pt-0"
      data-reveal
    >
      {cells}
    </aside>
  );
}
