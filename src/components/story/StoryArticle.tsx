"use client";

import { Fragment, useState } from "react";
import type { Story } from "@/lib/types";
import StatCallout from "./StatCallout";
import ClipShareButton from "@/components/extras/ClipShareButton";
import { recordEngagement } from "@/lib/reader-memory";

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
  const source = story.sourceName ?? story.dateline;

  return (
    <article id={domId} data-reveal className="group/story">
      <div className="flex items-center justify-between gap-3 mb-2.5 min-h-8">
        <div className="flex items-center gap-2 min-w-0 font-sans text-[12px]">
          {story.personal && (
            <span className="shrink-0 rounded-full px-2 py-0.5 bg-signal text-signal-ink font-semibold text-[10px] uppercase tracking-wider">
              For you · {story.personal}
            </span>
          )}
          {source && <span className="font-semibold text-ink truncate">{source}</span>}
          <span className="text-ink-faint font-mono text-[11px] shrink-0">
            {story.lastUpdated}
            {story.readTimeMin > 1 ? ` · ${story.readTimeMin} min` : ""}
          </span>
        </div>
        <ClipShareButton targetId={domId} filename={story.id} />
      </div>

      <h3
        className={
          lead
            ? "font-headline text-[1.9rem] sm:text-[2.4rem] md:text-[2.75rem] font-medium leading-[1.06] text-balance"
            : "font-headline text-[1.3rem] sm:text-[1.45rem] font-medium leading-[1.18] text-balance"
        }
      >
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

      {story.deck && (
        <p className="font-headline italic text-ink-soft mt-2 text-[15px] md:text-base leading-snug">{story.deck}</p>
      )}

      {story.stats && story.stats.length > 0 && <div className="mt-3"><StatCallout stats={story.stats} /></div>}

      <div
        className={`mt-3 leading-[1.62] space-y-3 text-ink/90 ${
          lead ? "text-[16px] md:text-[17px] md:columns-2 md:gap-10" : "text-[15px]"
        }`}
      >
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

      {(canCollapse || story.sourceUrl) && (
        <div className="flex items-center gap-5 mt-3 font-sans text-[12px] font-semibold" data-clip-ignore="true">
          {canCollapse && (
            <button
              onClick={() =>
                setExpanded((e) => {
                  if (!e) recordEngagement(story);
                  return !e;
                })
              }
              className="inline-flex items-center gap-1 text-ink-soft hover:text-ink transition-colors"
              aria-expanded={expanded}
            >
              {expanded ? "Less" : "More"}
              <span
                className="inline-block transition-transform duration-300"
                style={{ transform: expanded ? "rotate(180deg)" : "none" }}
                aria-hidden="true"
              >
                ↓
              </span>
            </button>
          )}
          {story.sourceUrl && (
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
          )}
        </div>
      )}
    </article>
  );
}
