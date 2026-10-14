"use client";

import { useEffect, useRef, useState } from "react";

// F1's live audio coverage, as the live timing feed lists it (AudioStreams:
// "Live coverage (EN)"), played straight from F1's stream in this browser.
// The browser plays the stream itself (Safari, and Chrome's own HLS playback);
// elsewhere it says so.

type State = "idle" | "loading" | "playing" | "error" | "unsupported";

const NOTE: Partial<Record<State, string>> = {
  error: "The commentary isn't on air right now. It runs while the session does.",
  unsupported: "This browser can't play F1's audio stream.",
};

export default function Commentary({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<State>("idle");
  const [volume, setVolume] = useState(0.9);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

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
    if (!a) return;
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

  const on = state === "playing" || state === "loading";
  const note = NOTE[state];

  return (
    <span className="relative shrink-0 flex items-center">
      <audio
        ref={audio}
        preload="none"
        onPlaying={() => setState("playing")}
        onWaiting={() => setState((s) => (s === "playing" ? "loading" : s))}
        onError={() => setState((s) => (s === "idle" ? s : "error"))}
      />
      <button
        type="button"
        onClick={() => (on ? stop() : play())}
        className="chip h-8 text-[12px] gap-1.5"
        style={on ? { color: "var(--hue-f1)", borderColor: "color-mix(in srgb, var(--hue-f1) 45%, transparent)" } : undefined}
        title={on ? "Stop the commentary" : "Listen to F1's live commentary"}
        aria-pressed={on}
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M2.5 9.5v-1a5.5 5.5 0 0 1 11 0v1" />
          <rect x="2" y="9" width="3" height="4.5" rx="1" fill="currentColor" stroke="none" />
          <rect x="11" y="9" width="3" height="4.5" rx="1" fill="currentColor" stroke="none" />
        </svg>
        <span className="hidden sm:inline">{state === "loading" ? "Connecting…" : "Commentary"}</span>
        {state === "playing" && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--hue-f1)" }} />}
      </button>
      {on && (
        <button type="button" onClick={() => setMenu((m) => !m)} className="chip h-8 w-8 ml-1 justify-center text-[12px]" style={{ padding: 0 }} title="Volume" aria-label="Commentary volume">
          {volume === 0 ? "🔇" : "🔊"}
        </button>
      )}

      {((menu && on) || note) && (
        <div className="absolute right-0 top-10 z-40 w-[min(17rem,calc(100vw-2rem))] rounded-xl border hairline bg-[var(--paper)] shadow-xl p-3 font-sans text-[12px]">
          {note ? (
            <p className="text-[11.5px] text-ink-soft">{note}</p>
          ) : (
            <label className="flex items-center gap-2 text-[11px] text-ink-soft">
              Volume
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="flex-1" />
            </label>
          )}
          <div className="flex justify-end mt-2">
            <button
              type="button"
              className="chip h-7 text-[11px]"
              onClick={() => {
                setMenu(false);
                if (note) setState("idle");
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
