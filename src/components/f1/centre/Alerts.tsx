"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { LiveRaceControl, LiveSnapshot } from "@/lib/f1-live-types";
import { readRaceControl, type RcTone } from "@/lib/f1-race-control";
import { TONE_COLOUR } from "./Feed";

// Alerts for a live session (never a replay or a past one, and only in the
// live centre): what a viewer would want to look up for — the safety car and
// its end, a red flag, the restart, the chequered flag, the stewards opening
// an investigation or handing out a penalty, a black-and-white flag, rain —
// and, for the reader's own drivers, their stops, a retirement, a fastest
// lap, a lap deleted. Each comes up top right in its topic's colour (the
// feed's), stacks, fades after a few seconds (flags and penalties stay
// longer) and opens the feed when tapped. Each is shown once, a refresh
// included; what happened before the page was open stays in the feed. A bell
// beside the commentary mutes them on this device.

type Alert = { id: string; label: string; text: string; colour: string; long: boolean; at: number };

// ---- the stack (outside React: the snapshot effect adds, the toasts read) -------

let stack: Alert[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const sub = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const push = (a: Alert) => {
  stack = [a, ...stack.filter((x) => x.id !== a.id)].slice(0, 4);
  emit();
};
const drop = (id: string) => {
  stack = stack.filter((x) => x.id !== id);
  emit();
};

const MUTE = "f1-alerts-muted";
const readMuted = () => {
  try {
    return localStorage.getItem(MUTE) === "1";
  } catch {
    return false;
  }
};

// ---- what's worth an alert --------------------------------------------------------

const LABEL: Partial<Record<RcTone, string>> = { sc: "Safety car", red: "Red flag", green: "Track clear", chequered: "Chequered flag", stewards: "Stewards", penalty: "Penalty", bw: "Black and white flag" };

/** A race control message as an alert, or null when it isn't one (sector yellows, blue flags, notes). */
function fromRc(m: LiveRaceControl, numbers: Map<string, string>, mine: Set<string>): Omit<Alert, "id" | "at"> | null {
  const it = readRaceControl([m], numbers)[0];
  const raw = m.message.toUpperCase();
  const ours = it.drivers.some((c) => mine.has(c));
  switch (it.tone) {
    case "sc":
      if (/LAPPED CARS/.test(raw)) return null;
      return { label: /VSC|VIRTUAL/.test(raw) ? "Virtual safety car" : "Safety car", text: it.text, colour: TONE_COLOUR.sc, long: true };
    case "red":
      return { label: "Red flag", text: it.text, colour: TONE_COLOUR.red, long: true };
    case "chequered":
      return { label: "Chequered flag", text: it.text, colour: TONE_COLOUR.chequered, long: true };
    case "green":
      // The track clear after a red flag or a safety car, not a sector's all-clear.
      return /SECTOR/.test(raw) || !/TRACK CLEAR|RESUME|RESTART|GREEN FLAG/.test(raw) ? null : { label: "Track clear", text: it.text, colour: TONE_COLOUR.green, long: false };
    case "penalty":
      return /SERVED/.test(raw) && !ours ? null : { label: "Penalty", text: it.text, colour: TONE_COLOUR.penalty, long: true };
    case "stewards":
      // An investigation opened (now or after the race), or a decision on one of ours.
      if (/UNDER INVESTIGATION|INVESTIGATED AFTER/.test(raw)) return { label: "Investigation", text: it.text, colour: "var(--f1-investigation)", long: true };
      return ours && /NO FURTHER/.test(raw) ? { label: "Stewards", text: it.text, colour: TONE_COLOUR.stewards, long: false } : null;
    case "bw":
      return { label: LABEL.bw!, text: it.text, colour: TONE_COLOUR.bw, long: false };
    case "limits":
      return ours ? { label: "Track limits", text: it.text, colour: TONE_COLOUR.limits, long: false } : null;
    default:
      return null;
  }
}

/** Everything alertable in a snapshot, by a stable id (the same event keeps its id from poll to poll). */
function events(snap: LiveSnapshot, mine: Set<string>): Map<string, Omit<Alert, "id" | "at"> & { utc?: string }> {
  const out = new Map<string, Omit<Alert, "id" | "at"> & { utc?: string }>();
  const numbers = new Map(snap.rows.map((r) => [r.number, r.code]));
  for (const m of snap.raceControl ?? []) {
    const a = fromRc(m, numbers, mine);
    if (a) out.set(`rc:${m.utc}:${m.message}`, { ...a, utc: m.utc });
  }
  if (snap.weather?.rain) out.set("rain", { label: "Rain", text: "Rain at the track", colour: "#3b82f6", long: true });
  const race = snap.type === "Race";
  for (const r of snap.rows) {
    if (!mine.has(r.code)) continue;
    if (r.out) out.set(`out:${r.code}`, { label: r.code, text: race ? `${r.code} is out of the race` : `${r.code} has stopped`, colour: r.colour, long: true });
    if (r.bestFastest && r.best) out.set(`fl:${r.code}:${r.best}`, { label: r.code, text: race ? `${r.code}: fastest lap, ${r.best}` : `${r.code} goes fastest: ${r.best}`, colour: r.colour, long: false });
  }
  for (const p of snap.pitStops ?? []) {
    if (!mine.has(p.code)) continue;
    out.set(`pit:${p.code}:${p.lap}`, {
      label: p.code,
      text: `${p.code} pits on lap ${p.lap}${p.stationary !== null ? ` · ${p.stationary.toFixed(1)} s` : ""}`,
      colour: snap.rows.find((r) => r.code === p.code)?.colour ?? "var(--f1-pit)",
      long: false,
      utc: p.utc,
    });
  }
  return out;
}

const seenKey = (snap: LiveSnapshot) => `f1-alerts-seen:${snap.sessionKey}`;
const when = (utc: string) => Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(utc) ? utc : `${utc}Z`) || 0;

