"use client";

import { useState } from "react";
import type { SocialPost, SocialTrends as Trends, XTrend } from "@/lib/live/social";
import { RefreshStamp, SourceLogo, useSocialFeed } from "@/components/extras/SocialFeed";
import { sourceView, useSocialHealth } from "@/lib/social-health";

// Trending on X and Reddit, beside the Search Bar and built like it: India or
// the world, the top five of each (stacked in a half-width column, side by
// side when it has the whole width), twenty on request. A side that keeps
// failing isn't there; with neither, nothing is (lib/social-health.ts). X's list
// is trends24's hourly copy of X's own (with how many of the last 24 hours a
// trend has been on it); Reddit's is r/popular's hot list. Refreshed every five
// minutes while the page is in view, and from its ↻ (lib/live/social.ts,
// socialTrends; Reddit answers one read a minute, in turn).

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
        <span className="font-mono text-[11px] text-ink-soft shrink-0 tabular-nums" title="Posts, and hours of the last day it has been trending">
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
        <span className="block font-mono text-[11px] text-ink-soft mt-0.5 truncate">{p.where}</span>
      </span>
    </li>
  );
}

function Column({ source, title, children }: { source: SocialPost["source"]; title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 pt-3 pb-1">
        <SourceLogo source={source} size={15} />
        <span className="font-label text-[11px] text-ink-soft">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Rows() {
  return (
    <div className="space-y-2.5 py-2.5 animate-pulse" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-6 rounded bg-card-bg" />
      ))}
    </div>
  );
}

export default function SocialTrends({ className = "" }: { className?: string }) {
  const live = useSocialFeed<Trends>("/api/social?kind=trends");
  const data = live.data;
  const { health, now } = useSocialHealth();
  const [region, setRegion] = useState<Region>("india");
  const [all, setAll] = useState(false);

  if (!data) return null;
  // Each side shows, waits quietly while it's still being tried, or isn't there (lib/social-health.ts).
  const xView = sourceView(health.x, !!(data.x.india?.length || data.x.world?.length), data.sources?.x ?? "off", now);
  const rView = sourceView(health.reddit, !!(data.reddit.india?.length || data.reddit.world?.length), data.sources?.reddit ?? "off", now);
  const xList = xView === "show" ? (data.x[region] ?? []) : [];
  const rList = rView === "show" ? (data.reddit[region] ?? []) : [];
  const showX = xView === "wait" || xList.length > 0;
  const showR = rView === "wait" || rList.length > 0;
  if (!showX && !showR) return null;
  const x = xList.slice(0, all ? MANY : FEW);
  const reddit = rList.slice(0, all ? MANY : FEW);
  const longer = Math.max(xList.length, rList.length) > FEW;
  const where = !showR ? "X" : !showX ? "Reddit" : "X and Reddit";

  return (
    <div className={`@container min-w-0 ${className}`} data-reveal>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-3 border-b hairline">
        <div>
          <h3 className="font-display font-extrabold text-[1.9rem] leading-none">Trending on {where}</h3>
          <p className="font-body italic text-xs text-ink-soft mt-0.5">
            What {region === "india" ? "India" : "the world"} is posting about right now
          </p>
        </div>
        <RefreshStamp asOf={data.asOf ?? data.at} busy={live.busy} onRefresh={live.refresh} className="ml-auto" />
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
      {/* Stacked in a half-width column; side by side when there's the room. */}
      <div className="grid gap-x-10 @2xl:grid-cols-2">
        {showX && (
          <Column source="x" title="On X">
            {xView === "wait" ? (
              <Rows />
            ) : (
              <ol className="divide-y hairline">
                {x.map((t, i) => (
                  <XRow key={t.name} t={t} i={i} />
                ))}
              </ol>
            )}
          </Column>
        )}
        {showR && (
          <Column source="reddit" title={region === "india" ? "Hot on Reddit in India" : "Hot on Reddit"}>
            {rView === "wait" ? (
              <Rows />
            ) : (
              <ol className="divide-y hairline">
                {reddit.map((p, i) => (
                  <RedditRow key={p.id} p={p} i={i} />
                ))}
              </ol>
            )}
          </Column>
        )}
      </div>
      {longer && (
        <button type="button" onClick={() => setAll((v) => !v)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-2">
          {all ? "Show the top five ↑" : `Show the top ${MANY} ↓`}
        </button>
      )}
    </div>
  );
}
