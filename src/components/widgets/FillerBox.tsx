import type { OnThisDayEntry, WordOfDay } from "@/lib/types";

export function OnThisDayBox({ entries }: { entries: OnThisDayEntry[] }) {
  return (
    <div data-reveal>
      <div className="font-label text-[10px] text-ink-soft mb-4">On this day</div>
      <ol className="relative border-l hairline ml-1.5 space-y-5">
        {entries.map((e, i) => (
          <li key={`${e.year}-${i}`} className="pl-5 relative">
            <span
              className="absolute -left-[5px] top-1.5 w-[9px] h-[9px] rounded-full border-2 bg-paper"
              style={{ borderColor: "var(--section-hue, var(--accent))" }}
            />
            <span className="font-display font-bold text-[1.5rem] leading-none">{e.year}</span>
            <p className="text-[14px] leading-snug text-ink-soft mt-1 line-clamp-3">{e.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function WordOfDayBox({ word }: { word: WordOfDay }) {
  return (
    <div id="word-of-the-day" className="module relative overflow-hidden scroll-mt-24" data-reveal style={{ ["--section-hue" as string]: "var(--hue-world)" }}>
      <div className="font-label text-[10px] text-ink-soft mb-3">Word of the day</div>
      <div className="font-headline italic text-[2.6rem] leading-[0.95] tracking-tight break-words">
        {word.word}
      </div>
      <div className="flex items-baseline gap-3 mt-2 font-mono text-[12px] text-ink-soft">
        {word.pronunciation && <span>{word.pronunciation}</span>}
        {word.partOfSpeech && (
          <span className="rounded-full border hairline px-2 py-0.5 text-[10px] uppercase">{word.partOfSpeech}</span>
        )}
      </div>
      <p className="text-[15px] leading-relaxed mt-4">{word.definition}</p>
      {word.example && (
        <p className="text-[14px] text-ink-soft italic mt-3 pl-3 border-l-2" style={{ borderColor: "var(--section-hue, var(--accent))" }}>
          {word.example}
        </p>
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 -bottom-10 font-display font-extrabold text-[9rem] leading-none text-transparent [-webkit-text-stroke:1px_var(--rule)] select-none"
      >
        Aa
      </span>
    </div>
  );
}
