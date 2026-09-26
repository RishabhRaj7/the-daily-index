"use client";

import { useEffect, useState } from "react";

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

// The little printing press, drawn in SVG: a fixed frame, a spoked roller
// turning, and a sheet that drops out of the roller and gets its headlines
// set line by line (with the sports page in red, of course). All three
// animations share one 4.6s cycle defined in globals.css.
function PressAnimation() {
  return (
    <svg
      viewBox="0 0 300 168"
      className="w-full max-w-[300px] mx-auto text-ink"
      role="img"
      aria-label="A printing press setting today's front page"
    >
      <defs>
        <clipPath id="prep-sheet-clip">
          <rect x="98" y="58" width="104" height="100" />
        </clipPath>
      </defs>

      {/* Frame */}
      <rect x="24" y="14" width="252" height="7" fill="currentColor" />
      <rect x="34" y="21" width="5" height="48" fill="currentColor" opacity="0.85" />
      <rect x="261" y="21" width="5" height="48" fill="currentColor" opacity="0.85" />
      <rect x="24" y="158" width="252" height="5" fill="currentColor" opacity="0.9" />

      {/* Gears flanking the roller */}
      <g className="prep-roller" opacity="0.9">
        <circle cx="58" cy="46" r="11" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <line x1="58" y1="35" x2="58" y2="57" stroke="currentColor" strokeWidth="2.5" />
        <line x1="47" y1="46" x2="69" y2="46" stroke="currentColor" strokeWidth="2.5" />
        <line x1="50.2" y1="38.2" x2="65.8" y2="53.8" stroke="currentColor" strokeWidth="2.5" />
        <line x1="65.8" y1="38.2" x2="50.2" y2="53.8" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="58" cy="46" r="3" fill="currentColor" />
      </g>
      <g className="prep-roller" style={{ animationDirection: "reverse" }} opacity="0.9">
        <circle cx="242" cy="46" r="11" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <line x1="242" y1="35" x2="242" y2="57" stroke="currentColor" strokeWidth="2.5" />
        <line x1="231" y1="46" x2="253" y2="46" stroke="currentColor" strokeWidth="2.5" />
        <line x1="234.2" y1="38.2" x2="249.8" y2="53.8" stroke="currentColor" strokeWidth="2.5" />
        <line x1="249.8" y1="38.2" x2="234.2" y2="53.8" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="242" cy="46" r="3" fill="currentColor" />
      </g>

      {/* Main roller */}
      <g className="prep-roller">
        <circle cx="150" cy="46" r="23" fill="none" stroke="currentColor" strokeWidth="3" />
        <line x1="150" y1="23" x2="150" y2="69" stroke="currentColor" strokeWidth="2.5" />
        <line x1="127" y1="46" x2="173" y2="46" stroke="currentColor" strokeWidth="2.5" />
        <line x1="133.7" y1="29.7" x2="166.3" y2="62.3" stroke="currentColor" strokeWidth="2.5" />
        <line x1="166.3" y1="29.7" x2="133.7" y2="62.3" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="150" cy="46" r="5" fill="currentColor" />
      </g>

      {/* The sheet emerging between the rollers */}
      <g clipPath="url(#prep-sheet-clip)">
        <g className="prep-sheet">
          <rect
            x="105"
            y="60"
            width="90"
            height="96"
            fill="var(--paper)"
            stroke="currentColor"
            strokeWidth="2"
          />
          {/* Headline */}
          <rect className="prep-print" x="115" y="70" width="70" height="7" fill="currentColor" />
          {/* Lead paragraph lines */}
          <rect className="prep-print" style={{ animationDelay: "0.12s" }} x="115" y="84" width="70" height="4" fill="currentColor" opacity="0.75" />
          <rect className="prep-print" style={{ animationDelay: "0.24s" }} x="115" y="92" width="56" height="4" fill="currentColor" opacity="0.75" />
          <rect className="prep-print" style={{ animationDelay: "0.36s" }} x="115" y="100" width="66" height="4" fill="currentColor" opacity="0.75" />
          {/* Sports page, in red */}
          <rect className="prep-print" style={{ animationDelay: "0.48s" }} x="115" y="112" width="48" height="4" fill="var(--masthead-red)" />
          <rect className="prep-print" style={{ animationDelay: "0.6s" }} x="115" y="122" width="62" height="4" fill="currentColor" opacity="0.55" />
          <rect className="prep-print" style={{ animationDelay: "0.72s" }} x="115" y="130" width="40" height="4" fill="currentColor" opacity="0.55" />
          <rect className="prep-print" style={{ animationDelay: "0.84s" }} x="115" y="140" width="70" height="3" fill="var(--masthead-red)" opacity="0.8" />
        </g>
      </g>

      {/* Freshly pressed stack at the base */}
      <rect x="96" y="151" width="108" height="3" fill="currentColor" opacity="0.35" />
      <rect x="104" y="147" width="92" height="3" fill="currentColor" opacity="0.22" />
    </svg>
  );
}

