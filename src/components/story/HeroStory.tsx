"use client";

import { Fragment } from "react";
import type { Story } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";
import StatCallout from "./StatCallout";
import ClipShareButton from "@/components/extras/ClipShareButton";
import { recordEngagement } from "@/lib/reader-memory";

// The lead story. Spacing follows one scale — 0.75rem between kicker,
// headline, deck and byline; 1.25rem before the body — so it reads as one
// composed block rather than a stack of loosely related parts.
export default function HeroStory({ story }: { story: Story }) {
  const domId = `story-${story.id}`;
  const [firstParagraph, ...rest] = story.body;
  const quoteAfterIndex = rest.length > 1 ? 1 : rest.length > 0 ? 0 : -1;
  const sectionName = SECTION_META[story.section]?.kicker ?? "";

  return (
    <article id={domId} className="min-w-0">
      {/* Kicker row */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-[3px] w-10 bg-masthead-red shrink-0" />
          <span className="font-label text-[10px] text-masthead-red truncate">
            Today&rsquo;s Lead
            {sectionName ? ` · ${sectionName}` : ""}
            {story.personal ? ` · For you: ${story.personal}` : ""}
          </span>
        </div>
        <ClipShareButton targetId={domId} filename={story.id} />
      </div>

      <h2 className="font-headline text-[2.1rem] sm:text-5xl md:text-[3.25rem] font-bold leading-[1.04] text-balance mb-3">
        {story.headline}
      </h2>

      {story.deck && (
        <p className="font-headline text-lg md:text-xl italic font-light text-ink-soft leading-snug mb-3 max-w-[60ch]">
          {story.deck}
        </p>
      )}

      <div className="font-label text-[10px] text-ink-soft flex flex-wrap items-center gap-x-3 gap-y-1 pb-3 mb-5 border-b hairline">
        {story.sourceName && <span className="text-ink">{story.sourceName}</span>}
        {story.dateline && story.dateline !== story.sourceName && <span>{story.dateline}</span>}
        <span className="font-mono normal-case tracking-normal">{story.readTimeMin} min read</span>
        <span className="font-mono normal-case tracking-normal">Updated {story.lastUpdated}</span>
      </div>

      {story.stats && story.stats.length > 0 && <StatCallout stats={story.stats} />}

      <div className="text-[15px] md:text-[16px] leading-[1.65] space-y-3 max-w-[64ch]">
        <p className="drop-cap">{firstParagraph}</p>
        {quoteAfterIndex === -1 && story.pullQuote && (
          <blockquote className="pull-quote my-5 text-xl">{story.pullQuote}</blockquote>
        )}
        {rest.map((paragraph, i) => (
          <Fragment key={`${story.id}-frag-${i}`}>
            <p>{paragraph}</p>
            {i === quoteAfterIndex && story.pullQuote && (
              <blockquote className="pull-quote my-5 text-xl">{story.pullQuote}</blockquote>
            )}
          </Fragment>
        ))}
      </div>

      {story.sourceUrl && (
        <a
          href={story.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordEngagement(story)}
          className="font-label text-[11px] text-masthead-red hover:underline mt-5 inline-block"
        >
          Read full story at {story.sourceName} ↗
        </a>
      )}
    </article>
  );
}
