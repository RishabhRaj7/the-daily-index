"use client";

import { useEffect } from "react";

/**
 * Undoes the page's zoom inside a box. On big screens the page and its
 * sheets are zoomed (.page-scale, .sheet-scale), and libraries that measure
 * the pointer against the element's screen box (a canvas chart, a map) then
 * read it off by the zoom. `inner` is sized in real screen pixels to fill
 * `outer`, with the zoom taken back out, so inside it a pixel is a pixel.
 */
export function useUnzoomed(outer: React.RefObject<HTMLElement | null>, inner: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const size = () => {
      const r = o.getBoundingClientRect();
      const z = o.clientWidth ? r.width / o.clientWidth : 1;
      i.style.setProperty("zoom", String(1 / z));
      i.style.setProperty("width", `${r.width}px`);
      i.style.setProperty("height", `${r.height}px`);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(o);
    return () => ro.disconnect();
  }, [outer, inner]);
}
