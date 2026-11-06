"use client";

import { useEffect, useState } from "react";

// How far down the page you are, along the top of the window. On the paper it
// wears the colour of the section being read (--now-hue, set by the menu in
// chrome/PaperNav.tsx); elsewhere the site's accent. On the paper on a phone the
// line along the bottom menu does this job instead (.reading-bar in globals.css).
export default function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const pct = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
      setProgress(pct);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      className="reading-bar fixed top-0 left-0 right-0 h-[3px] z-50 bg-transparent"
      aria-hidden="true"
    >
      <div
        className="h-full transition-[width,background-color] duration-300 ease-out"
        style={{ width: `${progress}%`, background: "var(--now-hue, var(--accent))" }}
      />
    </div>
  );
}
