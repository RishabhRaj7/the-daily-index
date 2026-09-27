"use client";

import { useEffect, useRef } from "react";
import { cssVar, ParticleField, resolveFontFamily } from "@/lib/particles";

// The masthead, printed in a few thousand points. Move over it and the
// letters come apart around the pointer; press and they scatter harder. A
// click (or tap) re-forms the points into the next shape — the date, the
// issue number, today's temperature — and back to the name.
// On narrow screens a long single line is split in two so it stays big.
function fitLines(lines: string[], width: number): string[] {
  if (lines.length !== 1 || width >= 560) return lines;
  const words = lines[0].split(" ");
  if (words.length < 2 || lines[0].length < 11) return lines;
  const imbalance = (i: number) =>
    Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
  let best = 1;
  for (let i = 2; i < words.length; i++) if (imbalance(i) < imbalance(best)) best = i;
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

export default function ParticleWordmark({
  shapes,
  label,
  className = "",
}: {
  /** Shapes to cycle through on click; the first is the resting wordmark. */
  shapes: string[][];
  /** Accessible name; the canvas itself is decorative. */
  label: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<ParticleField | null>(null);
  const indexRef = useRef(0);
  const shapesRef = useRef(shapes);
  const familyRef = useRef<string>("");

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let field: ParticleField;
    try {
      field = new ParticleField(canvas, {
        gap: window.innerWidth < 640 ? 3 : 4,
        dot: window.innerWidth < 640 ? 1.9 : 2.5,
        radius: window.innerWidth < 640 ? 60 : 110,
        intro: "scatter",
        accentShare: 0.05,
        onFirstForm: () => canvas.parentElement?.classList.add("is-formed"),
      });
    } catch {
      return;
    }
    fieldRef.current = field;

    const applyColors = () =>
      field.setColors({ ink: cssVar("--ink"), accent: cssVar("--accent"), signal: cssVar("--signal") });

    let cancelled = false;
    const family = resolveFontFamily("font-display");
    familyRef.current = family;
    // The display face must be loaded before we rasterise it, or the points
    // would trace the fallback font.
    const ready = document.fonts?.load ? document.fonts.load(`800 120px ${family}`) : Promise.resolve();
    ready
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        applyColors();
        field.resize();
        field.setShape({ lines: fitLines(shapesRef.current[0], canvas.clientWidth), family, weight: 800, leading: 0.92 }, false);
      });

    // Theme flips recolour the points without re-forming them.
    const themeObserver = new MutationObserver(applyColors);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-edition"] });

    const ro = new ResizeObserver(() => field.resize());
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => field.setVisible(entry.isIntersecting));
    io.observe(canvas);

    return () => {
      cancelled = true;
      themeObserver.disconnect();
      ro.disconnect();
      io.disconnect();
      field.destroy();
      fieldRef.current = null;
    };
  }, []);

  const cycle = () => {
    const field = fieldRef.current;
    const list = shapesRef.current;
    if (!field || list.length < 2 || !familyRef.current) return;
    indexRef.current = (indexRef.current + 1) % list.length;
    field.setShape({ lines: fitLines(list[indexRef.current], canvasRef.current?.clientWidth ?? 1000), family: familyRef.current, weight: 800, leading: 0.92 });
  };

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        onClick={cycle}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full cursor-crosshair touch-pan-y"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
