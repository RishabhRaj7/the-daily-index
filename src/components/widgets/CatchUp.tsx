"use client";

import { XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import MoveArrow from "@/components/chrome/MoveArrow";
import { sectionIcon } from "@/components/chrome/nav-icons";
import PublisherMark from "@/components/story/PublisherMark";
import type { CatchUpAnswer } from "@/lib/live/catch-up";
import { SECTION_META } from "@/lib/sections";
import type { Story } from "@/lib/types";

// "While you were away", at the top of the paper: what changed since the reader last
// looked on this device. The paper changes all day, so this is the way back in. A
// headline and two sentences (lib/live/catch-up.ts), the top new stories, each to its
// place on the page, and the numbers that moved since they left.
// The last visit lives in this browser. Nothing shows on a first visit, after under
// half an hour away, or when little changed. A reload in the same visit shows the same
// card, and closing it holds for the visit.

const SAVED = "daily-index:last-visit:v1";
const VISIT = "daily-index:this-visit:v1";
const CLOSED = "daily-index:catch-up-closed:v1";
const AWAY_MS = 30 * 60_000;
/** Enough to be worth a card. */
const FEWEST_STORIES = 3;
const FEWEST_MOVES = 2;
const SHOWN_STORIES = 3;
const SHOWN_MOVES = 4;

/** Something on the page with a number to compare. A percentage is measured as a move; points as a difference. */
export interface CatchUpNumber {
  key: string;
  label: string;
  value: number;
  display: string;
  kind: "price" | "points";
}

interface Snapshot {
  at: number;
  urls: string[];
  numbers: Record<string, number>;
}

const read = (store: Storage, key: string): Snapshot | null => {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
};
const write = (store: Storage, key: string, value: unknown) => {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows can refuse: the card just doesn't show.
  }
};