/**
 * Watches the live snapshot and raises alerts, with the bell that mutes them.
 * Render only for a live session (not a replay or a past one).
 */
export default function LiveAlerts({ snap, mine, onOpen }: { snap: LiveSnapshot; mine: Set<string>; onOpen: () => void }) {
  const muted = useSyncExternalStore(sub, readMuted, () => false);
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    const key = seenKey(snap);
    const now = events(snap, mine);
    if (seen.current?.key !== key) {
      // This session's alerts already shown (a refresh), or none yet: what is
      // already there and more than two minutes old isn't news any more.
      let kept: string[] = [];
      try {
        kept = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      } catch {}
      const ids = new Set(kept);
      const first = !kept.length;
      for (const [id, e] of now) if (first && (!e.utc || Date.now() - when(e.utc) > 120_000)) ids.add(id);
      seen.current = { key, ids };
    }
    const ids = seen.current.ids;
    let fresh = false;
    for (const [id, e] of now) {
      if (ids.has(id)) continue;
      ids.add(id);
      fresh = true;
      if (!readMuted()) push({ id, label: e.label, text: e.text, colour: e.colour, long: e.long, at: Date.now() });
    }
    if (fresh || !sessionStorage.getItem(key)) {
      try {
        sessionStorage.setItem(key, JSON.stringify([...ids].slice(-600)));
      } catch {}
    }
  }, [snap, mine]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(MUTE, muted ? "0" : "1");
          } catch {}
          if (!muted) stack = [];
          emit();
        }}
        className="chip h-8 w-8 justify-center shrink-0"
        title={muted ? "Alerts are off: turn them on" : "Alerts are on: turn them off"}
        aria-label={muted ? "Turn live alerts on" : "Turn live alerts off"}
        aria-pressed={!muted}
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1H3z" />
          <path d="M6.5 14a1.6 1.6 0 0 0 3 0" />
          {muted && <path d="M2.5 2.5l11 11" />}
        </svg>
      </button>
      <Toasts onOpen={onOpen} />
    </>
  );
}

function Toasts({ onOpen }: { onOpen: () => void }) {
  const list = useSyncExternalStore(sub, () => stack, () => stack);
  const mounted = useSyncExternalStore(sub, () => true, () => false);
  if (!mounted || !list.length) return null;
  return createPortal(
    <div className="sheet-scale fixed z-[80] top-3 right-3 left-3 sm:left-auto sm:top-[6.75rem] sm:right-4 sm:w-[21rem] flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
      {list.map((a) => (
        <Toast key={a.id} a={a} onOpen={onOpen} />
      ))}
    </div>,
    document.body,
  );
}

function Toast({ a, onOpen }: { a: Alert; onOpen: () => void }) {
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold) return;
    const t = setTimeout(() => drop(a.id), a.long ? 12_000 : 7_000);
    return () => clearTimeout(t);
  }, [a, hold]);
  return (
    <div
      className="pointer-events-auto relative overflow-hidden rounded-xl border hairline bg-[var(--paper)] shadow-[0_8px_28px_rgba(0,0,0,0.22)] animate-[toast-in_0.32s_cubic-bezier(0.16,1,0.3,1)]"
      style={{ borderColor: `color-mix(in srgb, ${a.colour} 40%, var(--rule))` }}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
    >
      <span className="absolute left-0 inset-y-0 w-[4px]" style={{ background: a.colour }} aria-hidden="true" />
      <button
        type="button"
        className="block w-full text-left pl-4 pr-9 py-2.5"
        onClick={() => {
          drop(a.id);
          onOpen();
        }}
        title="Open the feed"
      >
        <span className="flex items-center gap-1.5 font-label text-[10px]" style={{ color: a.colour }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.colour }} />
          {a.label}
        </span>
        <span className="block font-sans text-[13px] leading-snug mt-0.5 text-ink">{a.text}</span>
      </button>
      <button type="button" onClick={() => drop(a.id)} className="absolute top-1.5 right-1.5 w-7 h-7 grid place-items-center rounded-full text-ink-faint hover:text-ink" aria-label="Dismiss">
        <svg viewBox="0 0 12 12" className="w-3 h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>
    </div>
  );
}
