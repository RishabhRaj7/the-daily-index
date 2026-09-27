"use client";

import { Fragment } from "react";
import type { Story } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";
import StatCallout from "./StatCallout";
import CoverArt from "./CoverArt";
import ClipShareButton from "@/components/extras/ClipShareButton";
import { recordEngagement } from "@/lib/reader-memory";

// The lead story, set like a magazine cover story: a generated halftone
// plate, then a centred kicker, a big headline and the deck, and the body
// in two columns underneath.
export default function HeroStory({ story }: { story: Story }) {
  const domId = `story-${story.id}`;
  const [firstParagraph, ...rest] = story.body;
  const quoteAfterIndex = rest.length > 1 ? 1 : rest.length > 0 ? 0 : -1;
  const meta = SECTION_META[story.section];
  const hue = meta?.hue ?? "var(--accent)";

  return (
    <article id={domId} className="min-w-0" style={{ ["--section-hue" as string]: hue }}>
      <div className="relative overflow-hidden rounded-[6px] bg-card-bg" data-reveal="fade">
        <CoverArt seed={story.headline} hue={hue} className="aspect-[16/9] md:aspect-[2/1]" />
        <div className="absolute left-3 bottom-3 flex items-center gap-2 font-mono text-[10px] text-ink-soft glass rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: hue }} />
          FIG. 1 · PATTERN GENERATED FROM THE HEADLINE
        </div>
        <div className="absolute right-2 top-2 glass rounded-full">
          <ClipShareButton targetId={domId} filename={story.id} />
        </div>
      </div>

      <div className="text-center max-w-[46rem] mx-auto pt-7" data-reveal>
        <div className="font-label text-[11px] flex items-center justify-center gap-2 mb-4">
          <span style={{ color: hue }}>Today&rsquo;s lead</span>
          {meta && (
            <>
              <span className="text-ink-faint">/</span>
              <span className="text-ink-soft">{meta.kicker}</span>
            </>
          )}
          {story.personal && (
            <span className="rounded-full px-2 py-0.5 bg-signal text-signal-ink text-[10px]">For you · {story.personal}</span>
          )}
        </div>

        <h2 className="font-headline font-normal text-[2.3rem] sm:text-[3.1rem] md:text-[3.7rem] leading-[1.02] tracking-[-0.022em] text-balance">
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
            story.headline
          )}
        </h2>

        {story.deck && (
          <p className="font-headline italic text-lg md:text-xl text-ink-soft leading-snug mt-4 text-balance">
            {story.deck}
          </p>
        )}

        <div className="font-mono text-[11px] text-ink-soft flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-5">
          {story.sourceName && <span className="text-ink font-medium uppercase">{story.sourceName}</span>}
          {story.dateline && story.dateline !== story.sourceName && <span>{story.dateline}</span>}
          <span>{story.readTimeMin} MIN</span>
          <span>UPDATED {story.lastUpdated.toUpperCase()}</span>
        </div>
      </div>

      <div className="mt-8 pt-7 border-t hairline" data-reveal>
        {story.stats && story.stats.length > 0 && (
          <div className="mb-6">
            <StatCallout stats={story.stats} />
          </div>
        )}
        <div className="text-[16px] md:text-[17px] leading-[1.65] md:columns-2 md:gap-10 space-y-3 text-ink/90">
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
            className="chip mt-6"
          >
            Read the full story at {story.sourceName}
            <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </article>
  );
}
