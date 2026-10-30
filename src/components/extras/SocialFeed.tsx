"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SocialAnswer, SocialPost } from "@/lib/live/social";
import Ago from "./Ago";

// X and Reddit posts as a list (lib/live/social.ts, /api/social): the
// Grapevine's feeds, IPO chatter, Clutch's transfer window. Read when shown,
// again every 10 minutes and whenever the tab comes back into view, so what
// is on screen is never older than the server's own 10-minute copy. Each post
// carries its platform's mark, and a list can offer an All / X / Reddit filter.

const REFRESH_MS = 10 * 60_000;

/** One /api/social answer, kept current; null until the first arrives. Pass null to read nothing. */
export function useSocial(url: string | null): SocialAnswer | null {
  const [data, setData] = useState<SocialAnswer | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let last = 0;
    const load = () => {
      last = Date.now();
      fetch(url)
        .then((r) => (r.ok ? (r.json() as Promise<SocialAnswer>) : null))
        .then((d) => !cancelled && d && setData(d))
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    const onShow = () => document.visibilityState === "visible" && Date.now() - last > 60_000 && load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [url]);
  return url ? data : null;
}

/** Where a post comes from, in the platform's own mark: X's black tile, Reddit's orange disc. */
export function SourceLogo({ source, size = 14 }: { source: SocialPost["source"]; size?: number }) {
  return source === "x" ? (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="X" className="shrink-0">
      <rect width="24" height="24" rx="5.5" fill="var(--ink)" />
      <path fill="var(--paper)" d="M15.9 5.5h2.2l-4.8 5.5 5.6 7.5h-4.4l-3.5-4.5-4 4.5H4.8l5.1-5.9-5.4-7.1h4.5l3.1 4.1 3.8-4.1Zm-.8 11.7h1.2L8.9 6.8H7.6l7.5 10.4Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="Reddit" className="shrink-0">
      <circle cx="12" cy="12" r="12" fill="#FF4500" />
      <circle cx="5.6" cy="11.7" r="1.7" fill="#fff" />
      <circle cx="18.4" cy="11.7" r="1.7" fill="#fff" />
      <ellipse cx="12" cy="14.2" rx="6.9" ry="4.6" fill="#fff" />
      <circle cx="9.3" cy="13.6" r="1.15" fill="#FF4500" />
      <circle cx="14.7" cy="13.6" r="1.15" fill="#FF4500" />
      <path d="M9.6 16.2c1.5 1 3.3 1 4.8 0" fill="none" stroke="#FF4500" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M12 9.6l1.1-4.1 2.9.7" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16.6" cy="6.3" r="1.35" fill="#fff" />
    </svg>
  );
}

