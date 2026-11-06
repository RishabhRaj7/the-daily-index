"use client";

import { CaretDownIcon, ArrowSquareOutIcon, ClockIcon, LightbulbIcon, StarIcon } from "@phosphor-icons/react";
import { Fragment, useEffect, useState } from "react";
import type { Story } from "@/lib/types";
import { splitFirstSentence } from "@/lib/format";
import StatCallout from "./StatCallout";
import Ago from "@/components/extras/Ago";
import CoverArt from "./CoverArt";
import StoryOdds from "./StoryOdds";
import CopyTag from "./CopyTag";
import PublisherMark from "./PublisherMark";
import { SECTION_META } from "@/lib/sections";
import ShareButton from "@/components/extras/ShareButton";
import { recordEngagement } from "@/lib/reader-memory";

// One story as a section prints it. Its foot says who published it and when, and
// holds its tools, on one row: the publisher's logo and name link to the original,
// beside the share icon. From 1024px the whole summary prints and there's nothing
// to open. On a phone or tablet it shows the headline and the summary's first
// sentence, whole: a tap on the text or the caret opens the rest in place, and so
// does arriving from the briefing (its link is this story's address). All of it is
// in the page either way; globals.css decides what shows. A section's lead has a
// generated plate beside it only where there's real room for one (.story-plate).
// A paragraph Gemini didn't write is labelled (CopyTag), and when there's nothing
// fit to print the headline stands alone.

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
  const [firstSentence, afterIt] = splitFirstSentence(firstParagraph ?? "");
  const hasMore = Boolean(afterIt) || rest.length > 0 || Boolean(story.why);

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
  const hasTop = Boolean(story.personal || story.kicker || story.copy === "pending" || story.copy === "wire");

  return (
    <article id={domId} data-open={open || undefined} className={`group/story story ${lead ? "story-lead" : ""}`}>
      <div className="min-w-0 flex flex-col">
        {hasTop && (
          <div className="flex items-center gap-2 min-w-0 mb-1">
            {story.personal && (
              <span className="inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 bg-signal text-signal-ink font-sans font-semibold text-[11px] uppercase tracking-wider">
                <StarIcon size={11} weight="fill" aria-hidden="true" />
                {story.personal}
              </span>
            )}
            {story.kicker && (
              <span className="font-label text-[11px] shrink-0" style={{ color: "var(--section-hue, var(--accent))" }}>
                {story.kicker}
              </span>
            )}
            <CopyTag copy={story.copy} />
          </div>
        )}

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
            // A tap on the shortened text opens it; links keep their own job.
            if (!open && !(e.target as HTMLElement).closest("a, button") && window.matchMedia(NARROW).matches) toggle();
          }}
        >
          {firstParagraph && (
            <p className={lead ? "drop-cap" : undefined}>
              {firstSentence}
              {afterIt && <span className="story-after"> {afterIt}</span>}
            </p>
          )}
          {story.why && (
            <p className="why-line font-headline italic text-[15px] leading-snug text-ink break-inside-avoid-column">
              <span className="font-label not-italic text-[11px] text-ink-soft mb-0.5 flex items-center gap-1">
                <LightbulbIcon size={13} aria-hidden="true" />
                Why it matters
              </span>
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

        <div className="story-foot" data-clip-ignore="true">
          <span className="flex items-center gap-2 min-w-0 flex-1">
            {source &&
              (story.sourceUrl ? (
                <a
                  href={story.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => recordEngagement(story)}
                  className="story-source"
                  title={`Read it at ${source}`}
                >
                  <PublisherMark source={source} />
                  <ArrowSquareOutIcon size={13} className="shrink-0 opacity-70" aria-hidden="true" />
                </a>
              ) : (
                <PublisherMark source={source} className="story-source" />
              ))}
            <span className="text-ink-soft font-mono text-[11px] whitespace-nowrap shrink-0">
              <Ago iso={story.postedAt} fallback={story.lastUpdated} />
            </span>
            {story.readTimeMin > 1 && (
              <span className="hidden sm:inline-flex items-center gap-0.5 text-ink-soft font-mono text-[11px] shrink-0">
                <ClockIcon size={12} aria-hidden="true" />
                {story.readTimeMin}m
              </span>
            )}
          </span>
          <span className="flex items-center gap-0.5 shrink-0">
            <ShareButton story={story} iconOnly />
            {hasMore && (
              <button type="button" onClick={toggle} aria-expanded={open} aria-label={open ? "Show less of this story" : "Show the rest of this story"} className="story-more icon-btn">
                <CaretDownIcon size={16} weight="bold" className="transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "none" }} aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
      </div>
      {lead && (
        <div className="story-plate bg-card-bg" data-clip-ignore="true">
          <CoverArt seed={story.headline} hue={SECTION_META[story.section]?.hue ?? "var(--accent)"} />
        </div>
      )}
    </article>
  );
}
