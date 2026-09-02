"use client";

import { Fragment } from "react";
import type { Story } from "@/lib/types";
import StatCallout from "./StatCallout";
import ClipShareButton from "@/components/extras/ClipShareButton";

export default function HeroStory({ story }: { story: Story }) {
  const domId = `story-${story.id}`;
  const [firstParagraph, ...rest] = story.body;
  const quoteAfterIndex = Math.min(1, rest.length - 1);

  return (
    <section id={domId} className="pt-6 pb-10 border-b hairline">
      {/* Editorial accent — short red rule signals the lead without a label */}
      <div className="h-[3px] w-14 bg-masthead-red mb-5" />

      <div className="flex items-start justify-between gap-4 mb-3">
        <h2 className="font-headline text-4xl sm:text-5xl md:text-[3.5rem] font-bold leading-[1.05] min-w-0">
          {story.headline}
        </h2>
        <ClipShareButton targetId={domId} filename={story.id} />
      </div>

      {story.deck && (
        <p className="text-lg md:text-xl italic text-ink-soft mb-3 leading-snug">
          {story.deck}
        </p>
      )}

      <div className="font-label text-[11px] text-ink-soft flex flex-wrap gap-x-3 gap-y-1 mb-5 border-b hairline pb-4">
        {story.dateline && <span>{story.dateline}</span>}
        <span className="font-mono normal-case">{story.readTimeMin} min read</span>
        <span className="font-mono normal-case">Updated {story.lastUpdated}</span>
      </div>

      {story.stats && story.stats.length > 0 && (
        <StatCallout stats={story.stats} />
      )}

      <div className="text-[15px] md:text-base leading-relaxed space-y-3">
        <p className="drop-cap">{firstParagraph}</p>
        {rest.map((paragraph, i) => (
          <Fragment key={`${story.id}-frag-${i}`}>
            {i === quoteAfterIndex && story.pullQuote && (
              <p className="pull-quote my-4 text-lg">{story.pullQuote}</p>
            )}
            <p>{paragraph}</p>
          </Fragment>
        ))}
      </div>

      {story.sourceUrl && (
        <a
          href={story.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-label text-[11px] text-masthead-red hover:underline mt-4 inline-block"
        >
          Read full story at {story.sourceName} ↗
        </a>
      )}
    </section>
  );
}
