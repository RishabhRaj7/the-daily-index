"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SocialAnswer, SocialPost, SocialSource, SourceState } from "@/lib/live/social";
import { isPaused, pausedSources, readHealth, report, RETRY_AFTER_MS, SOCIAL_RETRY_EVENT, sourceView, useSocialHealth } from "@/lib/social-health";
import { useFitRows } from "@/lib/use-fit-rows";
import Ago from "./Ago";
import { loadPersonalization, PERSONALIZATION_CHANGED_EVENT, savePersonalization } from "@/lib/personalization";
import Sheet from "./Sheet";

// X and Reddit posts as a list (lib/live/social.ts, /api/social): the
// Grapevine's feeds, IPO chatter, Clutch's transfer window. Read when shown,
// again every five minutes while the page is in view and whenever the tab
// comes back, and at once from the list's ↻ (which asks the server for copies
// newer than a minute; Reddit still answers one read a minute, in turn). A
// feed with nothing yet, waiting its turn with Reddit, is asked again after
// half a minute. Each post
// carries its platform's mark, and a list can offer an All / X / Reddit filter.
// A list shows the few that fit; "See all" opens the rest in the paper's sheet
// (or, inside a sheet already, unfolds them in place). A source that keeps
// failing is paused and its posts hidden (lib/social-health.ts); a list with
// nothing to show isn't there at all, so a failure never shows on the page.

const REFRESH_MS = 5 * 60_000;
const WAITING_RETRY_MS = 30_000;

export interface SocialFeed<T> {
  data: T | null;
  /** Read again now, asking the server for copies newer than a minute. */
  refresh: () => void;
  busy: boolean;
}

type Shape = { waiting?: boolean; sources?: Partial<Record<SocialSource, SourceState>> };

/**
 * A source that failed this time keeps what it showed last time: a list
 * never blanks on one bad read. Lists (posts) keep that source's posts; the
 * trends keep that side's lists.
 */
function keepFailed<T extends Shape>(prev: T | null, next: T): T {
  if (!prev) return next;
  const failed = (["x", "reddit"] as const).filter((src) => next.sources?.[src] === "failed");
  if (!failed.length) return next;
  const p = prev as unknown as Record<string, unknown>;
  const n = next as unknown as Record<string, unknown>;
  if (Array.isArray(n.posts) && Array.isArray(p.posts)) {
    const posts = n.posts as SocialPost[];
    const kept = (p.posts as SocialPost[]).filter((x) => failed.includes(x.source) && !posts.some((y) => y.id === x.id));
    return kept.length ? ({ ...next, posts: [...posts, ...kept] } as T) : next;
  }
  const out: Record<string, unknown> = { ...n };
  for (const src of failed) {
    const was = p[src] as Record<string, unknown> | undefined;
    const now = n[src] as Record<string, unknown> | undefined;
    if (was && now) out[src] = Object.fromEntries(Object.entries(now).map(([k, v]) => [k, v ?? was[k] ?? null]));
  }
  return out as T;
}

/**
 * Any /api/social answer (a list, or the trends), kept current: on show,
 * every five minutes while in view, on coming back to the tab, on refresh(),
 * after half a minute while the answer says a feed is waiting its turn, and
 * when the reader presses "Try again". Each answer tells lib/social-health.ts
 * how X and Reddit fared: a failing source is asked again after a minute,
 * then three, and after three failures is paused for an hour (not asked:
 * &skip=). Null until the first arrives; a null url reads nothing.
 */
export function useSocialFeed<T extends Shape>(url: string | null): SocialFeed<T> {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let last = 0;
    let retry: number | undefined;
    let waits = 0;
    const load = (fresh = false) => {
      if (document.visibilityState === "hidden" && !fresh) return;
      window.clearTimeout(retry);
      const skip = pausedSources();
      // Both paused: nothing to ask until a pause runs out (or "Try again").
      if (skip.length === 2) return setBusy(false);
      last = Date.now();
      const q = `${fresh ? "&fresh=1" : ""}${skip.length ? `&skip=${skip.join(",")}` : ""}`;
      fetch(`${url}${q}`)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
        .catch(() => null)
        .then((d) => {
          if (cancelled) return;
          // No answer at all: what's shown stays; both sources count it.
          const states: Record<SocialSource, SourceState> = d
            ? { x: d.sources?.x ?? "off", reddit: d.sources?.reddit ?? "off" }
            : { x: skip.includes("x") ? "off" : "failed", reddit: skip.includes("reddit") ? "off" : "failed" };
          if (d) setData((prev) => keepFailed(prev, d));
          report("x", states.x);
          report("reddit", states.reddit);
          // Waiting for Reddit's turn: ask again shortly (a few times), not in five minutes.
          if (d?.waiting && waits++ < 6) retry = window.setTimeout(() => load(), WAITING_RETRY_MS);
          else {
            // Failing but not yet paused: again after a minute, then three.
            const h = readHealth();
            const failing = (["x", "reddit"] as const).filter((src) => states[src] === "failed" && !isPaused(h[src]));
            const fails = Math.max(0, ...failing.map((src) => h[src].fails));
            if (failing.length && fails > 0) retry = window.setTimeout(() => load(), RETRY_AFTER_MS[Math.min(fails, RETRY_AFTER_MS.length) - 1]);
          }
        })
        .finally(() => !cancelled && setBusy(false));
    };
    load(nonce > 0);
    const id = window.setInterval(() => load(), REFRESH_MS);
    const onShow = () => document.visibilityState === "visible" && Date.now() - last > 60_000 && load();
    const onRetry = () => load(true);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener(SOCIAL_RETRY_EVENT, onRetry);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearTimeout(retry);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener(SOCIAL_RETRY_EVENT, onRetry);
    };
  }, [url, nonce]);
  return {
    data: url ? data : null,
    busy,
    refresh: () => {
      setBusy(true);
      setNonce((n) => n + 1);
    },
  };
}

