"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { createElement, useEffect, useRef, useState } from "react";
import TopBar, { TopBarTools, type NavChapter } from "@/components/chrome/TopBar";
import Sheet from "@/components/extras/Sheet";
import { CHAPTER_ICONS, sectionIcon } from "@/components/chrome/nav-icons";
import { saveMenu } from "@/lib/nav-menu";

// The paper's menu: one list in three forms, so the words never differ. Everywhere
// the icons are outlines when inactive and filled when current, in the section's
// colour.
//   A phone: five icons with words along the foot of the screen, with one line
//     along their top doing the reading progress bar's job too: a piece per word,
//     filled up to where you are, so it ends above the word you're in. Once the
//     masthead has gone, a slim row along the top names the section you're in and
//     opens the list of all of them in a sheet.
//   A tablet or laptop: the same words in the top bar.
//   From 1500px: the window has width to spare rather than height, so they move
//     to a side menu: the paper's own index, in its display type, every section
//     under its group's small label, the one being read filled, and the day's
//     number beside a section that has one.
//
// Scroll-spy: the last group and section whose top has passed the upper third.
// The page prints in menu order, so the last one past the line is the current
// one. Elements are looked up on each scroll because sections stream in late. The
// current section's colour goes on <html> as --now-hue: the reading progress bar
// and every form of "you are here" wear it (globals.css).
//
// The pages around the paper carry the same side menu and words (chrome/SiteNav.tsx),
// from the copy saved here (lib/nav-menu.ts). A link from one of them arrives with
// the section in the address, perhaps before that section has printed, so it's
// waited for.

const TODAY = "masthead";
/** How far down the window a section counts as reached. */
const LINE = 0.33;

function useActive(chapters: NavChapter[]): { chapter: string; section: string | null } {
  const [active, setActive] = useState<{ chapter: string; section: string | null }>({ chapter: TODAY, section: null });
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const line = window.innerHeight * LINE;
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
  const ids = links.map((l) => l.id).join();
  const fills = useRef<Array<HTMLSpanElement | null>>([]);

  // The line along the top: each piece fills as its part of the page goes by, by
  // the same line the scroll-spy uses, so it ends above the current word. Written
  // straight to the element, since it changes on every frame of a scroll.
  useEffect(() => {
    let frame = 0;
    const list = ids.split(",");
    const read = () => {
      frame = 0;
      const y = window.scrollY;
      const line = window.innerHeight * LINE;
      const end = document.documentElement.scrollHeight - window.innerHeight;
      const starts = list.map((id, i) => {
        if (i === 0) return 0;
        const el = document.getElementById(id);
        return el ? el.getBoundingClientRect().top + y - line : end;
      });
      list.forEach((_, i) => {
        const to = i + 1 < list.length ? starts[i + 1] : end;
        const part = Math.max(0, Math.min(1, (y - starts[i]) / Math.max(1, to - starts[i])));
        const fill = fills.current[i];
        if (fill) fill.style.transform = `scaleX(${part})`;
      });
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
  }, [ids]);

  const columns = { gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` };
  return (
    <nav aria-label="Chapters" className="paper-dock" style={columns}>
      <span className="dock-line" style={columns} aria-hidden="true">
        {links.map((c, i) => (
          <span key={c.id}>
            <span
              ref={(el) => {
                fills.current[i] = el;
              }}
            />
          </span>
        ))}
      </span>
      {links.map((c) => {
        const Icon = CHAPTER_ICONS[c.id] ?? CHAPTER_ICONS[TODAY];
        const current = active === c.id;
        return (
          <a key={c.id} href={`#${c.id}`} data-nav={c.id} aria-current={current ? "true" : undefined}>
            <Icon size={22} weight={current ? "fill" : "regular"} aria-hidden="true" />
            {c.label}
          </a>
        );
      })}
    </nav>
  );
}

/** The phone's slim row: where you are, and the way to any section. */
function PhoneNow({ chapters, active, section }: { chapters: NavChapter[]; active: string; section: string | null }) {
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const masthead = document.getElementById(TODAY);
    if (!masthead) return;
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting));
    io.observe(masthead);
    return () => io.disconnect();
  }, []);

  const group = chapters.find((c) => c.id === active);
  const current = group?.sections.find((s) => s.id === section) ?? group?.sections[0];
  const jump = (id: string) => {
    setOpen(false);
    // Once the sheet has gone and the page can scroll again.
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView(), 30);
  };

  return (
    <>
      <div className="phone-now" data-shown={shown || undefined}>
        <span className="phone-now-name" style={{ color: current?.hue ?? "var(--ink)" }}>
          {createElement(sectionIcon(current?.id ?? TODAY), { size: 18, weight: "fill", "aria-hidden": true })}
          <span className="truncate">{current?.name ?? "Today"}</span>
        </span>
        <button type="button" className="phone-now-all" onClick={() => setOpen(true)} aria-haspopup="dialog">
          Sections
          <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <Sheet title="Sections" onClose={() => setOpen(false)} width={480}>
          <button type="button" onClick={() => jump(TODAY)} className="rail-row w-full text-left" style={{ ["--row-hue" as string]: "var(--accent)" }} aria-current={active === TODAY ? "true" : undefined}>
            <span className="rail-row-name">
              <RowIcon id={TODAY} current={active === TODAY} />
              Today
            </span>
          </button>
          {chapters.map((c) => (
            <div key={c.id}>
              <div className="rail-group">{c.label}</div>
              {c.sections.map((s) => (
                <button key={s.id} type="button" onClick={() => jump(s.id)} className="rail-row w-full text-left" style={{ ["--row-hue" as string]: s.hue }} aria-current={section === s.id ? "true" : undefined}>
                  <span className="rail-row-name">
                    <RowIcon id={s.id} current={section === s.id} />
                    {s.name}
                  </span>
                  {s.note && <RowNote note={s.note} />}
                </button>
              ))}
            </div>
          ))}
        </Sheet>
      )}
    </>
  );
}

