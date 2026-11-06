"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EditionToggle from "@/components/masthead/EditionToggle";
import SettingsLink from "@/components/chrome/SettingsLink";

export interface NavChapter {
  /** The element the chapter starts at. */
  id: string;
  label: string;
  name: string;
  sections: Array<{ id: string; name: string }>;
}

/** The evening switch, the archive and settings, wherever the menu puts them. */
export function TopBarTools({ isArchive = false }: { isArchive?: boolean }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <EditionToggle compact />
      <Link
        href={isArchive ? "/" : "/archive"}
        className="icon-btn"
        title={isArchive ? "Today's edition" : "Archive"}
        aria-label={isArchive ? "Today's edition" : "Archive"}
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="3" rx="0.8" />
          <path d="M3 6v6.2c0 .5.3.8.8.8h8.4c.5 0 .8-.3.8-.8V6M6.5 8.8h3" strokeLinecap="round" />
        </svg>
      </Link>
      <SettingsLink className="icon-btn">
        <span className="sr-only">Settings</span>
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
          <circle cx="10" cy="4.5" r="1.5" />
          <circle cx="6" cy="11.5" r="1.5" />
        </svg>
      </SettingsLink>
    </div>
  );
}

// The top bar, on every page. The small wordmark only appears once the big
// particle one has scrolled away. On the paper itself it carries the chapters
// on a tablet or laptop (the current one underlined); on a phone it's a plain
// row that scrolls away, the chapters being at the foot of the screen; from
// 1500px the side menu takes over and the bar steps aside (chrome/PaperNav.tsx).
export default function TopBar({
  chapters = [],
  active = null,
  today,
  isArchive = false,
  alwaysShowLogo = false,
  date,
}: {
  chapters?: NavChapter[];
  active?: string | null;
  /** The element "Today" jumps to, on the paper. */
  today?: string;
  isArchive?: boolean;
  /** Pages without the particle masthead show the small wordmark from the start. */
  alwaysShowLogo?: boolean;
  /** Printed in the phone's plain row, where the masthead has no room for it. */
  date?: string;
}) {
  const [scrolledPast, setPastMasthead] = useState(false);
  const pastMasthead = alwaysShowLogo || scrolledPast;
  const paper = chapters.length > 0;

  // Show the compact wordmark once the masthead is out of view.
  useEffect(() => {
    const masthead = document.getElementById("masthead");
    if (!masthead) return;
    const io = new IntersectionObserver(([e]) => setPastMasthead(!e.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    io.observe(masthead);
    return () => io.disconnect();
  }, []);

  const links = paper && today ? [{ id: today, label: "Today" }, ...chapters] : [];

  return (
    <div className={`top-bar z-40 ${paper ? "top-bar-paper" : ""}`}>
      <div className="page-wrap px-4 sm:px-6 flex items-center gap-x-4 h-12 md:h-14">
        {paper && date && <span className="md:hidden font-mono text-[11px] text-ink-soft truncate">{date}</span>}
        <Link
          href="/"
          className={`${paper ? "hidden md:flex" : "flex"} items-center gap-2 shrink-0 transition-all duration-500`}
          style={{
            opacity: pastMasthead ? 1 : 0,
            transform: pastMasthead ? "none" : "translateY(-6px)",
            pointerEvents: pastMasthead ? "auto" : "none",
          }}
          aria-hidden={!pastMasthead}
          tabIndex={pastMasthead ? 0 : -1}
        >
          <span className="grid grid-cols-3 gap-[2px]" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className="w-[3px] h-[3px] rounded-full"
                style={{ background: i === 4 ? "var(--accent)" : "var(--ink)" }}
              />
            ))}
          </span>
          <span className="font-display text-[22px] font-extrabold tracking-tight leading-none pt-0.5">
            The Daily Index
          </span>
        </Link>

        {links.length > 0 && (
          <nav aria-label="Chapters" className="hidden md:flex flex-1 min-w-0 items-center gap-1">
            {links.map((c) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                data-nav={c.id}
                aria-current={active === c.id ? "true" : undefined}
                className={`relative px-2.5 py-1.5 text-[14px] font-sans font-semibold whitespace-nowrap transition-colors ${
                  active === c.id ? "text-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                {c.label}
                {active === c.id && <span aria-hidden="true" className="absolute left-2.5 right-2.5 bottom-0 h-[2px] rounded-full bg-accent" />}
              </a>
            ))}
          </nav>
        )}

        <div className="ml-auto">
          <TopBarTools isArchive={isArchive} />
        </div>
      </div>
    </div>
  );
}
