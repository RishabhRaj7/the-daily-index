"use client";

import { ArrowLeftIcon, CaretDownIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Sheet from "@/components/extras/Sheet";
import { PHONE, useMedia } from "@/lib/use-media";
import type { PastMeeting } from "@/lib/live/f1-live";

// Any finished session of the season, from F1's archive: a button that opens
// the season meeting by meeting (newest first), each with its sessions, in a
// drop-down, or a sheet that slides up on a phone. The session on show is marked,
// whether picked or simply the latest, and comes into view when the list opens.
// A row above the list goes back to the latest, and says "Live now" when a session
// is on. The choice stays on the button ("Bahrain · Race") and in the address.

interface OnTrack {
  name: string;
  soon: boolean;
}

function SeasonList({
  meetings,
  current,
  shown,
  onTrack,
  onPick,
}: {
  meetings: PastMeeting[] | null;
  current: string | null;
  shown: string | null;
  onTrack: OnTrack | null;
  onPick: (path: string | null) => void;
}) {
  return (
    <>
      {current && (
        <button
          type="button"
          onClick={() => onPick(null)}
          className="w-full text-left rounded-xl px-3 py-2.5 mb-2 font-sans text-[12.5px] font-semibold border hairline hover:border-[color:var(--ink-soft)] flex items-center gap-2"
          style={onTrack && !onTrack.soon ? { background: "var(--hue-f1)", borderColor: "var(--hue-f1)", color: "#fff" } : undefined}
        >
          {onTrack ? (
            <>
              {!onTrack.soon && <span className="w-2 h-2 rounded-full bg-white animate-pulse" aria-hidden="true" />}
              {onTrack.soon ? "Starting soon" : "Live now"} · {onTrack.name}
            </>
          ) : (
            <>
              <ArrowLeftIcon size={13} weight="bold" aria-hidden="true" /> Back to the latest session
            </>
          )}
        </button>
      )}
      {!meetings ? (
        <p className="font-mono text-[11px] shimmer-text px-3 py-4">Reading the season…</p>
      ) : meetings.length === 0 ? (
        <p className="font-mono text-[11px] text-ink-faint px-3 py-4">F1&rsquo;s archive didn&rsquo;t answer.</p>
      ) : (
        <ol data-season-list>
          {meetings.map((m) => (
            <li key={m.meeting + m.round} className="border-t hairline first:border-t-0 px-2 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-sans font-semibold text-[13px]">{m.meeting}</span>
                <span className="font-mono text-[11px] text-ink-faint">
                  {m.round ? `R${m.round} · ` : ""}
                  {new Date(m.sessions.at(-1)!.end).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {m.sessions.map((x) => {
                  const on = x.path === shown;
                  return (
                    <button
                      key={x.path}
                      type="button"
                      aria-current={on || undefined}
                      onClick={() => onPick(x.path)}
                      className={`rounded-full border px-2.5 h-7 font-sans text-[11.5px] font-semibold transition-colors ${on ? "text-[color:var(--paper)]" : "hairline text-ink-soft hover:text-ink hover:border-[color:var(--ink-soft)]"}`}
                      style={on ? { background: "var(--ink)", borderColor: "var(--ink)" } : undefined}
                    >
                      {x.name.replace("Practice ", "FP")}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export default function PastSessions({
  current,
  shown = current,
  label,
  onTrack = null,
  onPick,
}: {
  /** The past session picked, if any. */
  current: string | null;
  /** The session on show, picked or the latest. */
  shown?: string | null;
  label?: string | null;
  onTrack?: OnTrack | null;
  onPick: (path: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [meetings, setMeetings] = useState<PastMeeting[] | null>(null);
  const phone = useMedia(PHONE);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  useEffect(() => {
    if (!open || meetings) return;
    fetch("/api/f1/sessions")
      .then((r) => (r.ok ? (r.json() as Promise<PastMeeting[]>) : []))
      .then(setMeetings)
      .catch(() => setMeetings([]));
  }, [open, meetings]);

  // The session on show in view when the list opens.
  useEffect(() => {
    if (!open || !meetings || !shown) return;
    document.querySelector('[data-season-list] [aria-current="true"]')?.scrollIntoView({ block: "center" });
  }, [open, meetings, shown, phone, position]);

  useEffect(() => {
    if (!open || phone) return;
    const away = (e: MouseEvent) => {
      if (box.current?.contains(e.target as Node) || menu.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open, phone]);

  useEffect(() => {
    if (!open || phone) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const height = window.innerHeight;
      const max = Math.min(height * 0.7, 520);
      const belowTop = anchor.bottom + 8;
      let maxHeight = Math.min(max, height - belowTop - 16);
      let top = belowTop;
      if (maxHeight < 180 && anchor.top > 180) {
        maxHeight = Math.min(max, anchor.top - 16);
        top = Math.max(16, anchor.top - maxHeight - 8);
      }
      maxHeight = Math.max(0, Math.min(maxHeight, height - top - 16));
      const width = Math.min(window.innerWidth - 32, 416);
      const left = Math.max(16, Math.min(anchor.right - width, window.innerWidth - width - 16));
      setPosition({ top, left, width, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, phone]);

  const choose = (path: string | null) => {
    onPick(path);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`chip h-8 text-[12px] gap-1.5 max-w-[11rem] sm:max-w-[16rem] ${current ? "text-ink hover:text-[color:var(--paper)]" : ""}`}
        aria-expanded={open}
        style={current ? { borderColor: "var(--hue-f1)" } : undefined}
      >
        <ClockCounterClockwiseIcon size={14} className="shrink-0" aria-hidden="true" />
        {/* A phone's strip under the heading names the session; here it would only be cut short. */}
        <span className="truncate sm:hidden">Past sessions</span>
        <span className="truncate hidden sm:inline">{current && label ? label : "Past sessions"}</span>
        <CaretDownIcon size={12} weight="bold" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && phone && (
        <Sheet title="Past sessions" onClose={() => setOpen(false)} hue="var(--hue-f1)">
          <SeasonList meetings={meetings} current={current} shown={shown} onTrack={onTrack} onPick={choose} />
        </Sheet>
      )}
      {open && !phone && position && createPortal(
        <div
          ref={menu}
          className="fixed z-50 w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border hairline bg-[var(--surface)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] p-3 animate-[sheet-up_0.3s_var(--ease-out)]"
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
        >
          <SeasonList meetings={meetings} current={current} shown={shown} onTrack={onTrack} onPick={choose} />
        </div>,
        document.body,
      )}
    </div>
  );
}
