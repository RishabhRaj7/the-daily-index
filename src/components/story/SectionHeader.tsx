import type { SectionKey } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";

/** Splits "The Circuit Board" into words that rise one after another. */
export function RisingWords({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, i, all) => (
        <span key={`${word}-${i}`} className="mask-rise" style={{ ["--rise-i" as string]: i }}>
          <span>
            {word}
            {i < all.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </>
  );
}

// Every section opens the same way: its name set huge in the display face,
// rising out of a mask as it scrolls in, and one rule in the section's colour
// drawing itself across. That's the whole header — one name, one line. The
// colour comes from --section-hue on the section wrapper, so the rest of the
// section (hover lines, links, bars) wears it too.
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
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display font-extrabold text-[clamp(2.9rem,10vw,7.25rem)] leading-[0.84] -ml-[0.04em]">
          <RisingWords text={name} />
        </h2>
        {folio && (
          <span className="shrink-0 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-soft pb-2">
            {folio}
          </span>
        )}
      </div>
      <div className="mt-5 h-[3px] rule-draw" style={{ background: "var(--section-hue, var(--accent))" }} />
    </header>
  );
}
