"use client";

import { TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import PublisherMark from "@/components/story/PublisherMark";
import type { MarketWhy } from "@/lib/live/market-why";
import type { MarketRegion } from "@/lib/types";

// What today's headlines report moved a region, on a move of 1% or more
// (lib/live/market-why.ts), between its card and its index tiles: the region and its
// move, one sentence, and the story it came from. On a quiet day, or when the
// headlines don't say, nothing shows.

const SMALLEST = 1;

export function useMarketWhy(region: MarketRegion, pct: number): MarketWhy | null {
  const big = Math.abs(pct) >= SMALLEST;
  // One sentence for the day per direction, so the exact figure needn't ask again.
  const key = big ? `${region}:${pct > 0 ? "up" : "down"}` : null;
  const [got, setGot] = useState<{ key: string; why: MarketWhy | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let on = true;
    fetch(`/api/markets/why?region=${encodeURIComponent(region)}&pct=${pct.toFixed(2)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ why: MarketWhy | null }>) : null))
      .then((d) => on && setGot({ key, why: d?.why ?? null }))
      .catch(() => {});
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the figure moves every poll; the sentence doesn't
  }, [key]);
  return got && got.key === key ? got.why : null;
}

export default function MarketWhyLine({ region, pct, why }: { region: MarketRegion; pct: number; why: MarketWhy }) {
  const up = pct >= 0;
  const Glyph = up ? TrendUpIcon : TrendDownIcon;
  const colour = up ? "var(--up)" : "var(--down)";
  return (
    <div className="market-why" style={{ ["--move" as string]: colour }}>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <Glyph size={16} weight="bold" style={{ color: colour }} aria-hidden="true" />
        <span className="font-display font-extrabold uppercase text-[1.45rem] leading-none">{region}</span>
        <span className="font-mono font-semibold text-[13px]" style={{ color: colour }}>
          {up ? "+" : "−"}
          {Math.abs(pct).toFixed(2)}%
        </span>
      </div>
      <p className="font-headline text-[16px] leading-snug [text-wrap:pretty] min-w-0">{why.why}</p>
      <a href={why.url} target="_blank" rel="noreferrer" className="hover:opacity-80 transition-opacity min-w-0">
        <PublisherMark source={why.source} />
      </a>
    </div>
  );
}
