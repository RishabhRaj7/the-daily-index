"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import EditionToggle from "@/components/masthead/EditionToggle";
import SettingsLink from "@/components/chrome/SettingsLink";

export interface NavSection {
  id: string;
  label: string;
  hue: string;
}

// The sticky bar. The small wordmark only appears once the big particle one
// has scrolled away; the section links track where the reader is, and the
// underline of the current section slides between links in its colour.
export default function TopBar({
  sections,
  isArchive = false,
  alwaysShowLogo = false,
}: {
  sections: NavSection[];
  isArchive?: boolean;
  /** Pages without the particle masthead show the small wordmark from the start. */
  alwaysShowLogo?: boolean;
}) {
  const [scrolledPast, setPastMasthead] = useState(false);
  const pastMasthead = alwaysShowLogo || scrolledPast;
  const [active, setActive] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number; hue: string } | null>(null);

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

  // Scroll-spy: the section whose top most recently crossed the upper third.
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const onScroll = () => {
      const line = window.innerHeight * 0.33;
      let current: string | null = null;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  // Slide the underline under the active link, and keep it in view on phones.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const link = active ? nav.querySelector<HTMLElement>(`[data-nav="${active}"]`) : null;
    if (!link) {
      // Nothing active (above the first section) — the underline just fades.
      setIndicator((cur) => (cur ? { ...cur, width: 0 } : null));
      return;
    }
    const hue = sections.find((s) => s.id === active)?.hue ?? "var(--accent)";
    setIndicator({ left: link.offsetLeft, width: link.offsetWidth, hue });
    const { scrollLeft, clientWidth } = nav;
    if (link.offsetLeft < scrollLeft || link.offsetLeft + link.offsetWidth > scrollLeft + clientWidth) {
      nav.scrollTo({ left: link.offsetLeft - 16, behavior: "smooth" });
    }
  }, [active, sections]);

  return (
    <div className="sticky top-0 z-40 glass border-b hairline">
      <div className="page-wrap px-4 sm:px-6 flex flex-wrap md:flex-nowrap items-center gap-x-4 md:h-14">
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 h-12 md:h-auto transition-all duration-500"
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

        <nav
          ref={navRef}
          aria-label="Sections"
          className="relative order-last md:order-none basis-full md:basis-auto flex-1 min-w-0 flex items-center gap-1 overflow-x-auto h-10 md:h-auto -mx-2 md:mx-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              data-nav={s.id}
              className={`relative px-2.5 py-1.5 text-[13px] font-sans font-semibold whitespace-nowrap transition-colors ${
                active === s.id ? "text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {s.label}
            </a>
          ))}
          {indicator && (
            <span
              aria-hidden="true"
              className="absolute bottom-0 h-[2px] rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ left: indicator.left + 10, width: Math.max(0, indicator.width - 20), background: indicator.hue }}
            />
          )}
        </nav>

        <div className="flex items-center gap-1 shrink-0 ml-auto md:ml-0">
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
      </div>
    </div>
  );
}
