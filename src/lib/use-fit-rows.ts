"use client";

import { useEffect, useRef, useState } from "react";

// A list that fills the height its neighbour gives it: the Search Bar beside
// Trending on X and Reddit, the Pit wall's paddock card beside Paddock Notes'
// stories. The list sits in a box that grows with the row (flex or grid
// stretch) while its rows are laid out absolutely inside it, so the list
// itself never makes the row taller; the rows that fit whole are shown, the
// rest hidden. The box is never shorter than `min` rows (measured), so alone
// (or on a phone) the list keeps its usual length.
//
// Rows are the box's descendants marked `data-fit-row`. With `media`, it
// fills only while that query matches (the wide layout); otherwise `min`.
//
// Measured in the page's own pixels: on big screens the page is zoomed
// (.page-scale), and the rows' screen boxes carry that zoom while the box's
// height doesn't, so the zoom is taken back out (it had shown 6 where 8 fit).

export function useFitRows(min: number, deps: unknown[], enabled = true, media?: string): { box: React.RefObject<HTMLDivElement | null>; fit: number; minHeight: number | undefined } {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(min);
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = box.current;
    if (!el || !enabled) return;
    const measure = () => {
      if (media && !window.matchMedia(media).matches) {
        setMinHeight(undefined);
        setFit(min);
        return;
      }
      const rows = [...el.querySelectorAll<HTMLElement>("[data-fit-row]")];
      if (!rows.length) return;
      const r0 = el.getBoundingClientRect();
      // The page's zoom here: the box's screen height over its own height.
      const z = el.offsetHeight > 0 && r0.height > 0 ? r0.height / el.offsetHeight : 1;
      const bottoms = rows.map((r) => (r.getBoundingClientRect().bottom - r0.top) / z);
      const base = Math.ceil(bottoms[Math.min(min, rows.length) - 1]);
      setMinHeight((h) => (h !== undefined && Math.abs(h - base) < 1 ? h : base));
      let n = 0;
      while (n < rows.length && bottoms[n] <= el.clientHeight + 1) n++;
      const next = Math.max(Math.min(min, rows.length), n);
      setFit((f) => (f === next ? f : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The row's height comes from the neighbour: follow it too.
    if (el.parentElement?.parentElement) ro.observe(el.parentElement.parentElement);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, enabled, media, ...deps]);
  return { box, fit, minHeight };
}
