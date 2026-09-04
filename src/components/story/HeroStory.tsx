"use client";

import { Fragment } from "react";
import type { Story } from "@/lib/types";
import StatCallout from "./StatCallout";
import ClipShareButton from "@/components/extras/ClipShareButton";
import { recordEngagement } from "@/lib/reader-memory";

export default function HeroStory({ story }: { story: Story }) {
  const domId = `story-${story.id}`;
  const [firstParagraph, ...rest] = story.body;
  // Place the pull quote after the second paragraph when there is one,
  // otherwise directly after the lead — it must never be dropped silently.
  const quoteAfterIndex = rest.length > 1 ? 1 : rest.length > 0 ? 0 : -1;

  return (
    <section id={domId} className="pt-6 pb-10 border-b-2 border-ink">
      {/* Editorial accent — short red rule signals the lead without a label */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-[3px] w-14 bg-masthead-red" />
        <span className="font-label text-[10px] text-masthead-red">
          Today&rsquo;s Lead{story.personal ? ` · For you: ${story.personal}` : ""}
        </span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-3">
        <h2 className="font-headline text-4xl sm:text-5xl md:text-[3.5rem] font-bold leading-[1.05] min-w-0 text-balance">
          {story.headline}
        </h2>
        <ClipShareButton targetId={domId} filename={story.id} />
      </div>

      {story.deck && (
        <p className="font-headline text-lg md:text-xl italic font-light text-ink-soft mb-3 leading-snug">
          {story.deck}
        </p>
      )}

      <div className="font-label text-[11px] text-ink-soft flex flex-wrap gap-x-3 gap-y-1 mb-5 border-b hairline pb-4">
        {story.dateline && <span>{story.dateline}</span>}
        {story.sourceName && <span>{story.sourceName}</span>}
        <span className="font-mono normal-case">{story.readTimeMin} min read</span>
        <span className="font-mono normal-case">Updated {story.lastUpdated}</span>
      </div>

      {story.stats && story.stats.length > 0 && <StatCallout stats={story.stats} />}

      <div className="text-[15px] md:text-base leading-relaxed space-y-3 md:max-w-[62ch]">
        <p className="drop-cap">{firstParagraph}</p>
        {quoteAfterIndex === -1 && story.pullQuote && (
          <blockquote className="pull-quote my-5 text-xl md:text-2xl md:float-right md:w-64 md:ml-6 md:mb-2 md:-mr-40">
            {story.pullQuote}
          </blockquote>
        )}
        {rest.map((paragraph, i) => (
          <Fragment key={`${story.id}-frag-${i}`}>
            <p>{paragraph}</p>
            {i === quoteAfterIndex && story.pullQuote && (
              <blockquote className="pull-quote my-5 text-xl md:text-2xl md:float-right md:w-64 md:ml-6 md:mb-2 md:-mr-40">
                {story.pullQuote}
              </blockquote>
            )}
          </Fragment>
        ))}
      </div>

      <div className="clear-both" />
      {story.sourceUrl && (
        <a
          href={story.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordEngagement(story)}
          className="font-label text-[11px] text-masthead-red hover:underline mt-4 inline-block"
        >
          Read full story at {story.sourceName} ↗
        </a>
      )}
    </section>
  );
}
