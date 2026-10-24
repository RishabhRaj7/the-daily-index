"use client";

import { useEffect, useRef, useState } from "react";
import type { PastMeeting } from "@/lib/live/f1-live";

// Any finished session of the season, from F1's archive: a button that opens
// the season meeting by meeting (newest first), each with its sessions.
// Picking one shows it in full on this page; "Latest" goes back. The choice
// stays on the button ("Bahrain · Race") and in the address, and reopening
// the list brings the chosen session into view, marked.

export default function PastSessions({ current, label, onPick }: { current: string | null; label?: string | null; onPick: (path: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [meetings, setMeetings] = useState<PastMeeting[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || meetings) return;
    fetch("/api/f1/sessions")
      .then((r) => (r.ok ? (r.json() as Promise<PastMeeting[]>) : []))
      .then(setMeetings)
      .catch(() => setMeetings([]));
  }, [open, meetings]);

  // The chosen session in view when the list opens.
  useEffect(() => {
    if (!open || !meetings || !current) return;
    box.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
  }, [open, meetings, current]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`chip h-8 text-[12px] gap-1.5 max-w-[11rem] sm:max-w-[16rem] ${current ? "text-ink hover:text-[color:var(--paper)]" : ""}`}
        aria-expanded={open}
        style={current ? { borderColor: "var(--hue-f1)" } : undefined}
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="5.8" />
          <path d="M8 4.8V8l2.2 1.4" />
        </svg>
        <span className="truncate">{current && label ? label : "Past sessions"}</span>
        <svg viewBox="0 0 12 12" className={`w-2.5 h-2.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M3 4.5 6 7.5l3-3" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[min(calc(100vw-2rem),26rem)] max-h-[70vh] overflow-y-auto rounded-2xl border hairline bg-[var(--surface)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] p-3 animate-[sheet-up_0.3s_var(--ease-out)]">
          {current && (
            <button
              type="button"
              onClick={() => {
                onPick(null);
                setOpen(false);
              }}
              className="w-full text-left rounded-xl px-3 py-2.5 mb-2 font-sans text-[12.5px] font-semibold border hairline hover:border-[color:var(--ink-soft)]"
            >
              ← Back to the latest session
            </button>
          )}
          {!meetings ? (
            <p className="font-mono text-[11px] shimmer-text px-3 py-4">Reading the season…</p>
          ) : meetings.length === 0 ? (
            <p className="font-mono text-[11px] text-ink-faint px-3 py-4">F1&rsquo;s archive didn&rsquo;t answer.</p>
          ) : (
            <ol>
              {meetings.map((m) => (
                <li key={m.meeting + m.round} className="border-t hairline first:border-t-0 px-2 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-sans font-semibold text-[13px]">{m.meeting}</span>
                    <span className="font-mono text-[10px] text-ink-faint">
                      {m.round ? `R${m.round} · ` : ""}
                      {new Date(m.sessions.at(-1)!.end).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.sessions.map((x) => {
                      const on = x.path === current;
                      return (
                        <button
                          key={x.path}
                          type="button"
                          aria-current={on || undefined}
                          onClick={() => {
                            onPick(x.path);
                            setOpen(false);
                          }}
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
        </div>
      )}
    </div>
  );
}
