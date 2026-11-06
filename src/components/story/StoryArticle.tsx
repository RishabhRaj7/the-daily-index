"use client";

import { Fragment, useEffect, useState } from "react";
import type { Story } from "@/lib/types";
import StatCallout from "./StatCallout";
import Ago from "@/components/extras/Ago";
import CoverArt from "./CoverArt";
import StoryOdds from "./StoryOdds";
import CopyTag from "./CopyTag";
import { SECTION_META } from "@/lib/sections";
import ShareButton from "@/components/extras/ShareButton";
import { recordEngagement } from "@/lib/reader-memory";

// One story as a section prints it. From 1024px the whole summary prints with
// its links, and there's nothing to open. On a phone or tablet it shows the
// headline and first lines: a tap on the text or "More" opens the rest in place,
// and so does arriving from the briefing (its link is this story's address). All
// of it is in the page either way; globals.css decides what shows. A section's
// lead has a generated plate beside it only where there's real room for one
// (.story-plate). A paragraph Gemini didn't write is labelled (CopyTag), and when
// there's nothing fit to print the headline stands alone.

const NARROW = "(max-width: 1023.98px)";

export default function StoryArticle({
  story,
  lead = false,
}: {
  story: Story;
  lead?: boolean;
}) {
  const domId = `story-${story.id}`;
  const [firstParagraph, ...rest] = story.body;
  const quoteAfterIndex = Math.min(1, rest.length - 1);
  const [open, setOpen] = useState(false);
  const source = story.sourceName ?? story.dateline;
  const hasMore = Boolean(firstParagraph) || rest.length > 0;

  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${domId}`) setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [domId]);

  const toggle = () => {
    if (!open) recordEngagement(story);
    setOpen(!open);
  };

  return (
    <article id={domId} data-open={open || undefined} className={`group/story story ${lead ? "story-lead" : ""}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0 font-sans text-[12px] mb-1">
          {story.personal && (
            <span className="shrink-0 rounded-full px-2 py-0.5 bg-signal text-signal-ink font-semibold text-[11px] uppercase tracking-wider">
              For you · {story.personal}
            </span>
          )}
          {story.kicker && (
            <span className="font-label text-[11px] shrink-0" style={{ color: "var(--section-hue, var(--accent))" }}>
              {story.kicker}
            </span>
          )}
          {source && <span className="font-semibold text-ink truncate">{source}</span>}
          <span className="text-ink-faint font-mono text-[11px] shrink-0">
            <Ago iso={story.postedAt} fallback={story.lastUpdated} />
            {story.readTimeMin > 1 ? ` · ${story.readTimeMin} min` : ""}
          </span>
          <CopyTag copy={story.copy} />
        </div>

        <h3 className={lead ? "font-headline text-[1.45rem] md:text-[1.75rem] font-medium leading-[1.12] text-balance" : "font-headline text-[1.15rem] md:text-[1.25rem] font-medium leading-[1.2] text-balance"}>
          {story.sourceUrl ? (
            <a
              href={story.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => recordEngagement(story)}
              className="headline-link"
            >
              {story.headline}
            </a>
          ) : (
            <span className="headline-link">{story.headline}</span>
          )}
        </h3>

        {story.deck && <p className="font-headline italic text-ink-soft mt-1.5 text-[15px] leading-snug">{story.deck}</p>}

        {story.stats && story.stats.length > 0 && <div className="mt-2"><StatCallout stats={story.stats} /></div>}

        <div
          className={`story-body mt-1.5 leading-[1.55] space-y-2.5 text-ink/90 ${lead ? "text-[16px]" : "text-[15px]"}`}
          onClick={(e) => {
            // A tap on the cut-off text opens it; links keep their own job.
            if (!open && !(e.target as HTMLElement).closest("a, button") && window.matchMedia(NARROW).matches) toggle();
          }}
        >
          {firstParagraph && <p className={lead ? "drop-cap" : undefined}>{firstParagraph}</p>}
          {story.why && (
            <p className="why-line font-headline italic text-[15px] leading-snug text-ink break-inside-avoid-column">
              <span className="font-label not-italic text-[11px] text-ink-soft block mb-0.5">Why it matters</span>
              {story.why}
            </p>
          )}
          <StoryOdds headline={story.headline} />
          {rest.map((paragraph, i) => (
            <Fragment key={`${story.id}-frag-${i}`}>
              {i === quoteAfterIndex && story.pullQuote && <p className="story-rest pull-quote my-4 text-lg">{story.pullQuote}</p>}
              <p className="story-rest">{paragraph}</p>
            </Fragment>
          ))}
        </div>

        {hasMore && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="story-more items-center gap-1 mt-1 font-sans text-[12px] font-semibold text-ink-soft hover:text-ink"
          >
            {open ? "Less" : "More"}
            <span className="inline-block transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "none" }} aria-hidden="true">
              ↓
            </span>
          </button>
        )}

        {story.sourceUrl && (
          <div className="story-actions flex flex-wrap items-center gap-x-5 gap-y-1 mt-2.5 font-sans text-[12px] font-semibold" data-clip-ignore="true">
            <a
              href={story.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => recordEngagement(story)}
              className="inline-flex items-center gap-1 transition-colors hover:text-ink"
              style={{ color: "var(--section-hue, var(--accent))" }}
            >
              Read at {story.sourceName ?? "source"}
              <span className="transition-transform duration-300 group-hover/story:translate-x-0.5 group-hover/story:-translate-y-0.5" aria-hidden="true">
                ↗
              </span>
            </a>
            <ShareButton story={story} />
          </div>
        )}
      </div>
      {lead && (
        <div className="story-plate bg-card-bg" data-clip-ignore="true">
          <CoverArt seed={story.headline} hue={SECTION_META[story.section]?.hue ?? "var(--accent)"} />
        </div>
      )}
    </article>
  );
}
