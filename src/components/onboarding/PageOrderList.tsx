"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SectionKey } from "@/lib/types";
import type { DigestPreferences, DigestSection } from "@/lib/preferences/types";
import { SECTION_META } from "@/lib/sections";
import { SectionSettings, sectionSummary } from "@/components/settings/DigestPreferencesEditor";

// Page order: every section under the name the paper prints it with
// ("The Ledger"), its subject beneath ("Finance"), in the order it prints.
// The one place for what prints and in what order. In Settings it also holds
// what fills each section (`news`): a row the AI editor fills says so under
// its name and opens to its settings (stories, what it puts first, a note to
// the editor), and the reader's own sections follow the paper's, where they
// print, with their own order, Remove, and "+ Add a section".
//
// Moving a row animates: the rows swap by sliding past each other (FLIP:
// measure where each row was, let React reorder, then play the difference
// back as a transform), and the moved row lifts and glows for a moment so
// the eye follows it. Reduced-motion readers get the instant swap.

const SLIDE_MS = 320;

const roundBtn = "font-mono text-xs px-1.5 py-0.5 border hairline rounded-full disabled:opacity-30 hover:bg-card-bg transition-transform";
const editBtn = "flex items-center gap-1 font-label text-[10px] px-2 py-1 rounded-full text-ink-soft hover:text-ink hover:bg-card-bg";
const rowCls = "relative flex flex-wrap items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg transition-[background-color,box-shadow] duration-500";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

const lift = (hue: string) => ({
  zIndex: 1,
  background: `color-mix(in srgb, ${hue} 10%, var(--paper))`,
  boxShadow: `0 6px 18px -8px color-mix(in srgb, ${hue} 55%, transparent)`,
});

