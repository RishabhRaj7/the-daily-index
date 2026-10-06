"use client";

import type { Story } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";
import StatCallout from "./StatCallout";
import CoverArt from "./CoverArt";
import ShareButton from "@/components/extras/ShareButton";
import { recordEngagement } from "@/lib/reader-memory";

// The lead story: kicker, a headline sized to its length (a long one never
// runs past about four lines), the standfirst and why it matters, with the
// generated plate beside it. The full story is a click away, so the front
// page carries the news, not the article.

function headlineSize(text: string): string {
  const n = text.length;
  if (n <= 55) return "text-[2.3rem] sm:text-[3rem] lg:text-[3.4rem]";
  if (n <= 85) return "text-[2.1rem] sm:text-[2.6rem] lg:text-[2.9rem]";
  if (n <= 120) return "text-[1.9rem] sm:text-[2.3rem] lg:text-[2.45rem]";
  return "text-[1.7rem] sm:text-[2rem] lg:text-[2.1rem]";
}

export default function HeroStory({ story }: { story: Story }) {
  const domId = `story-${story.id}`;
  const standfirst = story.body[0];
  const meta = SECTION_META[story.section];
  const hue = meta?.hue ?? "var(--accent)";

  return (
    <article
      id={domId}
      className="min-w-0 grid gap-8 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] md:items-start"
      style={{ ["--section-hue" as string]: hue }}
    >
      <div className="min-w-0" data-reveal>
        <div className="font-label text-[11px] flex flex-wrap items-center gap-2 mb-4">
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

        <div className="font-mono text-[11px] text-ink-soft flex flex-wrap items-center gap-x-3 gap-y-1 mt-4">
          {story.sourceName && <span className="text-ink font-medium uppercase">{story.sourceName}</span>}
          {story.dateline && story.dateline !== story.sourceName && <span>{story.dateline}</span>}
          <span>{story.readTimeMin} MIN</span>
          <span>UPDATED {story.lastUpdated.toUpperCase()}</span>
        </div>

        {standfirst && <p className="text-[16px] md:text-[17px] leading-[1.6] text-ink/90 mt-5 pt-5 border-t hairline">{standfirst}</p>}
        {story.why && (
          <p className="why-line font-headline italic text-[17px] leading-snug text-ink mt-4">
            <span className="font-label not-italic text-[9px] text-ink-soft block mb-0.5">Why it matters</span>
            {story.why}
          </p>
        )}
        {story.stats && story.stats.length > 0 && (
          <div className="mt-5">
            <StatCallout stats={story.stats} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-6">
          {story.sourceUrl && (
            <a
              href={story.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => recordEngagement(story)}
              className="chip"
            >
              Read the full story at {story.sourceName}
              <span aria-hidden="true">↗</span>
            </a>
          )}
          <ShareButton story={story} className="chip" />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[6px] bg-card-bg order-first md:order-none" data-reveal="fade">
        <CoverArt seed={story.headline} hue={hue} className="aspect-[16/9] md:aspect-[4/5]" />
        <div className="absolute left-3 bottom-3 flex items-center gap-2 font-mono text-[10px] text-ink-soft glass rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: hue }} />
          FIG. 1 · FROM THE HEADLINE
        </div>
      </div>
    </article>
  );
}
