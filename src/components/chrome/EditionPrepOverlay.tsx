"use client";

import { useEffect, useRef, useState } from "react";
import { cssVar, ParticleField, resolveFontFamily } from "@/lib/particles";

// "Cooking today's edition" — the loading overlay for the content pipeline.
//
// The edition page prints raw RSS snippets from the server, then the client
// sends everything through /api/digest (RSS → collate → AI filter, prioritise
// & summarise). Showing the raw wire text while that runs read as truncated,
// confusing content — so on a cold visit (no cached digest for today) this
// overlay holds the front page until the digest lands, then fades and the
// finished sections are revealed in one go. A genuine AI failure swaps the
// animation for an honest retry; the reader can also choose the raw wires.
//
// The backdrop is translucent — the freshly set (raw) edition ghosts through
// behind a blur, so the wait feels like a sheet coming off the press rather
// than a blank wall. The progress bar is honest about being cosmetic: it
// paces itself toward ~92% while the pipeline works, then snaps to 100% the
// moment the digest actually lands.

const PHRASES: Record<"first-visit" | "refresh", string[]> = {
  "first-visit": [
    "Cooking today's edition…",
    "Reading the overnight wires so you don't have to…",
    "Collating every desk — world, markets, sport, tech…",
    "Asking the desk editor what actually matters today…",
    "Ranking today's stories by your rules…",
    "Setting the type, trimming the fat…",
  ],
  refresh: [
    "Printing a fresh edition…",
    "Caches cleared — re-reading every wire…",
    "Fetching fresh RSS from every desk…",
    "The desk editor is re-prioritising the front page…",
    "Summarising the new wires for your sections…",
    "Folding the new edition…",
  ],
};

const FOOTNOTE: Record<"first-visit" | "refresh", string> = {
  "first-visit":
    "The first visit of the day takes a moment — every wire is read and summarised live.",
  refresh:
    "You asked for a fresh edition — every cache was cleared and every wire is re-read from scratch.",
};

// A swarm of points orbiting while the edition is built; when it lands
// they condense into the wordmark as the overlay lifts.
function PrepSwarm({ leaving }: { leaving: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<ParticleField | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let field: ParticleField;
    try {
      field = new ParticleField(canvas, { gap: 4, dot: 2.2, radius: 80, intro: "scatter", accentShare: 0.12 });
    } catch {
      return;
    }
    fieldRef.current = field;
    const family = resolveFontFamily("font-display");
    let cancelled = false;
    const ready = document.fonts?.load ? document.fonts.load(`800 120px ${family}`) : Promise.resolve();
    ready
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        field.setColors({ ink: cssVar("--ink"), accent: cssVar("--accent") });
        field.resize();
        field.setShape({ lines: ["THE DAILY", "INDEX"], family, weight: 800, leading: 0.9, fill: 0.8 }, false);
        field.setMode("swarm");
      });
    return () => {
      cancelled = true;
      field.destroy();
      fieldRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (leaving) fieldRef.current?.setMode("form");
  }, [leaving]);

  return <canvas ref={ref} aria-hidden="true" className="block w-full h-[220px] sm:h-[280px] [mask-image:radial-gradient(ellipse_at_center,#000_45%,transparent_72%)]" />;
}

// Cosmetic-but-paced progress: eases toward 92% with diminishing steps while
// the pipeline works, snaps to 100 when the overlay is leaving. Never claims
// a fake ETA — the mono label just reads what the bar shows.
function usePrepProgress(active: boolean, leaving: boolean): number {
  const [pct, setPct] = useState(3);

  useEffect(() => {
    if (leaving || !active) return;
    const id = setInterval(() => {
      setPct((p) => {
        if (p >= 92) return 92;
        const ease = Math.max(0.35, (92 - p) * 0.055);
        return Math.min(92, p + ease + Math.random() * 0.55);
      });
    }, 640);
    return () => clearInterval(id);
  }, [active, leaving]);

  return leaving ? 100 : pct;
}

export default function EditionPrepOverlay({
  failed,
  reason,
  leaving,
  date,
  onRetry,
  onSkip,
}: {
  failed: boolean;
  reason: "first-visit" | "refresh";
  leaving: boolean;
  date: string;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const phrases = PHRASES[reason];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const pct = usePrepProgress(!failed, leaving);

  useEffect(() => {
    if (failed) return;
    const id = setInterval(
      () => setPhraseIndex((i) => (i + 1) % phrases.length),
      2600,
    );
    return () => clearInterval(id);
  }, [failed, phrases.length]);

  return (
    <div
      className={`prep-overlay${leaving ? " prep-leaving" : ""} fixed inset-0 z-[80] bg-paper/90 backdrop-blur-xl flex items-center justify-center px-4 py-6 overflow-y-auto`}
      role={failed ? "alertdialog" : "status"}
      aria-live="polite"
      aria-label={failed ? "Edition preparation failed" : "Preparing today's edition"}
    >
      <div className="w-full max-w-xl text-center">
        <div className="flex items-center justify-between font-mono text-[11px] text-ink-soft border-b hairline pb-3">
          <span>THE DAILY INDEX</span>
          <span className="truncate">{date}</span>
        </div>

        {failed ? (
          <div className="py-12">
            <p className="font-display font-extrabold text-[clamp(3rem,10vw,5.5rem)] leading-[0.85]">
              Line&nbsp;dropped
            </p>
            <p className="font-headline italic text-xl mt-5 text-balance">The desk editor hung up on us.</p>
            <p className="text-[15px] text-ink-soft mt-3 leading-relaxed max-w-[44ch] mx-auto">
              The AI pass over today&rsquo;s wires didn&rsquo;t come back. The raw wires are typeset underneath
              whenever you want them.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={onRetry} className="chip chip-signal h-10 px-5">
                ↻ Try again
              </button>
              <button type="button" onClick={onSkip} className="chip h-10 px-5">
                Read the raw wires
              </button>
            </div>
          </div>
        ) : (
          <div className="pt-4">
            <PrepSwarm leaving={leaving} />

            <p
              key={phraseIndex}
              className="prep-line-anim font-headline italic text-xl sm:text-2xl leading-snug min-h-[4rem] mt-2 text-balance"
            >
              {phrases[phraseIndex]}
            </p>

            <div className="mt-6 flex items-end gap-4">
              <span className="font-display font-extrabold text-[3.2rem] leading-[0.8] tabular-nums w-[5.5rem] text-left">
                {Math.floor(pct)}
                <span className="text-ink-faint text-[1.6rem]">%</span>
              </span>
              <div className="flex-1 pb-1.5">
                <div
                  className="relative h-[3px] rounded-full bg-rule overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.floor(pct)}
                  aria-label="Edition preparation progress"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-accent rounded-full"
                    style={{ width: `${pct}%`, transition: leaving ? "width 0.35s ease-out" : "width 0.65s ease-out" }}
                  />
                </div>
                <div className="flex items-center justify-between font-label text-[9px] text-ink-soft mt-2.5">
                  <span>RSS</span>
                  <span className="prep-dot" aria-hidden="true">•</span>
                  <span>AI summary</span>
                  <span className="prep-dot" aria-hidden="true">•</span>
                  <span>Your sections</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="text-[12px] text-ink-soft italic leading-relaxed border-t hairline pt-4 mt-8">
          {FOOTNOTE[reason]}
        </p>
      </div>
    </div>
  );
}
