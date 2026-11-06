"use client";

import { useEffect, useState } from "react";
import TopBar, { TopBarTools, type NavChapter } from "@/components/chrome/TopBar";

// The paper's menu: one list in three forms, so the words never differ. A phone
// gets six words along the foot of the screen (as the live centre does) with
// nothing sticky on top; a tablet or laptop gets them in the top bar; from 1500px
// the window has width to spare rather than height, so they move to a side menu:
// the paper's own index, in its display type, every section in its colour under
// its group's small label, the one being read filled, and the day's number beside
// a section that has one (Market Pulse's move, the race countdown, the temperature).
//
// Scroll-spy: the last group and section whose top has passed the upper third.
// The page prints in menu order, so the last one past the line is the current
// one. Elements are looked up on each scroll because sections stream in late. The
// current section's colour goes on <html> as --now-hue: the reading progress bar
// and every form of the menu's "you are here" wear it (globals.css).

const TODAY = "masthead";

function useActive(chapters: NavChapter[]): { chapter: string; section: string | null } {
  const [active, setActive] = useState<{ chapter: string; section: string | null }>({ chapter: TODAY, section: null });
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const line = window.innerHeight * 0.33;
      const passed = (id: string) => {
        const el = document.getElementById(id);
        return !!el && el.getBoundingClientRect().top <= line;
      };
      let chapter = TODAY;
      let section: string | null = null;
      let hue: string | null = null;
      for (const c of chapters) {
        if (!passed(c.id)) continue;
        chapter = c.id;
        section = null;
        // Between a group's start and its first section's name, its first colour.
        hue = c.sections[0]?.hue ?? null;
        for (const s of c.sections) {
          if (!passed(s.id)) continue;
          section = s.id;
          hue = s.hue;
        }
      }
      const root = document.documentElement;
      if (hue) root.style.setProperty("--now-hue", hue);
      else root.style.removeProperty("--now-hue");
      setActive((cur) => (cur.chapter === chapter && cur.section === section ? cur : { chapter, section }));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty("--now-hue");
    };
  }, [chapters]);
  return active;
}

function Dock({ chapters, active }: { chapters: NavChapter[]; active: string }) {
  const links = [{ id: TODAY, label: "Today" }, ...chapters];
  return (
    <nav aria-label="Chapters" className="paper-dock" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
      {links.map((c) => (
        <a key={c.id} href={`#${c.id}`} data-nav={c.id} aria-current={active === c.id ? "true" : undefined}>
          {c.label}
        </a>
      ))}
    </nav>
  );
}

function Rail({
  chapters,
  active,
  section,
  isArchive,
  date,
  issue,
}: {
  chapters: NavChapter[];
  active: string;
  section: string | null;
  isArchive: boolean;
  date?: string;
  issue?: string;
}) {
  return (
    <aside className="paper-rail hidden wide:flex">
      <a href={`#${TODAY}`} className="block">
        <span className="rail-mark" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} />
          ))}
        </span>
        <span className="block font-display text-[1.55rem] font-extrabold leading-[0.92]">
          The Daily
          <br />
          Index
        </span>
      </a>
      <p className="font-mono text-[11px] leading-[1.35] text-ink-soft mt-1.5 pb-2.5 border-b-2 border-[color:var(--ink)]">
        {date}
        {issue && (
          <>
            <br />
            {issue}
          </>
        )}
      </p>
      <nav aria-label="Chapters" className="mt-2 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none]">
        <a
          href={`#${TODAY}`}
          data-nav={TODAY}
          className="rail-row"
          style={{ ["--row-hue" as string]: "var(--accent)" }}
          aria-current={active === TODAY ? "true" : undefined}
        >
          <span>Today</span>
        </a>
        {chapters.map((c) => (
          <div key={c.id}>
            <a href={`#${c.id}`} data-nav={c.id} className="rail-group" aria-current={active === c.id ? "true" : undefined}>
              {c.label}
            </a>
            {c.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rail-row" style={{ ["--row-hue" as string]: s.hue }} aria-current={section === s.id ? "true" : undefined}>
                <span>{s.name}</span>
                {s.note && (
                  <b className={s.note.tone ? `rail-note-${s.note.tone}` : undefined} suppressHydrationWarning>
                    {s.note.text}
                  </b>
                )}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="pt-2.5 border-t hairline mt-2.5">
        <TopBarTools isArchive={isArchive} />
      </div>
    </aside>
  );
}

export default function PaperNav({
  chapters,
  isArchive = false,
  date,
  issue,
}: {
  chapters: NavChapter[];
  isArchive?: boolean;
  date?: string;
  /** "VOL. 1 · NO. 283", printed under the side menu's name. */
  issue?: string;
}) {
  const { chapter, section } = useActive(chapters);
  return (
    <>
      <TopBar chapters={chapters} active={chapter} today={TODAY} isArchive={isArchive} date={date} />
      <Dock chapters={chapters} active={chapter} />
      <Rail chapters={chapters} active={chapter} section={section} isArchive={isArchive} date={date} issue={issue} />
    </>
  );
}
