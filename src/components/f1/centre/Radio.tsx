"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveRadio } from "@/lib/f1-live-types";
import { readTurns } from "@/lib/f1-radio-speaker";
import { DriverName } from "../DriverLink";
import { clock } from "./ui";

// Team radio: one player for the page (a new clip stops the last), the
// transcripts fetched for the clips on show, and each clip's row — the
// driver, when, Listen, the words, and how near they are to what was said.

export interface Written {
  text: string;
  confidence: number | null;
  model: string;
  checkedBy?: string;
}

/** Transcripts for the clips on show: kept ones at once, new ones as they're written. */
export function useTranscripts(clips: LiveRadio[]): { text: Record<string, Written>; pending: boolean; paused: boolean } {
  const [text, setText] = useState<Record<string, Written>>({});
  const [pending, setPending] = useState(true);
  const [paused, setPaused] = useState(false);
  const ids = clips.map((c) => `${c.url}|${c.code}|${c.first ?? ""}`).join(",");
  useEffect(() => {
    if (!ids) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      const q = new URLSearchParams();
      for (const pair of ids.split(",")) {
        const [u, w, f] = pair.split("|");
        q.append("u", u);
        q.append("w", w);
        q.append("f", f);
      }
      try {
        const res = await fetch(`/api/f1/radio?${q}`);
        const d = (await res.json()) as { transcripts: Record<string, Written>; pending: number; paused?: boolean };
        if (stop) return;
        setText((t) => ({ ...t, ...d.transcripts }));
        setPaused(!!d.paused);
        setPending(d.pending > 0 && !d.paused);
        if (d.pending > 0 && !d.paused) timer = setTimeout(ask, 4000);
      } catch {
        if (!stop) setPending(false);
      }
    };
    void ask();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [ids]);
  return { text, pending, paused };
}

export interface Player {
  playing: string | null;
  progress: number;
  toggle: (url: string) => void;
}

/** One audio player for the page. */
export function usePlayer(): Player {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = (url: string) => {
    if (playing === url) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(url);
    audio.current = a;
    a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    a.onended = () => setPlaying(null);
    setProgress(0);
    a.play().then(
      () => setPlaying(url),
      () => setPlaying(null),
    );
  };
  return { playing, progress, toggle };
}

/**
 * How near the text is to what was said: two different models listened, and
 * this is the share of words they agreed on (five pips and a word). After a
 * single listen it is that model's own rating, capped and said to be one.
 */
export function Confidence({ value, model, checkedBy }: { value: number | null; model: string; checkedBy?: string }) {
  if (value === null) return null;
  const pips = Math.max(1, Math.round(value * 5));
  const word = value >= 0.85 ? "Clear" : value >= 0.65 ? "Mostly clear" : value >= 0.45 ? "Rough" : "Hard to hear";
  const tone = value >= 0.85 ? "var(--f1-personal)" : value >= 0.65 ? "var(--f1-slower)" : "var(--down)";
  const how = checkedBy ? `two listens agree on ${Math.round(value * 100)}%` : "one listen";
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[9.5px] text-ink-faint"
      title={checkedBy ? `Written by ${model}, checked by ${checkedBy}: ${Math.round(value * 100)}% of words heard the same. Underlined words were heard differently.` : `Written by ${model}; no second listen was free, so this is its own rating.`}
    >
      <span className="flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: i < pips ? tone : "var(--rule)" }} />
        ))}
      </span>
      {word} · {how}
    </span>
  );
}

