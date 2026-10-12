"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// F1's live audio commentary, played straight from F1's stream in this
// browser (nothing passes through our server). The stream address is copied
// once from F1 TV's live timing (developer tools → Network → "m3u8") and kept
// in this browser only: not synced, never sent anywhere but to F1.
//
// The browser plays the stream itself where it can (Safari, and Chrome's own
// HLS playback); elsewhere it says so.

const KEY = "f1-commentary-src";

function readSrc(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};

type State = "idle" | "loading" | "playing" | "error" | "unsupported";

export default function Commentary() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const src = useSyncExternalStore(subscribe, readSrc, () => "");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<State>("idle");
  const [volume, setVolume] = useState(0.9);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  const save = (v: string) => {
    const s = v.trim();
    try {
      if (s) localStorage.setItem(KEY, s);
      else localStorage.removeItem(KEY);
    } catch {}
    listeners.forEach((fn) => fn());
    stop();
  };

  const stop = () => {
    const a = audio.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setState("idle");
  };

  const play = async () => {
    const a = audio.current;
    if (!a || !src) return;
    if (!a.canPlayType("application/vnd.apple.mpegurl") && !a.canPlayType("application/x-mpegURL")) {
      setState("unsupported");
      return;
    }
    setState("loading");
    a.src = src;
    try {
      await a.play();
    } catch {
      setState("error");
    }
  };

  const playing = state === "playing" || state === "loading";
  const note: Record<State, string | null> = {
    idle: null,
    loading: "Connecting…",
    playing: "Live",
    error: "The stream didn't play. Its address may have expired: copy a fresh one.",
    unsupported: "This browser can't play the stream by itself.",
  };

  return (
    <span className="relative shrink-0">
      <audio
        ref={audio}
        preload="none"
        onPlaying={() => setState("playing")}
        onWaiting={() => setState((s) => (s === "playing" ? "loading" : s))}
        onError={() => setState((s) => (s === "idle" ? s : "error"))}
      />
      <button
        type="button"
        onClick={() => (src ? (playing ? stop() : play()) : setOpen(true))}
        onContextMenu={(e) => {
          e.preventDefault();
          setDraft(src);
          setOpen(true);
        }}
        className="chip h-8 text-[12px] gap-1.5"
        style={playing ? { color: "var(--hue-f1)", borderColor: "color-mix(in srgb, var(--hue-f1) 45%, transparent)" } : undefined}
        title={src ? (playing ? "Stop the commentary" : "Listen to F1's live commentary") : "Set up F1's live commentary"}
        aria-pressed={playing}
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M2.5 9.5v-1a5.5 5.5 0 0 1 11 0v1" />
          <rect x="2" y="9" width="3" height="4.5" rx="1" fill="currentColor" stroke="none" />
          <rect x="11" y="9" width="3" height="4.5" rx="1" fill="currentColor" stroke="none" />
        </svg>
        <span className="hidden sm:inline">Commentary</span>
        {state === "playing" && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--hue-f1)" }} />}
      </button>
      {src && (
        <button
          type="button"
          onClick={() => {
            setDraft(src);
            setOpen((o) => !o);
          }}
          className="absolute -right-1 -top-1 w-4 h-4 rounded-full grid place-items-center bg-[var(--card-bg)] border hairline text-[9px] text-ink-soft"
          title="Commentary settings"
          aria-label="Commentary settings"
        >
          ⋯
        </button>
      )}

      {(open || (state !== "idle" && state !== "playing" && state !== "loading")) && (
        <div className="absolute right-0 top-10 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border hairline bg-[var(--paper)] shadow-xl p-3 font-sans text-[12px]">
          {note[state] && state !== "playing" && <p className="text-[11.5px] mb-2" style={{ color: state === "loading" ? "var(--ink-soft)" : "var(--down)" }}>{note[state]}</p>}
          {open && (
            <>
              <div className="font-label text-[10px] text-ink-faint">Stream address</div>
              <p className="text-[11px] text-ink-soft mt-1 leading-snug">
                In F1 TV&apos;s live timing, start the commentary, open developer tools (F12) → Network, filter by <span className="font-mono">m3u8</span> and copy the request to <span className="font-mono">rdio.formula1.com</span>. Kept in this browser only.
              </p>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="https://rdio.formula1.com/…m3u8"
                spellCheck={false}
                className="mt-2 w-full rounded-lg border hairline bg-transparent px-2 py-1.5 font-mono text-[11px]"
              />
              {src && (
                <label className="flex items-center gap-2 mt-2.5 text-[11px] text-ink-soft">
                  Volume
                  <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="flex-1" />
                </label>
              )}
            </>
          )}
          <div className="flex justify-end gap-2 mt-2.5">
            {open && src && (
              <button type="button" className="chip h-7 text-[11px]" onClick={() => { save(""); setDraft(""); }}>
                Forget
              </button>
            )}
            <button type="button" className="chip h-7 text-[11px]" onClick={() => { setOpen(false); if (state === "error" || state === "unsupported") setState("idle"); }}>
              Close
            </button>
            {open && (
              <button type="button" className="chip h-7 text-[11px]" style={{ color: "var(--hue-f1)" }} onClick={() => { save(draft); setOpen(false); }}>
                Save
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
