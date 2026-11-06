import { Fragment } from "react";
import type { SectionKey } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";

/** Splits "The Circuit Board" into words that rise one after another. */
export function RisingWords({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, i, all) => (
        <Fragment key={`${word}-${i}`}>
          <span className="mask-rise" style={{ ["--rise-i" as string]: i }}>
            <span>{word}</span>
          </span>
          {i < all.length - 1 ? " " : ""}
        </Fragment>
      ))}
    </>
  );
}

// Every section opens the same way: its printed name in the display face,
// rising out of a mask as it scrolls in, beside what it's about in plain words
// (so "The Ledger" and "Finance" are never a puzzle), and one rule in the
// section's colour drawing itself across. The chapter above carries the big
// type; a section name is sized to leave the room for the news. The colour comes
// from --section-hue on the section wrapper, so the rest of the section (hover
// lines, links, bars) wears it too.
export default function SectionHeader({
  label,
  sectionKey,
  folio,
}: {
  label?: string;
  sectionKey?: SectionKey;
  /** Small status on the right of the name, e.g. a live dot. */
  folio?: React.ReactNode;
}) {
  const meta = sectionKey ? SECTION_META[sectionKey] : null;
  const name = meta?.name ?? label?.split(" — ")[0] ?? "";

  return (
    <header className="section-head" data-reveal="fade">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display font-extrabold text-[clamp(1.7rem,3vw,2.6rem)] leading-[0.9] -ml-[0.02em]">
          <RisingWords text={name} />
        </h2>
        {meta && <span className="section-subject font-sans font-semibold text-[13px] text-ink-soft">{meta.kicker}</span>}
        {folio && (
          <span className="ml-auto min-w-0 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-soft text-right">
            {folio}
          </span>
        )}
      </div>
      <div className="mt-2 h-[2px] rule-draw" style={{ background: "var(--section-hue, var(--accent))" }} />
    </header>
  );
}
