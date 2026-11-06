"use client";

import { CaretDownIcon, NewspaperIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RailFrame } from "@/components/chrome/PaperNav";
import TopBar, { type TopBarItem } from "@/components/chrome/TopBar";
import Sheet from "@/components/extras/Sheet";
import { useSavedMenu } from "@/lib/nav-menu";
import { goToView, SUBS, useLiveView, useViews, viewHash, type Sub, type View } from "./live-views";

// The live centre's menu: the paper's menu in the same three forms and the same
// places, listing the centre's own views, with the current one filled in F1 red.
// The first view reads "Live" while a session is on and "Timing" otherwise (useViews).
//   A phone: five icons with words along the foot of the screen, with the line along
//     their top as the reading progress bar (views before this one full, this one
//     filling as you scroll), and a slim row naming the view once the page's heading
//     has gone, with all of them a tap away.
//   A tablet or laptop: Today and the views in the top bar.
//   From 1500px: the side menu, with Analysis's four parts under it, and the evening
//     switch, archive and settings where they are on every page.

const HUE = "var(--hue-f1)";

function useMenuLinks() {
  const { view, sub } = useLiveView();
  // A plain link would make the browser jump to any element with that id.
  const go = (v: View, s?: Sub) => (e: React.MouseEvent) => {
    e.preventDefault();
    goToView(v, s);
  };
  return { view, sub, go };
}

function Dock() {
  const { view, go } = useMenuLinks();
  const VIEWS = useViews();
  const at = VIEWS.findIndex((v) => v.id === view);
  const fill = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const end = document.documentElement.scrollHeight - window.innerHeight;
      if (fill.current) fill.current.style.transform = `scaleX(${end > 0 ? Math.min(1, window.scrollY / end) : 0})`;
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
  }, [at]);

  const columns = { gridTemplateColumns: `repeat(${VIEWS.length}, minmax(0, 1fr))` };
  return (
    <nav aria-label="Views" className="paper-dock" style={columns}>
      <span className="dock-line" style={columns} aria-hidden="true">
        {VIEWS.map((v, i) => (
          <span key={v.id}>
            <span ref={i === at ? fill : undefined} style={i < at ? { transform: "scaleX(1)" } : undefined} />
          </span>
        ))}
      </span>
      {VIEWS.map((v) => {
        const current = view === v.id;
        return (
          <a key={v.id} href={viewHash(v.id)} onClick={go(v.id)} aria-current={current ? "page" : undefined}>
            <v.Glyph size={22} weight={current ? "fill" : "regular"} aria-hidden="true" />
            {v.label}
          </a>
        );
      })}
    </nav>
  );
}

/** The side menu's rows, and the phone's list of them in a sheet. */
function Rows({ onPick }: { onPick?: () => void }) {
  const { view, sub, go } = useMenuLinks();
  const VIEWS = useViews();
  const pick = (v: View, s?: Sub) => (e: React.MouseEvent) => {
    go(v, s)(e);
    onPick?.();
  };
  const hue = { ["--row-hue" as string]: HUE };
  return (
    <>
      <Link href="/" className="rail-row" style={{ ["--row-hue" as string]: "var(--accent)" }}>
        <span className="rail-row-name">
          <NewspaperIcon size={16} className="rail-icon" aria-hidden="true" />
          Today
        </span>
      </Link>
      <div className="rail-group">Live centre</div>
      {VIEWS.map((v) => {
        const current = view === v.id;
        const parent = v.id === "analysis";
        return (
          <div key={v.id}>
            {/* Analysis marks its part below as the current row, and fills its own icon. */}
            <a href={viewHash(v.id, sub)} onClick={pick(v.id)} className="rail-row" style={hue} aria-current={current && !parent ? "page" : undefined}>
              <span className="rail-row-name">
                <v.Glyph size={16} weight={current ? "fill" : "regular"} className="rail-icon" aria-hidden="true" />
                {v.label}
              </span>
            </a>
            {parent &&
              SUBS.map((s) => {
                const on = current && sub === s.id;
                return (
                  <a key={s.id} href={viewHash("analysis", s.id)} onClick={pick("analysis", s.id)} className="rail-row rail-row-sub" style={hue} aria-current={on ? "page" : undefined}>
                    <span className="rail-row-name">
                      <s.Glyph size={14} weight={on ? "fill" : "regular"} className="rail-icon" aria-hidden="true" />
                      {s.label}
                    </span>
                  </a>
                );
              })}
          </div>
        );
      })}
    </>
  );
}

/** The phone's slim row: which view you're in, and the way to any of them. */
function PhoneNow() {
  const { view, sub } = useMenuLinks();
  const VIEWS = useViews();
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const head = document.getElementById("live-head");
    if (!head) return;
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting));
    io.observe(head);
    return () => io.disconnect();
  }, []);

  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  const part = view === "analysis" ? SUBS.find((s) => s.id === sub) : undefined;
  const Glyph = part?.Glyph ?? current.Glyph;
  return (
    <>
      <div className="phone-now" data-shown={shown || undefined}>
        <span className="phone-now-name" style={{ color: HUE }}>
          <Glyph size={18} weight="fill" aria-hidden="true" />
          <span className="truncate">{part?.label ?? current.label}</span>
        </span>
        <button type="button" className="phone-now-all" onClick={() => setOpen(true)} aria-haspopup="dialog">
          Views
          <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <Sheet title="Live centre" onClose={() => setOpen(false)} width={480}>
          <Rows onPick={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}

export default function LiveNav() {
  const menu = useSavedMenu();
  const { view, go } = useMenuLinks();

  // The reading bar and every "you are here" wear F1's colour, as a section's do on the paper.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--now-hue", HUE);
    return () => {
      root.style.removeProperty("--now-hue");
    };
  }, []);

  const VIEWS = useViews();
  const items: TopBarItem[] = [
    { id: "today", label: "Today", href: "/", Glyph: NewspaperIcon, current: false },
    ...VIEWS.map((v) => ({ id: v.id, label: v.label, href: viewHash(v.id), Glyph: v.Glyph, current: view === v.id, onClick: go(v.id) })),
  ];

  return (
    <>
      <TopBar items={items} date={menu.date} alwaysShowLogo />
      <PhoneNow />
      <Dock />
      <RailFrame home="/" date={menu.date} issue={menu.issue} label="Views">
        <Rows />
      </RailFrame>
    </>
  );
}
