"use client";

import { useState } from "react";
import type { Personalization, SectionKey } from "@/lib/types";
import { SECTION_ORDER } from "@/lib/sections";
import PageOrderList from "./PageOrderList";
import { moveChapter, moveWithinChapter, type ChapterId } from "@/lib/chapters";
import type { DigestPreferences } from "@/lib/preferences/types";

type Sport = Personalization["sports"][number];
export type FormPart = "basics" | "sports" | "order";

const SPORT_LABELS: Record<Sport, string> = {
  f1: "Formula 1",
  football: "Football",
  tennis: "Tennis",
  valorant: "Valorant",
};

// The sections a sport prints, so its row in Page order follows the choice.
const SPORT_SECTIONS: Partial<Record<SectionKey, Sport[]>> = {
  "paddock-notes": ["f1"],
  sports: ["football", "tennis"],
  clutch: ["valorant"],
};

// A numbered chapter: one decision per chapter, with a plain-language line
// explaining what it changes in tomorrow's paper.
function Chapter({
  numeral,
  title,
  effect,
  bare = false,
  children,
}: {
  numeral?: string;
  title: string;
  effect: string;
  /** Hide the heading when the page around it already names the step. */
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t hairline pt-6 mt-10 first:mt-0 first:border-t-0 first:pt-0">
      {!bare && (
        <>
          <div className="flex items-baseline gap-3 mb-1">
            {numeral && <span className="font-mono text-[11px] text-accent">{numeral}</span>}
            <h2 className="font-display font-extrabold text-[1.9rem] leading-none">{title}</h2>
          </div>
          <p className="font-headline italic text-[15px] text-ink-soft mb-5">{effect}</p>
        </>
      )}
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-label text-[11px] text-ink-soft block mb-1.5">{children}</span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="block font-sans text-[11px] text-ink-soft mt-1.5 leading-relaxed">{children}</span>;
}

const inputCls =
  "w-full border hairline rounded-lg px-2.5 py-2 bg-transparent font-sans text-sm outline-none focus:border-accent/60 transition-colors";

function Chip({
  active,
  onClick,
  children,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`font-sans text-xs px-2.5 py-1.5 border hairline rounded-full transition-colors ${
        active
          ? "bg-accent text-accent-ink border-accent"
          : "hover:bg-card-bg disabled:opacity-30 disabled:cursor-not-allowed"
      }`}
    >
      {children}
    </button>
  );
}

/** One followed sport: its name, then its few fields in a compact grid. */
export default function PersonalizationForm({
  value,
  onChange,
  parts,
  bare = false,
  news,
  onNewsChange,
}: {
  value: Personalization;
  onChange: (next: Personalization) => void;
  /** Render only these chapters (Settings splits them across tabs); all
   *  chapters, numbered, when omitted (onboarding). */
  parts?: FormPart[];
  /** Chapters without their own headings (the onboarding steps name them). */
  bare?: boolean;
  /** Settings: what fills each section, edited in Page order under its row. */
  news?: DigestPreferences | null;
  onNewsChange?: (next: DigestPreferences) => void;
}) {
  const show = (part: FormPart) => !parts || parts.includes(part);
  const num = (n: string) => (parts ? undefined : n);
  const toggleSport = (sport: Sport) => {
    const next = value.sports.includes(sport)
      ? value.sports.filter((s) => s !== sport)
      : [...value.sports, sport];
    onChange({ ...value, sports: next });
  };

  // A sport's section prints when the sport is followed; the choice above decides, not its row.
  const sportRows = Object.fromEntries(
    (Object.entries(SPORT_SECTIONS) as Array<[SectionKey, Sport[]]>).map(([key, sports]) => [key, sports.some((s) => value.sports.includes(s))]),
  ) as Partial<Record<SectionKey, boolean>>;

  const toggleSection = (key: (typeof SECTION_ORDER)[number]) => {
    // Hiding keeps the section's place in the order, so showing it again
    // puts it back where it was.
    onChange({
      ...value,
      hiddenSections: value.hiddenSections.includes(key)
        ? value.hiddenSections.filter((s) => s !== key)
        : [...value.hiddenSections, key],
    });
  };

  // A section moves within its chapter; a chapter moves past its neighbour
  // (lib/chapters.ts).
  const moveSection = (key: (typeof SECTION_ORDER)[number], dir: -1 | 1) =>
    onChange({ ...value, sectionOrder: moveWithinChapter(value.sectionOrder, key, dir) });
  const moveWholeChapter = (id: ChapterId, dir: -1 | 1) =>
    onChange({ ...value, sectionOrder: moveChapter(value.sectionOrder, id, dir) });

  return (
    <div>
      {/* I. Your city */}
      {show("basics") && (
      <Chapter
        bare={bare}
        numeral={num("I.")}
        title="Your city"
        effect="Your city sets the weather page and boosts local stories."
      >
        <label className="block">
          <FieldLabel>Home city</FieldLabel>
          <input
            type="text"
            value={value.homeCity}
            onChange={(e) => onChange({ ...value, homeCity: e.target.value })}
            className={inputCls}
            placeholder="Bengaluru"
          />
        </label>
      </Chapter>
      )}

      {/* II. Sports Desk */}
      {show("sports") && (
      <Chapter
        bare={bare}
        numeral={num("II.")}
        title="Sports you follow"
        effect="Each one you pick gets its pages. Your F1 team and drivers are set on Your Paddock, your Valorant teams on Clutch."
      >
        <div className="flex flex-wrap gap-2">
          {(["f1", "football", "tennis", "valorant"] as Sport[]).map((s) => (
            <Chip key={s} active={value.sports.includes(s)} onClick={() => toggleSport(s)}>
              {SPORT_LABELS[s]}
            </Chip>
          ))}
        </div>
        {value.sports.length === 0 && (
          <Hint>
            <span className="text-accent">No sports selected: their pages won&rsquo;t print.</span>
          </Hint>
        )}
      </Chapter>
      )}

      {/* III. Page order */}
      {show("order") && (
      <Chapter
        bare={bare}
        numeral={num("III.")}
        title="Page order"
        effect={news ? "What prints, in what order, and what fills each section — top of the list prints first." : "What prints, and in what order — top of the list prints first."}
      >
        <PageOrderList
          order={value.sectionOrder}
          hidden={[...value.hiddenSections, ...(Object.keys(sportRows) as SectionKey[]).filter((k) => !sportRows[k])]}
          sportRows={sportRows}
          onMove={moveSection}
          onMoveChapter={moveWholeChapter}
          onToggle={toggleSection}
          news={news}
          onNewsChange={onNewsChange}
        />
      </Chapter>
      )}
    </div>
  );
}
