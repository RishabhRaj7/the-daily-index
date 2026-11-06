"use client";

import { ArrowDownIcon, ArrowSquareOutIcon } from "@phosphor-icons/react";
import { deskIcon } from "@/components/chrome/nav-icons";
import type { EditionBrief } from "@/lib/types";

// "The briefing": the front page's left column. The day's must-reads as one
// line each — the editor's picks across every desk — numbered, tagged with
// their desk's colour, and linked down to where the full story runs (or out
// to the source when it only made the briefing). Read top to bottom it is
// the whole edition in under a minute.

const HUES: Record<string, string> = {
  world: "var(--hue-world)",
  india: "var(--hue-nation)",
  nation: "var(--hue-nation)",
  valorant: "var(--hue-clutch)",
  markets: "var(--hue-markets)",
  money: "var(--hue-money)",
  f1: "var(--hue-f1)",
  football: "var(--hue-sport)",
  tennis: "var(--hue-sport)",
  sports: "var(--hue-sport)",
  tech: "var(--hue-tech)",
  technology: "var(--hue-tech)",
};

function hueFor(label: string): string {
  const key = label.toLowerCase();
  // Anything else on a desk's line is one of the reader's cities.
  return HUES[key] ?? Object.entries(HUES).find(([k]) => key.includes(k))?.[1] ?? "var(--hue-cities)";
}

export default function Briefing({
  brief,
  loading,
  anchorFor,
  actions,
}: {
  brief: EditionBrief | null;
  loading?: boolean;
  /** DOM id of the story on this page for a URL, when it runs in a section. */
  anchorFor: (url: string) => string | null;
  /** Listen and Refresh: they act on what's printed here. */
  actions?: React.ReactNode;
}) {
  const items = brief?.bullets ?? [];

  return (
    <nav aria-label="The briefing" className="min-w-0">
      <div className="mb-2.5">
        <h2 className="font-display font-extrabold text-[1.7rem] leading-[0.85] whitespace-nowrap">The briefing</h2>
        <p className="font-mono text-[11px] text-ink-soft mt-1">
          {items.length > 0 ? `TODAY IN ${items.length} LINES · ABOUT A MINUTE` : "SETTING TODAY'S LINES…"}
        </p>
      </div>

      {items.length === 0 ? (
        <ol className="border-t hairline" aria-busy={loading}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="py-4 border-b hairline animate-pulse">
              <div className="h-2 w-12 rounded-full bg-card-bg mb-2.5" />
              <div className="h-3 w-full rounded-full bg-card-bg mb-1.5" />
              <div className="h-3 w-2/3 rounded-full bg-card-bg" />
            </li>
          ))}
        </ol>
      ) : (
        <ol className="border-t hairline">
          {items.map((b, i) => {
            const hue = hueFor(b.section);
            const anchor = b.url ? anchorFor(b.url) : null;
            const href = anchor ? `#${anchor}` : b.url;
            const external = !anchor && Boolean(b.url);
            const Glyph = deskIcon(b.section);
            return (
              <li key={`${b.section}-${i}`} className="border-b hairline" data-reveal style={{ ["--reveal-i" as string]: i }}>
                <a
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="group grid grid-cols-[1.6rem_minmax(0,1fr)] gap-x-2 py-2"
                  style={{ ["--section-hue" as string]: hue }}
                >
                  <span className="font-display font-extrabold text-[1.5rem] leading-[0.9] text-ink-faint transition-colors duration-300 group-hover:text-[color:var(--section-hue)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-label text-[11px]" style={{ color: hue }}>
                      <Glyph size={13} weight="fill" aria-hidden="true" />
                      {b.section}
                      <span className="text-ink-faint ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        {external ? <ArrowSquareOutIcon size={13} aria-hidden="true" /> : <ArrowDownIcon size={13} aria-hidden="true" />}
                      </span>
                    </span>
                    <span className="block font-headline text-[1.02rem] leading-[1.25] mt-0.5 text-balance">
                      <span className="headline-link">{b.text}</span>
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
      {actions && <div className="flex flex-wrap items-center gap-2 mt-2.5">{actions}</div>}
    </nav>
  );
}