export function SocialItem({ post, compact = false }: { post: SocialPost; compact?: boolean }) {
  return (
    <li className={`grid grid-cols-[1.1rem_minmax(0,1fr)] gap-x-2.5 ${compact ? "py-2.5" : "py-3 first:pt-0 last:pb-0"}`}>
      <span className={compact ? "pt-[1px]" : "pt-[3px]"}>
        <SourceLogo source={post.source} size={compact ? 15 : 17} />
      </span>
      <div className="min-w-0">
        <a href={post.url} target="_blank" rel="noopener noreferrer" className={`group ${compact ? "font-sans text-[13px] leading-snug" : "font-headline text-[1.05rem] leading-snug"}`}>
          <span className="headline-link">{post.title}</span>
        </a>
        {post.text && !compact && <p className="font-body text-[13px] leading-relaxed text-ink-soft mt-1 line-clamp-2">{post.text}</p>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 font-mono text-[10px] text-ink-soft">
          <span className="truncate max-w-[14rem]">{post.where}</span>
          {post.source === "reddit" && post.author && <span className="text-ink-faint truncate max-w-[9rem]">u/{post.author}</span>}
          <span className="text-ink-faint">
            <Ago iso={post.at} />
          </span>
          {post.tags?.map((t) => (
            <span key={t} className="font-label text-[9.5px] text-accent">
              {t}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}

// ---- the source filter -------------------------------------------------------
//
// All, X or Reddit, with how many of each there are. The choice is kept per
// list on this device. A source with nothing right now can't be picked, and a
// kept choice whose source has gone quiet falls back to All (and says so)
// rather than leaving an empty column.

export type SourcePick = "all" | SocialPost["source"];
const PICK_KEY = (key: string) => `daily-index:feed-source:${key}`;

// The kept choice, read as an outside store: the server (and the first paint)
// say "all", the browser then shows what was kept, so the two never disagree.
const PICK_EVENT = "daily-index:feed-source";
const subscribePick = (fn: () => void) => {
  window.addEventListener(PICK_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(PICK_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};

function savedPick(key: string | undefined): SourcePick {
  if (!key) return "all";
  try {
    const saved = window.localStorage.getItem(PICK_KEY(key));
    return saved === "x" || saved === "reddit" ? saved : "all";
  } catch {
    return "all";
  }
}

function useSourcePick(key: string | undefined): [SourcePick, (p: SourcePick) => void] {
  const kept = useSyncExternalStore(subscribePick, () => savedPick(key), () => "all" as SourcePick);
  // Without storage (a private window), the choice still holds for this visit.
  const [local, setLocal] = useState<SourcePick | null>(null);
  const choose = (p: SourcePick) => {
    setLocal(p);
    try {
      if (key) window.localStorage.setItem(PICK_KEY(key), p);
    } catch {}
    window.dispatchEvent(new Event(PICK_EVENT));
  };
  return [local ?? kept, choose];
}

export function SourceFilter({ value, counts, onChange }: { value: SourcePick; counts: Record<SourcePick, number>; onChange: (p: SourcePick) => void }) {
  const options: { id: SourcePick; name: string }[] = [
    { id: "all", name: "All" },
    { id: "x", name: "X" },
    { id: "reddit", name: "Reddit" },
  ];
  return (
    <div role="radiogroup" aria-label="Show posts from" className="inline-flex items-center gap-0.5 rounded-full border hairline p-0.5">
      {options.map((o) => {
        const on = value === o.id;
        const none = o.id !== "all" && counts[o.id] === 0;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${o.name} (${counts[o.id]})`}
            title={none ? `Nothing from ${o.name} right now` : o.id === "all" ? "Both" : `${o.name} only`}
            disabled={none}
            onClick={() => onChange(o.id)}
            className={`h-7 rounded-full px-2.5 flex items-center gap-1.5 font-sans text-[11.5px] font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
              on ? "bg-[var(--card-bg)] text-ink shadow-[inset_0_0_0_1px_var(--ink-faint)]" : "text-ink-soft hover:text-ink"
            }`}
          >
            {o.id === "all" ? "All" : <SourceLogo source={o.id} size={14} />}
            <span className="font-mono text-[10px] tabular-nums text-ink-faint">{counts[o.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The list, with a quiet line for each way it can come back empty. */
export function SocialList({
  data,
  empty,
  compact = false,
  max,
  filterKey,
}: {
  data: SocialAnswer | null;
  /** What to say when everything answered and nothing matched. */
  empty: React.ReactNode;
  compact?: boolean;
  max?: number;
  /** Shows the All / X / Reddit filter, remembering the choice under this name. */
  filterKey?: string;
}) {
  const [pick, setPick] = useSourcePick(filterKey);
  if (!data)
    return (
      <div className="space-y-3 animate-pulse" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 rounded bg-card-bg" />
        ))}
      </div>
    );
  const counts: Record<SourcePick, number> = {
    all: data.posts.length,
    x: data.posts.filter((p) => p.source === "x").length,
    reddit: data.posts.filter((p) => p.source === "reddit").length,
  };
  // A kept choice whose source has nothing now: everything, with a word why.
  const quiet = pick !== "all" && counts[pick] === 0 && counts.all > 0;
  const shown = pick === "all" || quiet ? data.posts : data.posts.filter((p) => p.source === pick);
  const posts = max ? shown.slice(0, max) : shown;
  return (
    <>
      {filterKey && counts.all > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
          <SourceFilter value={quiet ? "all" : pick} counts={counts} onChange={setPick} />
          {quiet && <span className="font-mono text-[10px] text-ink-faint">Nothing from {pick === "x" ? "X" : "Reddit"} right now, so showing all</span>}
        </div>
      )}
      {posts.length === 0 ? (
        <p className="font-body italic text-sm text-ink-soft">
          {data.status === "unconfigured" ? "X feeds aren't wired up yet (RSSHub)." : data.status === "unavailable" ? "The feeds didn't answer this time; they'll be asked again shortly." : empty}
        </p>
      ) : (
        <ul className="divide-y hairline">
          {posts.map((p) => (
            <SocialItem key={p.id} post={p} compact={compact} />
          ))}
        </ul>
      )}
      {data.note && posts.length > 0 && <p className="font-body italic text-xs text-ink-faint mt-3">{data.note}</p>}
    </>
  );
}