function RowIcon({ id, current }: { id: string; current: boolean }) {
  return createElement(sectionIcon(id), { size: 16, weight: current ? "fill" : "regular", className: "rail-icon", "aria-hidden": true });
}

function RowNote({ note }: { note: NonNullable<NavChapter["sections"][number]["note"]> }) {
  return (
    <b className={note.tone ? `rail-note-${note.tone}` : undefined} suppressHydrationWarning>
      {note.text}
    </b>
  );
}

/** The side menu's frame, from 1500px: the paper's name and date above, its tools below. */
export function RailFrame({
  home,
  date,
  issue,
  label,
  children,
}: {
  /** Where the name goes: "/" off the paper. */
  home: string;
  date?: string;
  issue?: string;
  label: string;
  children: React.ReactNode;
}) {
  const Anchor = home.startsWith("/") ? Link : "a";
  return (
    <aside className="paper-rail hidden wide:flex" data-site-nav>
      <Anchor href={home} className="block">
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
      </Anchor>
      <p className="font-mono text-[11px] leading-[1.35] text-ink-soft mt-1.5 pb-2.5 border-b-2 border-[color:var(--ink)] min-h-[3.5em]" suppressHydrationWarning>
        {date}
        {issue && (
          <>
            <br />
            {issue}
          </>
        )}
      </p>
      <nav aria-label={label} className="mt-2 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none]">
        {children}
      </nav>
      <div className="pt-2.5 border-t hairline mt-2.5">
        <TopBarTools />
      </div>
    </aside>
  );
}

/** The paper's rows in the side menu. `base` is "/" off the paper, so its links go back to it. */
export function Rail({
  chapters,
  active,
  section,
  date,
  issue,
  base = "",
}: {
  chapters: NavChapter[];
  active: string;
  section: string | null;
  date?: string;
  issue?: string;
  base?: string;
}) {
  const Anchor = base ? Link : "a";
  const to = (id: string) => (base ? (id === TODAY ? base : `${base}#${id}`) : `#${id}`);
  return (
    <RailFrame home={to(TODAY)} date={date} issue={issue} label="Chapters">
        <Anchor href={to(TODAY)} data-nav={TODAY} className="rail-row" style={{ ["--row-hue" as string]: "var(--accent)" }} aria-current={active === TODAY ? "true" : undefined}>
          <span className="rail-row-name">
            <RowIcon id={TODAY} current={active === TODAY} />
            Today
          </span>
        </Anchor>
        {chapters.map((c) => (
          <div key={c.id}>
            <Anchor href={to(c.id)} data-nav={c.id} className="rail-group" aria-current={active === c.id ? "true" : undefined}>
              {c.label}
            </Anchor>
            {c.sections.map((s) => (
              <Anchor key={s.id} href={to(s.id)} className="rail-row" style={{ ["--row-hue" as string]: s.hue }} aria-current={section === s.id ? "true" : undefined}>
                <span className="rail-row-name">
                  <RowIcon id={s.id} current={section === s.id} />
                  {s.name}
                </span>
                {s.note && <RowNote note={s.note} />}
              </Anchor>
            ))}
          </div>
        ))}
    </RailFrame>
  );
}

export default function PaperNav({
  chapters,
  date,
  issue,
}: {
  chapters: NavChapter[];
  date?: string;
  /** "VOL. 1 · NO. 283", printed under the side menu's name. */
  issue?: string;
}) {
  const { chapter, section } = useActive(chapters);

  // The pages around the paper print this same menu.
  useEffect(() => saveMenu({ chapters, date, issue }), [chapters, date, issue]);

  // Arriving at a section from another page: it may print a moment after the page
  // does, and sections above it can still grow as they load. So go to it, and go
  // again whenever it moves, until it has held still for two seconds. Touching the
  // page calls that off.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || id === TODAY) return;
    let tries = 0;
    let steady = 0;
    let at: number | null = null;
    const stop = () => window.clearInterval(timer);
    const timer = window.setInterval(() => {
      if (++tries > 120) return stop();
      const el = document.getElementById(id);
      if (!el || document.querySelector(".prep-overlay")) return;
      if (at !== null && Math.abs(el.getBoundingClientRect().top - at) < 2) {
        if (++steady >= 8) stop();
        return;
      }
      steady = 0;
      el.scrollIntoView({ behavior: "instant" });
      at = el.getBoundingClientRect().top;
    }, 250);
    window.addEventListener("wheel", stop, { once: true, passive: true });
    window.addEventListener("touchmove", stop, { once: true, passive: true });
    return () => {
      stop();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
    };
  }, []);

  return (
    <>
      <TopBar chapters={chapters} active={chapter} today={TODAY} date={date} />
      <PhoneNow chapters={chapters} active={chapter} section={section} />
      <Dock chapters={chapters} active={chapter} />
      <Rail chapters={chapters} active={chapter} section={section} date={date} issue={issue} />
    </>
  );
}
