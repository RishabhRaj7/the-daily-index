"use client";

import { useEffect, useState } from "react";
import type { SocialPost, SocialTrends as Trends, XTrend } from "@/lib/live/social";
import { SourceLogo } from "@/components/extras/SocialFeed";

// Trending on X and Reddit, under the Search Bar and built like it: India or
// the world, the top five of each side by side, twenty on request. X's list
// is trends24's hourly copy of X's own (with how many of the last 24 hours a
// trend has been on it); Reddit's is r/popular's hot list. Refreshed every ten
// minutes while the page is open (lib/live/social.ts, socialTrends).

const REFRESH_MS = 10 * 60_000;
const FEW = 5;
const MANY = 20;
type Region = "india" | "world";

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

function Rank({ i }: { i: number }) {
  return <span className="font-display font-extrabold text-[1.35rem] leading-none tabular-nums text-ink-faint">{String(i + 1).padStart(2, "0")}</span>;
}

function XRow({ t, i }: { t: XTrend; i: number }) {
  return (
    <li className="py-2.5 grid grid-cols-[1.8rem_minmax(0,1fr)] gap-x-2 items-baseline">
      <Rank i={i} />
      <span className="flex items-baseline justify-between gap-3 min-w-0">
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-headline text-[1.05rem] leading-snug truncate hover:underline decoration-dotted underline-offset-2">
          {t.name}
        </a>
        <span className="font-mono text-[10px] text-ink-soft shrink-0 tabular-nums" title="Posts, and hours of the last day it has been trending">
          {t.count ? `${compact(t.count)} posts · ` : ""}
          {t.hours >= 24 ? "all day" : `${t.hours}h`}
        </span>
      </span>
    </li>
  );
}

function RedditRow({ p, i }: { p: SocialPost; i: number }) {
  return (
    <li className="py-2.5 grid grid-cols-[1.8rem_minmax(0,1fr)] gap-x-2 items-baseline">
      <Rank i={i} />
      <span className="min-w-0">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-headline text-[1.05rem] leading-snug line-clamp-2 hover:underline decoration-dotted underline-offset-2">
          {p.title}
        </a>
        <span className="block font-mono text-[10px] text-ink-soft mt-0.5 truncate">{p.where}</span>
      </span>
    </li>
  );
}

function Column({ source, title, children, empty }: { source: SocialPost["source"]; title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 pt-3 pb-1">
        <SourceLogo source={source} size={15} />
        <span className="font-label text-[10px] text-ink-soft">{title}</span>
      </div>
      {empty ? <p className="font-body italic text-sm text-ink-soft py-2.5">Didn&rsquo;t answer this time; asked again shortly.</p> : <ol className="divide-y hairline">{children}</ol>}
    </div>
  );
}

export default function SocialTrends() {
  const [data, setData] = useState<Trends | null>(null);
  const [region, setRegion] = useState<Region>("india");
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/social?kind=trends")
        .then((r) => (r.ok ? (r.json() as Promise<Trends>) : null))
        .then((d) => live && d && setData(d))
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  if (!data || (!data.x.india && !data.x.world && !data.reddit.india && !data.reddit.world)) return null;
  const x = (data.x[region] ?? []).slice(0, all ? MANY : FEW);
  const reddit = (data.reddit[region] ?? []).slice(0, all ? MANY : FEW);
  const longer = Math.max(data.x[region]?.length ?? 0, data.reddit[region]?.length ?? 0) > FEW;

  return (
    <div className="mb-12" data-reveal>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-3 border-b hairline">
        <div>
          <h3 className="font-display font-extrabold text-[1.9rem] leading-none">Trending on X and Reddit</h3>
          <p className="font-body italic text-xs text-ink-soft mt-0.5">
            What {region === "india" ? "India" : "the world"} is posting about right now
            {` · ${new Date(data.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Where">
          {(["india", "world"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === region}
              onClick={() => setRegion(r)}
              className="chip h-7 px-3 text-[11.5px]"
              style={r === region ? { background: "var(--section-hue)", borderColor: "var(--section-hue)", color: "var(--paper)" } : undefined}
            >
              {r === "india" ? "India" : "World"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-x-10 md:grid-cols-2">
        <Column source="x" title="On X" empty={!data.x[region]}>
          {x.map((t, i) => (
            <XRow key={t.name} t={t} i={i} />
          ))}
        </Column>
        <Column source="reddit" title={region === "india" ? "Hot on Reddit in India" : "Hot on Reddit"} empty={!data.reddit[region]}>
          {reddit.map((p, i) => (
            <RedditRow key={p.id} p={p} i={i} />
          ))}
        </Column>
      </div>
      {longer && (
        <button type="button" onClick={() => setAll((v) => !v)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-2">
          {all ? "Show the top five ↑" : `Show the top ${MANY} ↓`}
        </button>
      )}
    </div>
  );
}