export default function PageOrderList({
  order,
  hidden,
  onMove,
  onToggle,
  news,
  onNewsChange,
}: {
  order: SectionKey[];
  hidden: SectionKey[];
  onMove: (key: SectionKey, dir: -1 | 1) => void;
  onToggle: (key: SectionKey) => void;
  /** Settings: what fills each section, edited under its row. */
  news?: DigestPreferences | null;
  onNewsChange?: (next: DigestPreferences) => void;
}) {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const before = useRef(new Map<string, number>());
  const [moved, setMoved] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Remember where each row sits before a move changes the order.
  const remember = (key: string) => {
    before.current = new Map([...rows.current].map(([k, el]) => [k, el.getBoundingClientRect().top]));
    setMoved(key);
  };
  const move = (key: SectionKey, dir: -1 | 1) => {
    remember(key);
    onMove(key, dir);
  };

  const editable = !!(news && onNewsChange);
  const own = editable && news ? news.sections.filter((s) => !s.slot).sort((a, b) => a.order - b.order) : [];
  const ownKeys = own.map((s) => s.id).join(",");
  const fills = (key: SectionKey): DigestSection[] => (editable && news ? news.sections.filter((s) => s.slot === key) : []);
  const setSection = (next: DigestSection) => {
    if (news) onNewsChange?.({ ...news, sections: news.sections.map((s) => (s.id === next.id ? next : s)) });
  };
  const moveOwn = (id: string, dir: -1 | 1) => {
    const i = own.findIndex((s) => s.id === id);
    const self = own[i];
    const other = own[i + dir];
    if (!news || !self || !other) return;
    remember(`own:${id}`);
    onNewsChange?.({
      ...news,
      sections: news.sections.map((s) => (s.id === self.id ? { ...s, order: other.order } : s.id === other.id ? { ...s, order: self.order } : s)),
    });
  };
  const addOwn = () => {
    if (!news) return;
    let id = "my-section";
    for (let n = 2; news.sections.some((s) => s.id === id); n++) id = `my-section-${n}`;
    const at = Math.max(0, ...news.sections.map((s) => s.order)) + 10;
    onNewsChange?.({ ...news, sections: [...news.sections, { id, type: "custom", label: "New section", order: at, instruction: "", articleCount: 3, watchEntities: [] }] });
    setOpenKey(`own:${id}`);
  };
  const removeOwn = (id: string) => {
    if (news) onNewsChange?.({ ...news, sections: news.sections.filter((s) => s.id !== id) });
  };

  // After React has put the rows in their new places, start each from where
  // it was and slide it home.
  useLayoutEffect(() => {
    const was = before.current;
    if (was.size === 0) return;
    before.current = new Map();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [key, el] of rows.current) {
      const from = was.get(key);
      if (from === undefined) continue;
      const dy = from - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
        { duration: SLIDE_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    }
  }, [order, ownKeys]);

  // The lift clears once the slide has landed.
  useEffect(() => {
    if (!moved) return;
    const t = window.setTimeout(() => setMoved(null), SLIDE_MS + 500);
    return () => window.clearTimeout(t);
  }, [moved, order, ownKeys]);

  const keep = (key: string) => (el: HTMLLIElement | null) => {
    if (el) rows.current.set(key, el);
    else rows.current.delete(key);
  };
  const shownCount = order.filter((k) => !hidden.includes(k)).length;
  // A row's settings, opened beneath it across the row's whole width.
  const settings = (key: string, sections: DigestSection[]) =>
    openKey === key && (
      <div className="basis-full pl-10 pr-1 pb-2 pt-1 space-y-5">
        {sections.map((sec) => (
          <div key={sec.id}>
            {sections.length > 1 && <span className="block font-label text-[10px] text-ink-soft mb-2">{sec.label}</span>}
            <SectionSettings section={sec} onChange={setSection} />
          </div>
        ))}
      </div>
    );

  return (
    <>
      <ol className="divide-y hairline border-y hairline">
        {order.map((key, idx) => {
          const meta = SECTION_META[key];
          const active = !hidden.includes(key);
          const position = order.slice(0, idx + 1).filter((k) => !hidden.includes(k)).length;
          const filled = fills(key);
          const open = openKey === key;
          return (
            <li key={key} ref={keep(key)} className={rowCls} style={moved === key ? lift(meta.hue) : undefined}>
              <span className={`font-mono text-xs w-5 tabular-nums ${active ? "" : "text-ink-soft/50"}`}>{active ? `${position}.` : "–"}</span>
              <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: active ? meta.hue : "var(--rule)" }} aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className={`block font-headline text-[15px] leading-tight ${active ? "font-semibold" : "text-ink-soft italic"}`}>{meta.name}</span>
                <span className="block font-label text-[10px] text-ink-soft mt-0.5">{meta.kicker}</span>
                {filled.length > 0 && <span className="block font-mono text-[10px] text-ink-faint mt-0.5 truncate">{filled.map(sectionSummary).join(" · ")}</span>}
              </span>
              {filled.length > 0 && (
                <button type="button" onClick={() => setOpenKey(open ? null : key)} aria-expanded={open} aria-label={`${open ? "Close" : "Edit"} what fills ${meta.name}`} className={editBtn}>
                  {open ? "Done" : "Edit"}
                  <Chevron open={open} />
                </button>
              )}
              {active && (
                <span className="flex gap-1">
                  <button type="button" aria-label={`Move ${meta.name} up`} disabled={idx === 0} onClick={() => move(key, -1)} className={`${roundBtn} active:-translate-y-0.5`}>
                    ↑
                  </button>
                  <button type="button" aria-label={`Move ${meta.name} down`} disabled={idx === order.length - 1} onClick={() => move(key, 1)} className={`${roundBtn} active:translate-y-0.5`}>
                    ↓
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => onToggle(key)}
                aria-pressed={active}
                className={`font-label text-[10px] px-2.5 py-1 border hairline rounded-full transition-colors ${active ? "bg-accent text-accent-ink border-accent" : "hover:bg-card-bg"}`}
              >
                {active ? "Shown" : "Hidden"}
              </button>
              {settings(key, filled)}
            </li>
          );
        })}
        {/* The reader's own sections print after the paper's. */}
        {own.map((sec, i) => {
          const key = `own:${sec.id}`;
          const open = openKey === key;
          return (
            <li key={key} ref={keep(key)} className={rowCls} style={moved === key ? lift("var(--accent)") : undefined}>
              <span className="font-mono text-xs w-5 tabular-nums">{shownCount + i + 1}.</span>
              <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: "var(--ink-faint)" }} aria-hidden="true" />
              <span className="flex-1 min-w-0">
                {open ? (
                  <input
                    aria-label="Section name"
                    className="w-full bg-transparent font-headline text-[15px] font-semibold leading-tight focus:outline-none border-b border-transparent focus:border-accent"
                    value={sec.label}
                    onChange={(e) => setSection({ ...sec, label: e.target.value })}
                  />
                ) : (
                  <span className="block font-headline text-[15px] leading-tight font-semibold truncate">{sec.label}</span>
                )}
                <span className="block font-label text-[10px] text-ink-soft mt-0.5">Your section</span>
                <span className="block font-mono text-[10px] text-ink-faint mt-0.5 truncate">{sectionSummary(sec)}</span>
              </span>
              <button type="button" onClick={() => setOpenKey(open ? null : key)} aria-expanded={open} className={editBtn}>
                {open ? "Done" : "Edit"}
                <Chevron open={open} />
              </button>
              <span className="flex gap-1">
                <button type="button" aria-label={`Move ${sec.label} up`} disabled={i === 0} onClick={() => moveOwn(sec.id, -1)} className={`${roundBtn} active:-translate-y-0.5`}>
                  ↑
                </button>
                <button type="button" aria-label={`Move ${sec.label} down`} disabled={i === own.length - 1} onClick={() => moveOwn(sec.id, 1)} className={`${roundBtn} active:translate-y-0.5`}>
                  ↓
                </button>
              </span>
              <button type="button" onClick={() => removeOwn(sec.id)} className="font-label text-[10px] px-2.5 py-1 border hairline rounded-full text-accent hover:bg-card-bg">
                Remove
              </button>
              {settings(key, [sec])}
            </li>
          );
        })}
      </ol>
      {editable && (
        <button type="button" onClick={addOwn} className="mt-3 font-label text-[10px] px-3 py-1.5 border hairline rounded-full hover:bg-card-bg">
          + Add a section
        </button>
      )}
    </>
  );
}
