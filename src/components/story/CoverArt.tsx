"use client";

import { useEffect, useRef } from "react";
import { cssVar } from "@/lib/particles";

// A halftone "photograph" for stories that come without one. The headline
// seeds a few interfering waves; each grid point becomes a dot sized by the
// wave height, so every story gets its own pattern and the same story always
// gets the same one. The field drifts slowly, and the pointer sends a ripple
// through it. Colour comes from the section hue.

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function CoverArt({
  seed,
  hue = "var(--accent)",
  className = "",
  label,
}: {
  seed: string;
  /** A CSS colour (may be a var()). */
  hue?: string;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rand = mulberry32(hashString(seed));
    // Three waves: two linear, one radial around a seeded focus.
    const waves = [0, 1].map(() => ({
      a: rand() * Math.PI * 2,
      f: 0.008 + rand() * 0.018,
      s: 0.25 + rand() * 0.5,
      p: rand() * Math.PI * 2,
    }));
    const focus = { x: 0.2 + rand() * 0.6, y: 0.2 + rand() * 0.6, f: 0.02 + rand() * 0.03 };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let ink = "#111";
    let tint = "#5200ff";
    const pointer = { x: -1e4, y: -1e4, t: -1e4 };
    const start = performance.now();

    const readColors = () => {
      ink = cssVar("--ink") || ink;
      // Resolve var(--x) hues through a probe so canvas gets a real colour.
      const probe = document.createElement("span");
      probe.style.color = hue;
      document.body.appendChild(probe);
      tint = getComputedStyle(probe).color;
      probe.remove();
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;
      const step = w < 480 ? 9 : 11;
      const maxR = step * 0.5;
      const fx = focus.x * w;
      const fy = focus.y * h;
      const since = (now - pointer.t) / 1000;
      ctx.clearRect(0, 0, w, h);

      // Two passes so each colour is one fill call.
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? ink : tint;
        ctx.globalAlpha = pass === 0 ? 0.9 : 1;
        ctx.beginPath();
        for (let y = step / 2; y < h; y += step) {
          for (let x = step / 2; x < w; x += step) {
            let v = 0;
            for (const wv of waves) {
              v += Math.sin((x * Math.cos(wv.a) + y * Math.sin(wv.a)) * wv.f + wv.p + t * wv.s);
            }
            const d = Math.hypot(x - fx, y - fy);
            v += 1.4 * Math.sin(d * focus.f - t * 0.6);
            // Ripple from the last pointer position, decaying over ~2s.
            if (since < 2.5) {
              const pd = Math.hypot(x - pointer.x, y - pointer.y);
              const front = since * 420;
              const band = Math.exp(-((pd - front) ** 2) / 1800);
              v += band * 2.2 * (1 - since / 2.5);
            }
            const n = (v + 3.4) / 6.8; // ~0..1
            const isTint = n > 0.62;
            if ((pass === 1) !== isTint) continue;
            const r = Math.max(0, Math.min(maxR, maxR * (isTint ? (n - 0.35) * 1.6 : n * 0.95)));
            if (r < 0.6) continue;
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    let last = 0;
    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      // ~30fps is plenty for a drift this slow.
      if (now - last > 32) {
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!reduced && !raf && visible) raf = requestAnimationFrame(loop);
    };

    readColors();
    resize();
    draw(performance.now());
    kick();

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      kick();
    });
    io.observe(canvas);
    const mo = new MutationObserver(() => {
      readColors();
      draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-edition"] });

    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      // New ripple at most every 700ms so it reads as a pulse, not noise.
      if (now - pointer.t < 700) return;
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.t = now;
      if (reduced) draw(now);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onMove);
    const onVis = () => kick();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [seed, hue]);

  return (
    <canvas
      ref={ref}
      className={`block w-full ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
