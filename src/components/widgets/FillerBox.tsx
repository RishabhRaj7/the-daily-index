import type { OnThisDayEntry, WordOfDay } from "@/lib/types";

export function OnThisDayBox({ entries }: { entries: OnThisDayEntry[] }) {
  return (
    <div className="paper-box">
      <div className="font-label text-[10px] text-ink-soft mb-2">On This Day</div>
      <ul className="space-y-2 text-sm">
        {entries.map((e, i) => (
          <li key={`${e.year}-${i}`} className="flex gap-2">
            <span className="font-mono text-ink-soft shrink-0">{e.year}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WordOfDayBox({ word }: { word: WordOfDay }) {
  return (
    <div className="paper-box">
      <div className="font-label text-[10px] text-ink-soft mb-2">Word of the Day</div>
      <div className="flex items-baseline gap-2">
        <span className="font-headline text-xl font-semibold italic">{word.word}</span>
        <span className="text-xs text-ink-soft">{word.pronunciation}</span>
      </div>
      <div className="text-xs text-ink-soft italic mb-1">{word.partOfSpeech}</div>
      <p className="text-sm">{word.definition}</p>
      <p className="text-sm text-ink-soft italic mt-1">&ldquo;{word.example}&rdquo;</p>
    </div>
  );
}
