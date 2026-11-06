"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionRecap } from "@/lib/live/f1-insights";
import { splitFirstSentence } from "@/lib/format";

// The latest race in a line, under the podium on the main page's result card: the
// headline and first sentence from its recap (lib/live/f1-insights.ts), leading to
// the whole of it on the Weekend. Only when it's about the race on the card.

const NEAR_MS = 3 * 86_400_000;

export default function RaceRecapLine({ date }: { date: string }) {
  const [recap, setRecap] = useState<SessionRecap | null>(null);
  useEffect(() => {
    let on = true;
    fetch("/api/f1/insights?latest=race")
      .then((r) => (r.ok ? (r.json() as Promise<{ recap: SessionRecap | null }>) : null))
      .then((d) => on && setRecap(d?.recap ?? null))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  if (!recap || Math.abs(Date.parse(recap.end) - Date.parse(date)) > NEAR_MS) return null;
  return (
    <Link href={`/f1/live?session=${encodeURIComponent(recap.path)}#weekend`} className="group block mt-3 pt-3 pb-1 border-t hairline">
      <div className="font-display font-extrabold lean-title uppercase text-[1.35rem] leading-[0.98] [text-wrap:balance] group-hover:text-[color:var(--hue-f1)] transition-colors">{recap.headline}</div>
      <p className="font-headline text-[14.5px] leading-snug mt-1.5 [text-wrap:pretty]">
        {splitFirstSentence(recap.story)[0]} <ArrowRightIcon size={13} weight="bold" className="inline align-[-2px] text-ink-soft" aria-hidden="true" />
      </p>
    </Link>
  );
}
