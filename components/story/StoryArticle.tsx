"use client";

import { Fragment, useState } from "react";
import type { Story } from "@/lib/types";
import StatCallout from "./StatCallout";
import ClipShareButton from "@/components/extras/ClipShareButton";

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
  const canCollapse = !lead && rest.length > 0;
  const [expanded, setExpanded] = useState(lead);

  return (
    <article id={domId} className="py-6 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <h3
          className={
            lead
              ? "font-headline text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight min-w-0"
              : "font-headline text-lg sm:text-xl md:text-2xl font-semibold leading-snug min-w-0"
          }
        >
          {story.headline}
        </h3>
        <ClipShareButton targetId={domId} filename={story.id} />
      </div>

      {story.deck && (
        <p className="text-ink-soft italic mt-1 mb-2 text-sm md:text-base">
          {story.deck}
        </p>
      )}

      <div className="font-label text-[11px] text-ink-soft flex flex-wrap gap-x-3 gap-y-1 mb-3">
        {story.dateline && <span>{story.dateline}</span>}
        <span className="font-mono normal-case">{story.readTimeMin} min read</span>
        <span className="font-mono normal-case">Updated {story.lastUpdated}</span>
      </div>

      {story.stats && story.stats.length > 0 && <StatCallout stats={story.stats} />}

      <div className="text-[15px] md:text-base leading-relaxed space-y-3">
        <p className={lead ? "drop-cap" : undefined}>{firstParagraph}</p>
        {expanded &&
          rest.map((paragraph, i) => (
            <Fragment key={`${story.id}-frag-${i}`}>
              {i === quoteAfterIndex && story.pullQuote && (
                <p className="pull-quote my-4 text-lg">{story.pullQuote}</p>
              )}
              <p>{paragraph}</p>
            </Fragment>
          ))}
      </div>

      <div className="flex items-center gap-4 mt-3 clear-both">
        {canCollapse && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="font-label text-[11px] text-masthead-red hover:underline"
          >
            {expanded ? "Show less ↑" : "Continue reading ↓"}
          </button>
        )}
        {story.sourceUrl && (
          <a
            href={story.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-label text-[11px] text-masthead-red hover:underline"
          >
            Read full story at {story.sourceName} ↗
          </a>
        )}
      </div>
    </article>
  );
}
