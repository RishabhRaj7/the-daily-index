"use client";

import { ArrowSquareOutIcon, ClockIcon, LightbulbIcon, StarIcon } from "@phosphor-icons/react";
import PublisherMark from "./PublisherMark";
import type { Story } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";
import StatCallout from "./StatCallout";
import Ago from "@/components/extras/Ago";
import CoverArt from "./CoverArt";
import CopyTag from "./CopyTag";
import ShareButton from "@/components/extras/ShareButton";
import { recordEngagement } from "@/lib/reader-memory";

// The lead story: kicker, a headline sized to its length (a long one never
// runs past about four lines), the standfirst and why it matters, with the
// generated plate beside it from 1024px (on a phone or tablet the plate is left
// out). The full story is a click away, so the front
// page carries the news, not the article. A paragraph Gemini didn't write is
// labelled (CopyTag), though format.ts only leads with one when nothing else
// is written.

function headlineSize(text: string): string {
  const n = text.length;
  if (n <= 55) return "text-[2rem] sm:text-[2.6rem] lg:text-[2.8rem]";
  if (n <= 85) return "text-[1.85rem] sm:text-[2.3rem] lg:text-[2.4rem]";
  if (n <= 120) return "text-[1.7rem] sm:text-[2.05rem] lg:text-[2.1rem]";
  return "text-[1.55rem] sm:text-[1.85rem] lg:text-[1.85rem]";
}

export default function HeroStory({ story }: { story: Story }) {
  const domId = `story-${story.id}`;
  const standfirst = story.body[0];
  const meta = SECTION_META[story.section];
  const hue = meta?.hue ?? "var(--accent)";

  return (
    <article
      id={domId}
      className="min-w-0 h-full grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
      style={{ ["--section-hue" as string]: hue }}
    >
      {/* The column runs the Briefing's full height: the actions sit at its
          foot and the plate beside it stretches to match. */}
      <div className="min-w-0 flex flex-col" data-reveal>
        <div className="font-label text-[11px] flex flex-wrap items-center gap-2 mb-2.5">
          <span style={{ color: hue }}>Today&rsquo;s lead</span>
          {meta && (
            <>
              <span className="text-ink-faint">/</span>
              <span className="text-ink-soft">{meta.kicker}</span>
            </>
          )}
          {story.personal && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-signal text-signal-ink text-[11px]">
              <StarIcon size={11} weight="fill" aria-hidden="true" />
              {story.personal}
            </span>
          )}
          <CopyTag copy={story.copy} />
        </div>

        <h2 className={`font-headline font-normal leading-[1.04] tracking-[-0.02em] text-balance ${headlineSize(story.headline)}`}>
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

        {story.deck && <p className="font-headline italic text-lg md:text-xl text-ink-soft leading-snug mt-3">{story.deck}</p>}

        <div className="font-mono text-[11px] text-ink-soft flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5">
          {story.sourceName && <PublisherMark source={story.sourceName} size={18} className="font-sans font-semibold text-[13px] text-ink" />}
          {story.dateline && story.dateline !== story.sourceName && <span>{story.dateline}</span>}
          <span className="inline-flex items-center gap-1">
            <ClockIcon size={13} aria-hidden="true" />
            {story.readTimeMin} min
          </span>
          <Ago iso={story.postedAt} fallback={story.lastUpdated} />
        </div>

        {standfirst && (
          <p className="text-[16px] leading-[1.55] text-ink/90 mt-3 pt-3 border-t hairline">{standfirst}</p>
        )}
        {story.why && (
          <p className="why-line font-headline italic text-[17px] leading-snug text-ink mt-4">
            <span className="font-label not-italic text-[11px] text-ink-soft mb-0.5 flex items-center gap-1">
              <LightbulbIcon size={13} aria-hidden="true" />
              Why it matters
            </span>
            {story.why}
          </p>
        )}
        {story.stats && story.stats.length > 0 && (
          <div className="mt-5">
            <StatCallout stats={story.stats} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-auto pt-4">
          {story.sourceUrl && (
            <a
              href={story.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => recordEngagement(story)}
              className="chip"
            >
              Read the full story
              <ArrowSquareOutIcon size={14} aria-hidden="true" />
            </a>
          )}
          <ShareButton story={story} className="chip" />
        </div>
      </div>

      {/* Only where there's room beside the lead: a phone or tablet goes straight to the news. */}
      <div className="hidden lg:block relative overflow-hidden rounded-[6px] bg-card-bg min-h-[320px]" data-reveal="fade">
        <CoverArt seed={story.headline} hue={hue} className="absolute inset-0 h-full" />
        <div className="absolute left-3 bottom-3 flex items-center gap-2 font-mono text-[11px] text-ink-soft glass rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: hue }} />
          FIG. 1 · FROM THE HEADLINE
        </div>
      </div>
    </article>
  );
}
