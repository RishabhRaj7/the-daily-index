"use client";

import { useEffect } from "react";

// One observer for the whole page. Anything marked `data-reveal` gets
// `.is-in` the first time it scrolls into view, and the CSS in globals.css
// does the rest (rise, rule draw, bar grow, stroke draw). New nodes — the
// edition swapping in, the F1 sidebar streaming parts — are picked up by a
// MutationObserver, so components never have to wire this themselves.
export default function MotionRuntime() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveal = (el: Element) => el.classList.add("is-in");

    if (reduced || !("IntersectionObserver" in window)) {
      const all = () => document.querySelectorAll("[data-reveal]:not(.is-in)").forEach(reveal);
      all();
      const mo = new MutationObserver(all);
      mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const seen = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
    };
    scan();

    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scan();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
