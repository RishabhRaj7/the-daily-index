"use client";

import { useEffect, useState } from "react";
import TopBar, { TopBarTools, type NavChapter } from "@/components/chrome/TopBar";

// The paper's menu: one list of chapters in three forms, so the words never
// differ. A phone gets six words along the foot of the screen (as the live
// centre does) with nothing sticky on top; a tablet or laptop gets them in the
// top bar; from 1500px the window has height to spare at the sides rather than
// the top, so they move to a side menu with each chapter's sections under it.
//
// Scroll-spy: the last chapter and section whose top has passed the upper third.
// The page prints in menu order, so the last one past the line is the current
// one. Elements are looked up on each scroll because sections stream in late.

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
      for (const c of chapters) {
        if (!passed(c.id)) continue;
        chapter = c.id;
        section = null;
        for (const s of c.sections) if (passed(s.id)) section = s.id;
      }
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

function Rail({ chapters, active, section, isArchive }: { chapters: NavChapter[]; active: string; section: string | null; isArchive: boolean }) {
  return (
    <aside className="paper-rail hidden wide:flex">
      <a href={`#${TODAY}`} className="font-display text-[1.25rem] font-extrabold leading-[0.95]">
        The Daily
        <br />
        Index
      </a>
      <nav aria-label="Chapters" className="mt-5 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none]">
        <a href={`#${TODAY}`} data-nav={TODAY} className="rail-chapter" aria-current={active === TODAY ? "true" : undefined}>
          Today
        </a>
        {chapters.map((c) => (
          <div key={c.id} className="mt-3.5">
            <a href={`#${c.id}`} data-nav={c.id} className="rail-chapter" aria-current={active === c.id ? "true" : undefined}>
              {c.label}
            </a>
            {c.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rail-section" aria-current={section === s.id ? "true" : undefined}>
                {s.name}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="pt-3 border-t hairline mt-3">
        <TopBarTools isArchive={isArchive} />
      </div>
    </aside>
  );
}

export default function PaperNav({ chapters, isArchive = false, date }: { chapters: NavChapter[]; isArchive?: boolean; date?: string }) {
  const { chapter, section } = useActive(chapters);
  return (
    <>
      <TopBar chapters={chapters} active={chapter} today={TODAY} isArchive={isArchive} date={date} />
      <Dock chapters={chapters} active={chapter} />
      <Rail chapters={chapters} active={chapter} section={section} isArchive={isArchive} />
    </>
  );
}