// Cosmetic-but-paced progress: eases toward 92% with diminishing steps while
// the pipeline works, snaps to 100 when the overlay is leaving. Never claims
// a fake ETA — the mono label just reads what the bar shows.
function usePrepProgress(active: boolean, leaving: boolean): number {
  const [pct, setPct] = useState(3);

  useEffect(() => {
    if (leaving) {
      setPct(100);
      return;
    }
    if (!active) return;
    const id = setInterval(() => {
      setPct((p) => {
        if (p >= 92) return 92;
        const ease = Math.max(0.35, (92 - p) * 0.055);
        return Math.min(92, p + ease + Math.random() * 0.55);
      });
    }, 640);
    return () => clearInterval(id);
  }, [active, leaving]);

  return pct;
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
      className={`prep-overlay${leaving ? " prep-leaving" : ""} fixed inset-0 z-[80] bg-paper/75 backdrop-blur-md flex items-center justify-center px-4 py-6 overflow-y-auto`}
      style={{ backgroundImage: "var(--paper-grain)" }}
      role={failed ? "alertdialog" : "status"}
      aria-live="polite"
      aria-label={failed ? "Edition preparation failed" : "Preparing today's edition"}
    >
      {/* The press plate: a solid card on the translucent backdrop, offset
          shadow like a block of type. */}
      <div className="w-full max-w-md bg-paper border-2 border-ink shadow-[10px_12px_0_0_rgba(27,26,23,0.14)]">
        <div className="border-b-2 border-ink px-4 py-2 flex items-center justify-between gap-3">
          <span className="font-headline text-lg font-semibold tracking-tight">
            The Daily Index
          </span>
          <span className="font-label text-[10px] text-ink-soft truncate">{date}</span>
        </div>

        {failed ? (
          <div className="px-6 py-8 text-center">
            {/* Jammed press: torn sheet glyph */}
            <svg viewBox="0 0 96 56" className="w-24 mx-auto mb-4 text-ink" aria-hidden="true">
              <path
                d="M14 8 h44 l6 8 v32 h-50 z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <path d="M58 8 v8 h6" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <line x1="22" y1="22" x2="36" y2="36" stroke="var(--masthead-red)" strokeWidth="3" />
              <line x1="36" y1="22" x2="22" y2="36" stroke="var(--masthead-red)" strokeWidth="3" />
              <line x1="74" y1="26" x2="86" y2="26" stroke="currentColor" strokeWidth="2" opacity="0.6" />
              <line x1="74" y1="34" x2="88" y2="34" stroke="currentColor" strokeWidth="2" opacity="0.6" />
              <line x1="74" y1="42" x2="82" y2="42" stroke="currentColor" strokeWidth="2" opacity="0.6" />
            </svg>
            <p className="font-headline italic text-2xl leading-snug text-balance">
              The desk editor hung up on us.
            </p>
            <p className="text-sm text-ink-soft mt-3 leading-relaxed">
              The AI pass over today&rsquo;s wires didn&rsquo;t come back. The
              raw wires are typeset underneath whenever you want them.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              <button
                type="button"
                onClick={onRetry}
                className="bg-masthead-red text-paper px-4 py-2.5 rounded-full font-label text-[11px] shadow-lg hover:opacity-90 active:scale-95 transition-transform cursor-pointer inline-flex items-center gap-2"
              >
                <span>↻</span>
                <span>Try again</span>
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="font-label text-[11px] text-ink-soft underline hover:text-ink transition-colors"
              >
                Read the raw wires instead
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 pt-5 pb-4">
            <PressAnimation />

            <p
              key={phraseIndex}
              className="prep-line-anim font-headline italic text-lg text-center leading-snug min-h-[3.25rem] mt-3 text-balance"
            >
              {phrases[phraseIndex]}
            </p>

            {/* Progress — paced toward ~92% while the pipeline works, snaps
                to 100 the moment the digest lands (leaving). */}
            <div className="mt-2">
              <div className="flex items-baseline justify-between font-label text-[10px] text-ink-soft mb-1">
                <span>Set in type</span>
                <span className="font-mono normal-case tracking-normal">
                  {Math.floor(pct)}%
                </span>
              </div>
              <div
                className="relative h-2.5 border border-ink/60 bg-card-bg overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.floor(pct)}
                aria-label="Edition preparation progress"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-masthead-red"
                  style={{
                    width: `${pct}%`,
                    transition: leaving
                      ? "width 0.35s ease-out"
                      : "width 0.65s ease-out",
                  }}
                />
                {/* Type-gauge ticks */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to right, transparent 0, transparent calc(10% - 1px), rgba(27,26,23,0.35) calc(10% - 1px), rgba(27,26,23,0.35) 10%)",
                  }}
                  aria-hidden="true"
                />
              </div>
              <div className="flex items-center justify-center gap-2 font-label text-[10px] text-ink-soft mt-2.5">
                <span>RSS</span>
                <span className="prep-dot" aria-hidden="true">•</span>
                <span>AI summary</span>
                <span className="prep-dot" aria-hidden="true">•</span>
                <span>your sections</span>
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-ink-soft italic text-center leading-relaxed border-t hairline px-6 py-3">
          {FOOTNOTE[reason]}
        </p>
      </div>
    </div>
  );
}