function Said({ text }: { text: string }) {
  // Words the transcriber couldn't make out stay visible as such; words the
  // second listen heard differently ({{…}}) are underlined as unsure.
  return (
    <>
      {text.split(/(\[(?:unclear|bleep)\]|\{\{[\s\S]*?\}\})/i).map((part, i) =>
        part.startsWith("{{") ? (
          <span key={i} className="text-ink-faint underline decoration-dotted decoration-1 underline-offset-[3px]" title="Heard differently on the second listen">
            {part.slice(2, -2)}
          </span>
        ) : /^\[(unclear|bleep)\]$/i.test(part) ? (
          <span key={i} className="font-mono text-[10.5px] text-ink-faint italic px-0.5">
            {part.toLowerCase() === "[bleep]" ? "[bleep]" : "[?]"}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function Transcript({ text, code }: { text: string; code: string }) {
  // Turns as settled on the server (lib/f1-radio-speaker.ts): the driver, the
  // engineer, or a line nobody could place, shown without a guess.
  const turns = readTurns(text, code);
  return (
    <div className="mt-2 space-y-1">
      {turns.map((t, i) => (
        <p key={i} className="font-headline text-[14px] leading-snug">
          <span className={`font-label text-[8.5px] mr-1.5 ${t.who === "driver" ? "" : "text-ink-faint"}`} title={t.who === "unsure" ? "Couldn't tell whether the driver or the engineer said this" : undefined}>
            {t.who === "driver" ? code : t.who === "engineer" ? "Engineer" : "Driver or engineer?"}
          </span>
          <span className={t.who === "driver" ? "" : "text-ink-soft"}>
            <Said text={t.said} />
          </span>
        </p>
      ))}
    </div>
  );
}

/** A clip: who and when, Listen, and the words (folded away when they're mostly guesswork). */
export function RadioRow({
  clip,
  photo,
  written,
  pending,
  paused,
  player,
  compact = false,
}: {
  clip: LiveRadio;
  photo?: string;
  written?: Written;
  pending: boolean;
  paused: boolean;
  player: Player;
  compact?: boolean;
}) {
  const on = player.playing === clip.url;
  const [open, setOpen] = useState(false);
  const rough = written && written.confidence !== null && written.confidence < 0.45;
  return (
    <div className="flex gap-3">
      <span className={`relative ${compact ? "w-8 h-8" : "w-10 h-10"} rounded-full overflow-hidden shrink-0`} style={{ background: `color-mix(in srgb, ${clip.colour} 30%, var(--paper))` }}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <DriverName code={clip.code} className="font-sans font-bold text-[13px]">
            {clip.code}
          </DriverName>
          <span className="font-label text-[8px] text-ink-faint">Radio</span>
          <span className="font-mono text-[10.5px] text-ink-faint tabular-nums">{clock(clip.utc)}</span>
          <button
            type="button"
            onClick={() => player.toggle(clip.url)}
            className="ml-auto flex items-center gap-1.5 rounded-full border hairline h-7 pl-1.5 pr-3 font-sans text-[11.5px] font-semibold hover:border-[color:var(--ink-soft)] transition-colors shrink-0"
            aria-label={`${on ? "Pause" : "Play"} ${clip.code}'s radio`}
          >
            <span className="w-4 h-4 rounded-full grid place-items-center" style={{ background: clip.colour }}>
              {on ? (
                <svg viewBox="0 0 12 12" className="w-2 h-2" fill="#fff" aria-hidden="true">
                  <rect x="2.5" y="2" width="2.6" height="8" rx="0.6" />
                  <rect x="6.9" y="2" width="2.6" height="8" rx="0.6" />
                </svg>
              ) : (
                <svg viewBox="0 0 12 12" className="w-2 h-2 ml-[1px]" fill="#fff" aria-hidden="true">
                  <path d="M3 1.8v8.4c0 .5.5.8.9.5l6.4-4.2c.4-.3.4-.8 0-1.1L3.9 1.3c-.4-.3-.9 0-.9.5z" />
                </svg>
              )}
            </span>
            {on ? "Pause" : "Listen"}
          </button>
        </span>
        {on && (
          <span className="block h-[2px] rounded-full bg-[var(--rule)] mt-2 overflow-hidden">
            <span className="block h-full" style={{ width: `${player.progress * 100}%`, background: clip.colour, transition: "width 0.25s linear" }} />
          </span>
        )}
        {written ? (
          rough && !open ? (
            <button type="button" onClick={() => setOpen(true)} className="mt-2 font-mono text-[10.5px] text-ink-faint hover:text-ink underline decoration-dotted underline-offset-2">
              Hard to hear — show the rough reading
            </button>
          ) : (
            <>
              <Transcript text={written.text} code={clip.code} />
              <div className="mt-1.5">
                <Confidence value={written.confidence} model={written.model} checkedBy={written.checkedBy} />
              </div>
            </>
          )
        ) : (
          <p className={`mt-2 font-mono text-[10.5px] ${pending ? "shimmer-text" : "text-ink-faint"}`}>{pending ? "Transcribing…" : paused ? "Transcripts resume when today’s free allowance resets" : "No transcript"}</p>
        )}
      </span>
    </div>
  );
}