/** One /api/social list, kept current (useSocialFeed without the refresh control). */
export function useSocial(url: string | null): SocialAnswer | null {
  return useSocialFeed<SocialAnswer>(url).data;
}

const minuteTick = (fn: () => void) => {
  const t = setInterval(fn, 30_000);
  return () => clearInterval(t);
};

/** "Updated 3m ago" and a ↻ that reads the list again; spins while it does. */
export function RefreshStamp({ asOf, busy, onRefresh, className = "" }: { asOf?: string | null; busy: boolean; onRefresh: () => void; className?: string }) {
  const now = useSyncExternalStore(minuteTick, () => Math.floor(Date.now() / 30_000), () => 0) * 30_000;
  const at = asOf ? Date.parse(asOf) : NaN;
  const mins = now && Number.isFinite(at) ? Math.max(0, Math.round((now - at) / 60_000)) : null;
  const label = mins === null ? "" : mins < 1 ? "Updated just now" : mins < 60 ? `Updated ${mins}m ago` : `Updated ${Math.floor(mins / 60)}h ago`;
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-faint ${className}`}>
      {label && <span>{label}</span>}
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        className="w-6 h-6 rounded-full grid place-items-center text-ink-soft hover:text-ink hover:bg-[var(--card-bg)] disabled:opacity-60"
        aria-label="Refresh"
        title="Read it again now"
      >
        <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13.5 8a5.5 5.5 0 1 1-1.7-4" />
          <path d="M13.5 2.5v3h-3" />
        </svg>
      </button>
    </span>
  );
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

export function SocialItem({ post, compact = false, clamp = false, hidden = false }: { post: SocialPost; compact?: boolean; /** A small card: three lines, the whole post on hover. */ clamp?: boolean; /** Laid out but not shown (a list filling a height). */ hidden?: boolean }) {
  return (
    <li data-fit-row aria-hidden={hidden || undefined} className={`grid grid-cols-[1.1rem_minmax(0,1fr)] gap-x-2.5 ${compact ? "py-2.5" : "py-3 first:pt-0 last:pb-0"} ${hidden ? "max-lg:hidden invisible" : ""}`}>
      <span className={compact ? "pt-[1px]" : "pt-[3px]"}>
        <SourceLogo source={post.source} size={compact ? 15 : 17} />
      </span>
      <div className="min-w-0">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          title={clamp ? post.title : undefined}
          className={`group ${compact ? "font-sans text-[13px] leading-snug" : "font-headline text-[1.05rem] leading-snug"} ${clamp ? "line-clamp-3" : ""}`}
        >
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
// list in personalization (feedSources), so sync carries it to the reader's
// other devices. A source with nothing right now can't be picked, and a
// kept choice whose source has gone quiet falls back to All rather than
// leaving an empty column. With only one source there, it isn't shown.

export type SourcePick = "all" | SocialPost["source"];
const PICK_KEY = (key: string) => `daily-index:feed-source:${key}`;

// The kept choice, read as an outside store: the server (and the first paint)
// say "all", the browser then shows what was kept, so the two never disagree.
// It follows a change made here, in another tab, or arriving by sync.
const subscribePick = (fn: () => void) => {
  window.addEventListener(PERSONALIZATION_CHANGED_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(PERSONALIZATION_CHANGED_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};

function savedPick(key: string | undefined): SourcePick {
  if (!key) return "all";
  try {
    const synced = loadPersonalization().feedSources?.[key];
    if (synced) return synced;
    // A choice made before it synced, kept on this device only.
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
    if (!key) return setLocal(p);
    try {
      const was = loadPersonalization();
      savePersonalization({ ...was, feedSources: { ...was.feedSources, [key]: p } });
      window.localStorage.removeItem(PICK_KEY(key));
      // Saved: the kept choice (and a later one arriving by sync) shows.
      setLocal(null);
    } catch {
      setLocal(p);
    }
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

/**
 * What of a list shows, given how X and Reddit are doing: the posts of the
 * sources not paused, and whether the list shows ("show"), holds a quiet
 * placeholder while it's still being tried ("wait"), or isn't there at all
 * ("hide": nothing to show, or its sources failed). A list never says it
 * failed; it just isn't there.
 */
export function useSocialView(data: SocialAnswer | null): { posts: SocialPost[]; view: "show" | "wait" | "hide" } {
  const { health, now } = useSocialHealth();
  const posts = (data?.posts ?? []).filter((p) => !isPaused(health[p.source], now));
  if (posts.length) return { posts, view: "show" };
  const views = (["x", "reddit"] as const).map((src) => sourceView(health[src], false, data ? (data.sources?.[src] ?? "off") : undefined, now));
  return { posts, view: views.includes("wait") ? "wait" : "hide" };
}

/** The quiet placeholder a list shows while it's first read. */
export function SocialSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 rounded bg-card-bg" />
      ))}
    </div>
  );
}

/** The list: nothing at all when there's nothing to show (see useSocialView). */
export function SocialList({
  data,
  compact = false,
  max,
  filterKey,
  more,
  refresh,
  filterInSheet = false,
  fill,
}: {
  data: SocialAnswer | null;
  compact?: boolean;
  max?: number;
  /** Shows the All / X / Reddit filter, remembering the choice under this name. */
  filterKey?: string;
  /** Past `max`: open the rest in a sheet with this title, or unfold them in place ("inline", for a list already inside a sheet). */
  more?: { title: string; kicker?: string } | "inline";
  /** The list's ↻ and "updated" time (from useSocialFeed). */
  refresh?: { refresh: () => void; busy: boolean };
  /** A small card: the filter only in the "See all" sheet, the list itself always All. */
  filterInSheet?: boolean;
  /**
   * Fill the height the card is given (from `lg`): as many of `max` as fit,
   * `min` at least, each clamped to three lines (lib/use-fit-rows.ts). The
   * card's parent sets the height; below `lg` it shows `min`.
   */
  fill?: { min: number };
}) {
  const [kept, setPick] = useSourcePick(filterKey);
  const pick = filterInSheet ? "all" : kept;
  const [all, setAll] = useState(false);
  const { posts: visible, view } = useSocialView(data);
  const { box, fit, minHeight } = useFitRows(fill?.min ?? 0, [visible.length, view], !!fill && view === "show", "(min-width: 1024px)");
  if (view === "hide") return null;
  if (!data || view === "wait") return <SocialSkeleton />;
  const counts: Record<SourcePick, number> = {
    all: visible.length,
    x: visible.filter((p) => p.source === "x").length,
    reddit: visible.filter((p) => p.source === "reddit").length,
  };
  // A kept choice whose source has nothing now: everything, with a word why.
  const quiet = pick !== "all" && counts[pick] === 0 && counts.all > 0;
  const shown = pick === "all" || quiet ? visible : visible.filter((p) => p.source === pick);
  const posts = max && !(all && more === "inline") ? shown.slice(0, max) : shown;
  // Filling a height: the posts that fit whole show, the rest wait in the sheet.
  const showing = fill ? Math.min(posts.length, fit) : posts.length;
  const hidden = shown.length - showing;
  // One source only: the filter has nothing to choose between.
  const both = counts.x > 0 && counts.reddit > 0;
  return (
    <>
      {((filterKey && both && !filterInSheet) || refresh) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
          {filterKey && both && !filterInSheet ? <SourceFilter value={quiet ? "all" : pick} counts={counts} onChange={setPick} /> : <span />}
          {refresh && <RefreshStamp asOf={data.asOf} busy={refresh.busy} onRefresh={refresh.refresh} />}
        </div>
      )}
      {fill ? (
        <div ref={box} className="relative lg:flex-1 overflow-hidden" style={{ minHeight }}>
          <ul className="lg:absolute lg:inset-x-0 lg:top-0 divide-y hairline">
            {posts.map((p, i) => (
              <SocialItem key={p.id} post={p} compact={compact} clamp hidden={i >= showing} />
            ))}
          </ul>
        </div>
      ) : (
        <ul className="divide-y hairline">
          {posts.map((p) => (
            <SocialItem key={p.id} post={p} compact={compact} />
          ))}
        </ul>
      )}
      {more && (hidden > 0 || (all && more === "inline")) && (
        <button type="button" onClick={() => setAll((v) => !v)} className="self-start font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-2">
          {more === "inline" && all ? "Show fewer ↑" : `See all ${shown.length} posts ${more === "inline" ? "↓" : "→"}`}
        </button>
      )}
      {all && more && more !== "inline" && (
        <Sheet title={more.title} kicker={more.kicker} onClose={() => setAll(false)} width={720}>
          <SocialList data={data} filterKey={filterKey} />
        </Sheet>
      )}
    </>
  );
}