const sinceWords = (at: number) => {
  const then = new Date(at);
  const now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(then.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return `since ${then.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
  if (days === 1) return "since yesterday";
  if (days < 7) return `since ${then.toLocaleDateString("en-GB", { weekday: "long" })}`;
  return `since ${then.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
};

const listWords = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export interface CatchUpData {
  since: number;
  fresh: Story[];
  moves: { key: string; label: string; display: string; change: number; kind: "price" | "points" }[];
  newUrls: ReadonlySet<string>;
}

/** Compares the page with the last visit, and keeps this one for next time. */
export function useCatchUp(stories: Story[], numbers: CatchUpNumber[], enabled: boolean): CatchUpData | null {
  const [before, setBefore] = useState<Snapshot | null>(null);
  const latest = useRef({ stories, numbers });
  useEffect(() => {
    latest.current = { stories, numbers };
  }, [stories, numbers]);

  useEffect(() => {
    if (!enabled) return;
    const save = () => {
      const { stories: s, numbers: n } = latest.current;
      if (s.length === 0) return;
      write(localStorage, SAVED, { at: Date.now(), urls: s.flatMap((x) => (x.sourceUrl ? [x.sourceUrl] : [])), numbers: Object.fromEntries(n.map((x) => [x.key, x.value])) } satisfies Snapshot);
    };
    const open = () => {
      // A reload within this visit compares with the same moment.
      const held = read(sessionStorage, VISIT) as (Snapshot & { openedAt?: number }) | null;
      if (held?.openedAt && Date.now() - held.openedAt < AWAY_MS) {
        setBefore(held);
        return;
      }
      const saved = read(localStorage, SAVED);
      if (saved && Date.now() - saved.at >= AWAY_MS) {
        write(sessionStorage, VISIT, { ...saved, openedAt: Date.now() });
        setBefore(saved);
      }
    };
    open();
    // Also once the page has settled, since a phone can close a page without saying so.
    const settled = setTimeout(save, 20_000);
    // A tab left open counts as a new visit when the reader comes back to it.
    const onChange = () => (document.visibilityState === "hidden" ? save() : open());
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(settled);
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("pagehide", save);
    };
  }, [enabled]);

  return useMemo(() => {
    if (!before) return null;
    const known = new Set(before.urls);
    const seen = new Set<string>();
    const fresh = stories.filter((s) => {
      if (!s.sourceUrl || known.has(s.sourceUrl) || seen.has(s.sourceUrl)) return false;
      seen.add(s.sourceUrl);
      return true;
    });
    const moves = numbers
      .flatMap((n) => {
        const was = before.numbers[n.key];
        if (was === undefined || was === 0) return [];
        const change = n.kind === "price" ? ((n.value - was) / was) * 100 : n.value - was;
        return Math.abs(change) >= (n.kind === "price" ? 0.5 : 3) ? [{ key: n.key, label: n.label, display: n.display, change, kind: n.kind }] : [];
      })
      .sort((a, b) => Math.abs(b.change) / (b.kind === "price" ? 1 : 5) - Math.abs(a.change) / (a.kind === "price" ? 1 : 5));
    return { since: before.at, fresh, moves, newUrls: seen };
  }, [before, stories, numbers]);
}

function MovedRow({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-baseline py-2 border-t hairline">
      <span className="font-sans font-semibold text-[12.5px] text-ink-soft truncate" title={label}>
        {label}
      </span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <b className="font-display font-extrabold text-[1.25rem] leading-none">{value}</b>
        {children}
      </span>
    </div>
  );
}

export default function CatchUpCard({ data }: { data: CatchUpData }) {
  const [closed, setClosed] = useState(() => {
    try {
      return typeof sessionStorage !== "undefined" && sessionStorage.getItem(CLOSED) === String(data.since);
    } catch {
      return false;
    }
  });
  const [answer, setAnswer] = useState<CatchUpAnswer | null>(null);
  const worth = data.fresh.length >= FEWEST_STORIES || data.moves.length >= FEWEST_MOVES || Boolean(answer?.session);
  const top = useMemo(() => {
    // The strongest from each section first, so one busy section doesn't fill the list.
    const bySignificance = [...data.fresh].sort((a, b) => Number(Boolean(b.personal)) - Number(Boolean(a.personal)) || b.significance - a.significance);
    const sections = new Set<string>();
    const lead = bySignificance.filter((s) => (sections.has(s.section) ? false : (sections.add(s.section), true)));
    return [...lead, ...bySignificance.filter((s) => !lead.includes(s))];
  }, [data.fresh]);
  const moveWords = data.moves.slice(0, SHOWN_MOVES).map((m) => `${m.label}: ${m.display}, ${m.change > 0 ? "up" : "down"} ${Math.abs(m.change).toFixed(m.kind === "price" ? 2 : 0)}${m.kind === "price" ? "%" : " points"}`);
  // Once, shortly after the page settles: the odds and the live figures arrive late.
  const asked = useRef(false);
  useEffect(() => {
    if (closed || asked.current) return;
    const t = setTimeout(() => {
      asked.current = true;
      fetch("/api/catch-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: data.since, stories: top.slice(0, 12).map((s) => ({ section: SECTION_META[s.section]?.kicker ?? s.section, headline: s.headline })), moves: moveWords }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<CatchUpAnswer>) : null))
        .then((a) => a && setAnswer(a))
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked once per visit
  }, [closed]);

  if (!worth || closed) return null;
  const count = data.fresh.length;
  const bySection = [...new Set(data.fresh.map((s) => s.section))].slice(0, 3).map((k) => `${data.fresh.filter((s) => s.section === k).length} in ${SECTION_META[k]?.kicker ?? k}`);
  const shownMoves = data.moves.slice(0, SHOWN_MOVES - (answer?.session ? 1 : 0));
  return (
    <section className="since-card module" aria-label="While you were away">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-label text-[11px] tracking-[0.1em]" style={{ color: "var(--accent)" }}>
            While you were away
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-faint">
            {sinceWords(data.since)}
            <button
              type="button"
              aria-label="Close"
              className="grid place-items-center w-6 h-6 -my-1 -mr-1 rounded-full hover:text-ink"
              onClick={() => {
                try {
                  sessionStorage.setItem(CLOSED, String(data.since));
                } catch {
                  // A private window: closed until the next load.
                }
                setClosed(true);
              }}
            >
              <XIcon size={14} weight="bold" aria-hidden="true" />
            </button>
          </span>
        </div>
        <h2 className="font-display font-extrabold lean-title uppercase text-[clamp(1.75rem,2.6vw,2.7rem)] leading-[0.95] mt-2 mb-2 [text-wrap:balance]">{answer?.headline ?? (count ? `${count} new ${count === 1 ? "story" : "stories"}` : "The numbers moved")}</h2>
        <p className="font-headline text-[15.5px] leading-[1.42] [text-wrap:pretty]">{answer?.story ?? (bySection.length ? `${listWords(bySection)}.` : "")}</p>
      </div>

      {top.length > 0 && (
        <div className="since-list min-w-0">
          <div className="font-label text-[11px] tracking-[0.08em] text-ink-faint mb-1.5">New for you</div>
          {top.slice(0, SHOWN_STORIES).map((s) => {
            const Glyph = sectionIcon(SECTION_META[s.section]?.slug ?? s.section);
            return (
              <a key={s.id} href={`#story-${s.id}`} className="group grid grid-cols-[1.1rem_minmax(0,1fr)] gap-2 py-2 border-t hairline">
                <Glyph size={16} className="mt-[3px]" style={{ color: SECTION_META[s.section]?.hue }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-headline text-[15px] leading-[1.28] [text-wrap:pretty] group-hover:underline underline-offset-2">{s.headline}</span>
                  {s.sourceName && (
                    <span className="block mt-1 text-[11.5px] text-ink-soft">
                      <PublisherMark source={s.sourceName} size={15} />
                    </span>
                  )}
                </span>
              </a>
            );
          })}
        </div>
      )}

      {(data.moves.length > 0 || answer?.session) && (
        <div className="since-list min-w-0">
          <div className="font-label text-[11px] tracking-[0.08em] text-ink-faint mb-1.5">What moved</div>
          {answer?.session && <MovedRow label={answer.session.label} value={answer.session.value} />}
          {shownMoves.map((m) => {
            const up = m.change > 0;
            return (
              <MovedRow key={m.key} label={m.label} value={m.display}>
                <span className="font-mono font-semibold text-[11.5px] inline-flex items-center gap-1" style={{ color: up ? "var(--up)" : "var(--down)" }}>
                  <MoveArrow up={up} size={10} />
                  {Math.abs(m.change).toFixed(m.kind === "price" ? 2 : 0)}
                  {m.kind === "price" ? "%" : ""}
                </span>
              </MovedRow>
            );
          })}
        </div>
      )}
    </section>
  );
}
