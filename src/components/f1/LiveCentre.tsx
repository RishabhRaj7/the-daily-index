"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { F1Race } from "@/lib/types";
import type { LivePrediction, LiveRaceControl, LiveRadio, LiveRow, LiveSnapshot, LiveStints } from "@/lib/f1-live-types";
import { useF1Live } from "@/lib/use-f1-live";
import { driverPhotoByCode } from "@/lib/f1-assets";
import LiveTiming, { TeamGlyph, useF1Favourites } from "./LiveTiming";
import TyreIcon, { TYRE } from "./TyreIcon";
import TrackMap, { useTrack } from "./TrackMap";
import RaceStory from "./RaceStory";
import MapSheet from "./MapSheet";
import PastSessions from "./PastSessions";
import { LiveDot, SessionClock, TONE, sessionLine } from "./LiveCard";

// /f1/live — a session in full. One spacing scale throughout (panels 20px in,
// 24px apart), one panel header, figures in the paper's display face:
//   header     the meeting, where the session is, and the numbers that
//              matter right now as tiles (lap or clock, track, weather);
//              a band under it in the track's colour
//   jump bar   sticky, marking the part in view
//   timing     every car with sectors and mini-sectors · beside it the map
//              (the field estimated from the timing loops, the followed
//              driver's mini-sectors lit along the track) and race control
//   strategy   tyre stints · team radio with transcripts · the title, live
//   the race   positions lap by lap (races)
// Between sessions the same page carries the last session, final.

const clock = (utc: string) =>
  new Date(/Z|[+-]\d{2}:?\d{2}$/.test(utc) ? utc : `${utc}Z`).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// Race control shouts in capitals; the paper sets it in sentence case, with
// the acronyms and driver codes kept.
const sentence = (m: string) => {
  const s = (m === m.toUpperCase() ? m.toLowerCase() : m)
    .replace(/\b(fia|drs|vsc|sc|pu|cet|utc)\b/gi, (w) => w.toUpperCase())
    .replace(/\((\w{3})\)/g, (_, c: string) => `(${c.toUpperCase()})`);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function flagColour(flag: string | null, category: string): string {
  const f = (flag ?? "").toUpperCase();
  if (f.includes("CHEQUERED") || f.includes("BLACK")) return "var(--ink)";
  if (f === "RED") return "var(--down)";
  if (f.includes("YELLOW")) return "var(--f1-slower)";
  if (f === "GREEN" || f === "CLEAR") return "var(--f1-personal)";
  if (f === "BLUE") return "var(--f1-pit)";
  if (/SafetyCar/i.test(category)) return "var(--f1-slower)";
  return "var(--ink-faint)";
}

function Panel({ id, label, meta, children, className = "" }: { id?: string; label: string; meta?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 sm:p-5 scroll-mt-32 min-w-0 ${className}`} data-reveal>
      <header className="flex items-baseline justify-between gap-3 pb-3 mb-4 border-b hairline">
        <h2 className="font-label text-[10.5px] tracking-[0.12em]">{label}</h2>
        {meta && <span className="font-mono text-[10px] text-ink-faint text-right">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

function Tile({ label, value, unit, tone }: { label: string; value: React.ReactNode; unit?: string; tone?: string }) {
  return (
    <div className="rounded-xl border hairline px-3 pt-2.5 pb-2 min-w-0" style={tone ? { borderColor: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` } : undefined}>
      <div className="font-label text-[8.5px] text-ink-faint truncate">{label}</div>
      <div className="font-display font-extrabold text-[1.55rem] leading-none mt-1.5 tabular-nums truncate" style={tone ? { color: tone } : undefined}>
        {value}
        {unit && <span className="font-mono font-normal text-[10px] text-ink-soft ml-1">{unit}</span>}
      </div>
    </div>
  );
}

// ---- parts ---------------------------------------------------------------------

function FocusCard({ row, photo, snap }: { row: LiveRow; photo: string | null; snap: LiveSnapshot }) {
  return (
    <div className="flex items-center gap-3 mt-4 pt-4 border-t hairline">
      <span className="relative w-12 h-12 rounded-full overflow-hidden shrink-0" style={{ background: `color-mix(in srgb, ${row.colour} 30%, var(--paper))` }}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <TeamGlyph team={row.team} colour={row.colour} />
          <span className="font-sans font-bold text-[14px]">{row.name || row.code}</span>
          <span className="font-mono text-[11px] text-ink-soft">P{row.position}</span>
        </span>
        <span className="block font-mono text-[10.5px] text-ink-soft mt-1 truncate">
          {snap.type === "Race" ? (row.position === 1 ? "Leading" : `${row.gap || "—"} to the leader`) : `Best ${row.best || "—"}`} · last {row.last || "—"}
        </span>
      </span>
      {row.tyre && (
        <span className="flex flex-col items-center gap-0.5">
          <TyreIcon compound={row.tyre.compound} fresh={row.tyre.fresh} size={22} />
          <span className="font-mono text-[9.5px] text-ink-soft">{row.tyre.laps} laps</span>
        </span>
      )}
    </div>
  );
}

function Strategy({ stints, total, highlight }: { stints: LiveStints[]; total: number; highlight: Set<string> }) {
  const scale = Math.max(total, ...stints.map((d) => d.stints.reduce((n, s) => n + s.laps, 0)), 1);
  return (
    <>
      <div className="space-y-[5px]">
        {stints.map((d, row) => (
          <div key={d.code} className={`grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 ${highlight.size && !highlight.has(d.code) ? "opacity-80" : ""}`}>
            <span className="flex items-center gap-1.5 font-sans font-bold text-[11.5px]">
              <span className="w-[3px] h-3 rounded-full" style={{ background: d.colour }} />
              {d.code}
            </span>
            <span className="flex h-[18px] gap-[3px]">
              {d.stints.map((s, i) => {
                const t = TYRE[s.compound];
                return (
                  <span
                    key={i}
                    className="stint-in h-full rounded-[5px] flex items-center justify-center font-mono text-[9.5px] font-bold overflow-hidden border"
                    style={{
                      width: `${(Math.max(s.laps, 0.6) / scale) * 100}%`,
                      background: `color-mix(in srgb, ${t.colour} ${s.fresh ? 26 : 13}%, transparent)`,
                      borderColor: `color-mix(in srgb, ${t.colour} ${s.fresh ? 75 : 40}%, transparent)`,
                      color: t.colour,
                      animationDelay: `${row * 22 + i * 60}ms`,
                    }}
                    title={`${t.name}${s.fresh ? "" : " (used)"} · ${s.laps} laps`}
                  >
                    {s.laps >= 3 ? `${t.letter}${s.laps >= 6 ? ` ${s.laps}` : ""}` : ""}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-4 mt-4 border-t hairline font-mono text-[10px] text-ink-soft">
        {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <TyreIcon compound={c} size={13} /> {TYRE[c].name}
          </span>
        ))}
        <span className="text-ink-faint">Faint = a used set</span>
      </div>
    </>
  );
}

function RaceControl({ items }: { items: LiveRaceControl[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return (
    <>
      <ol>
        {shown.map((m, i) => (
          <li key={`${m.utc}-${i}`} className="grid grid-cols-[2.8rem_minmax(0,1fr)] gap-3 border-t hairline first:border-t-0 py-2.5">
            <span className="font-mono text-[10.5px] text-ink-soft tabular-nums leading-tight">
              {clock(m.utc)}
              {m.lap != null && <span className="block text-ink-faint">L{m.lap}</span>}
            </span>
            <span className="text-[12.5px] leading-snug">
              {(m.flag || m.category !== "Other") && (
                <span className="flex items-center gap-1.5 font-label text-[8.5px] mb-0.5" style={{ color: flagColour(m.flag, m.category) }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
                  {m.flag ? m.flag.toLowerCase() : m.category.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}
                </span>
              )}
              {sentence(m.message)}
            </span>
          </li>
        ))}
      </ol>
      {items.length > 8 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-3">
          {all ? "Fewer messages" : `All ${items.length} messages`}
        </button>
      )}
    </>
  );
}

/** Transcripts for the clips on show: kept ones at once, new ones as they're written. */
interface Written {
  text: string;
  confidence: number | null;
  model: string;
}

function useTranscripts(clips: LiveRadio[]): { text: Record<string, Written>; pending: boolean } {
  const [text, setText] = useState<Record<string, Written>>({});
  const [pending, setPending] = useState(true);
  const ids = clips.map((c) => c.url).join("|");
  useEffect(() => {
    if (!ids) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      const q = new URLSearchParams();
      for (const c of clips) {
        q.append("u", c.url);
        q.append("w", c.code);
      }
      try {
        const res = await fetch(`/api/f1/radio?${q}`);
        const d = (await res.json()) as { transcripts: Record<string, Written>; pending: number };
        if (stop) return;
        setText((t) => ({ ...t, ...d.transcripts }));
        setPending(d.pending > 0);
        if (d.pending > 0) timer = setTimeout(ask, 4000);
      } catch {
        if (!stop) setPending(false);
      }
    };
    void ask();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return { text, pending };
}

/** How sure the transcriber is: five pips and a word, never a bare percentage. */
function Confidence({ value, model }: { value: number | null; model: string }) {
  if (value === null) return null;
  const pips = Math.max(1, Math.round(value * 5));
  const word = value >= 0.85 ? "Clear" : value >= 0.65 ? "Mostly clear" : value >= 0.45 ? "Rough" : "Hard to hear";
  const tone = value >= 0.85 ? "var(--f1-personal)" : value >= 0.65 ? "var(--f1-slower)" : "var(--down)";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] text-ink-faint" title={`Machine transcript (${model}) · confidence ${Math.round(value * 100)}%`}>
      <span className="flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: i < pips ? tone : "var(--rule)" }} />
        ))}
      </span>
      {word} · AI transcript
    </span>
  );
}

function Said({ text }: { text: string }) {
  // Words the transcriber couldn't make out stay visible as such.
  return (
    <>
      {text.split(/(\[(?:unclear|bleep)\])/i).map((part, i) =>
        /^\[(unclear|bleep)\]$/i.test(part) ? (
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

function Transcript({ text, code }: { text: string; code: string }) {
  // Turns start at a speaker label, wherever the model put them (a new line
  // or mid-line: "… Engineer: Well done Max. VER: Yeah, …").
  const turns = text
    .split(new RegExp(`(?:^|\\s+|\\n+)(?=(?:Engineer|${code}|Driver):\\s)`, "i"))
    .map((t) => t.trim())
    .filter(Boolean);
  return (
    <div className="mt-2 space-y-1">
      {turns.map((line, i) => {
        const m = /^([^:]{2,12}):\s*([\s\S]*)$/.exec(line);
        const who = m?.[1] ?? "";
        const said = m ? m[2] : line;
        const driver = who.toUpperCase() === code || (who !== "" && who.toLowerCase() !== "engineer");
        return (
          <p key={i} className="font-headline text-[14px] leading-snug">
            {who && <span className={`font-label text-[8.5px] mr-1.5 ${driver ? "" : "text-ink-faint"}`}>{driver ? code : "Engineer"}</span>}
            <span className={driver ? "" : "text-ink-soft"}>
              <Said text={said} />
            </span>
          </p>
        );
      })}
    </div>
  );
}

function Radio({ clips, photos }: { clips: LiveRadio[]; photos: Record<string, string> }) {
  const [all, setAll] = useState(false);
  const shown = all ? clips : clips.slice(0, 6);
  const { text, pending } = useTranscripts(shown);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = (c: LiveRadio) => {
    if (playing === c.url) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(c.url);
    audio.current = a;
    a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    a.onended = () => setPlaying(null);
    setProgress(0);
    a.play().then(
      () => setPlaying(c.url),
      () => setPlaying(null),
    );
  };
  return (
    <>
      <ol>
        {shown.map((c) => {
          const on = playing === c.url;
          return (
            <li key={c.url} className="flex gap-3 border-t hairline first:border-t-0 py-3">
              <span className="relative w-10 h-10 rounded-full overflow-hidden shrink-0" style={{ background: `color-mix(in srgb, ${c.colour} 30%, var(--paper))` }}>
                {photos[c.code] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[c.code]} alt="" className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-sans font-bold text-[13px]">{c.code}</span>
                  <span className="font-mono text-[10.5px] text-ink-faint tabular-nums">{clock(c.utc)}</span>
                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    className="ml-auto flex items-center gap-1.5 rounded-full border hairline h-7 pl-2 pr-3 font-sans text-[11.5px] font-semibold hover:border-[color:var(--ink-soft)] transition-colors"
                    aria-label={`${on ? "Pause" : "Play"} ${c.code}'s radio`}
                  >
                    <span className="w-4 h-4 rounded-full grid place-items-center" style={{ background: c.colour }}>
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
                    <span className="block h-full" style={{ width: `${progress * 100}%`, background: c.colour, transition: "width 0.25s linear" }} />
                  </span>
                )}
                {text[c.url] ? (
                  <>
                    <Transcript text={text[c.url].text} code={c.code} />
                    <div className="mt-1.5">
                      <Confidence value={text[c.url].confidence} model={text[c.url].model} />
                    </div>
                  </>
                ) : (
                  <p className={`mt-2 font-mono text-[10.5px] ${pending ? "shimmer-text" : "text-ink-faint"}`}>{pending ? "Transcribing…" : "No transcript"}</p>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {clips.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-3">
          {all ? "Fewer clips" : `All ${clips.length} clips`}
        </button>
      )}
    </>
  );
}

function TitleRow({ label, team, colour, position, predicted, points, predictedPoints, mine }: { label: string; team?: string; colour: string; position: number; predicted: number; points: number; predictedPoints: number; mine?: boolean }) {
  const moved = position - predicted;
  return (
      <li
        className="grid grid-cols-[1.6rem_minmax(0,1fr)_1.8rem_3rem_3rem] items-center gap-2 border-t hairline first:border-t-0 py-[6px] text-[12.5px]"
        style={mine ? { background: `color-mix(in srgb, ${colour} 12%, transparent)` } : undefined}
      >
        <span className="font-mono text-[11px] text-ink-soft tabular-nums pl-1">{predicted}</span>
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: colour }} />
          {team && <TeamGlyph team={team} colour={colour} />}
          <span className="font-sans font-bold truncate">{label}</span>
        </span>
        <span className="font-mono text-[10px] text-center" style={{ color: moved > 0 ? "var(--f1-personal)" : moved < 0 ? "var(--down)" : "var(--ink-faint)" }}>
          {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "–"}
        </span>
        <span className="font-mono text-[12px] tabular-nums text-right">{Math.round(predictedPoints)}</span>
        <span className="font-mono text-[10.5px] tabular-nums text-right" style={{ color: predictedPoints > points ? "var(--f1-personal)" : "var(--ink-faint)" }}>
          {predictedPoints > points ? `+${Math.round(predictedPoints - points)}` : "—"}
        </span>
      </li>
  );
}

function Title({ p, fav }: { p: LivePrediction; fav: Set<string> }) {
  return (
    <div className="grid sm:grid-cols-2 gap-6">
      <div>
        <div className="font-label text-[9px] text-ink-faint mb-2">Drivers</div>
        <ol>
          {p.drivers.slice(0, 10).map((d) => (
            <TitleRow key={d.code} label={d.code} {...d} mine={fav.has(d.code)} />
          ))}
        </ol>
      </div>
      <div>
        <div className="font-label text-[9px] text-ink-faint mb-2">Constructors</div>
        <ol>
          {p.teams.slice(0, 10).map((t) => (
            <TitleRow key={t.name} label={t.name} team={t.name} {...t} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function NextUp({ race, next }: { race: F1Race | null; next: string | null }) {
  const [now] = useState(() => Date.now());
  const upcoming = (race?.sessions ?? []).filter((s) => Date.parse(s.end || s.start) > now);
  const first = upcoming[0];
  const at = first ? new Date(first.start) : next ? new Date(next) : null;
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 sm:p-5 grid md:grid-cols-[minmax(0,1fr)_auto] gap-5 items-center" data-reveal>
      <div>
        <div className="flex items-center gap-2 font-label text-[10px] text-ink-soft">
          <LiveDot running={false} /> Nothing on track right now
        </div>
        <p className="font-headline text-[1.45rem] leading-tight mt-2">
          {first && at
            ? `${race?.name}: ${first.name}, ${at.toLocaleDateString("en-GB", { weekday: "long" })} at ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`
            : "The next session isn’t on the calendar yet."}
        </p>
        <p className="text-[12.5px] text-ink-soft mt-1.5">This page goes live by itself a quarter of an hour before the start. Below, the last session in full.</p>
      </div>
      {upcoming.length > 1 && (
        <ol className="flex flex-wrap md:flex-col gap-x-5 gap-y-1.5 md:min-w-[15rem]">
          {upcoming.slice(0, 5).map((s) => (
            <li key={s.name} className="flex justify-between gap-4 text-[12.5px]">
              <span>{s.name}</span>
              <span className="font-mono text-[11px] text-ink-soft tabular-nums">
                {new Date(s.start).toLocaleDateString("en-GB", { weekday: "short" })} {new Date(s.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The jump bar's current part: the last one whose top has passed the bar. */
function useInView(ids: string[]): string | null {
  const [cur, setCur] = useState<string | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    const onScroll = () => {
      let at: string | null = null;
      for (const id of key.split(",")) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 180) at = id;
      }
      setCur(at);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [key]);
  return cur;
}

// ---- the page -------------------------------------------------------------------

function Session({ snap, live }: { snap: LiveSnapshot; live: boolean }) {
  const [enlarged, setEnlarged] = useState(false);
  const fav = useF1Favourites();
  const favCodes = fav.codes;
  const [picked, setPicked] = useState<string | null>(null);
  const defaultFocus = snap.rows.find((r) => favCodes.has(r.code) && !r.out)?.code ?? snap.rows[0]?.code ?? null;
  const focus = picked && snap.rows.some((r) => r.code === picked) ? picked : defaultFocus;
  const focusRow = snap.rows.find((r) => r.code === focus);
  const highlight = useMemo(() => new Set([...favCodes, ...(focus ? [focus] : [])]), [favCodes, focus]);
  const track = useTrack(snap.circuitKey);
  const photos = snap.photos ?? {};
  const race = snap.type === "Race";
  const tone = TONE[snap.track.tone];

  const parts = [
    { id: "timing", label: "Timing" },
    ...(track ? [{ id: "track", label: "Track" }] : []),
    ...(snap.stints?.some((d) => d.stints.length) ? [{ id: "strategy", label: "Strategy" }] : []),
    ...(snap.radio?.length ? [{ id: "radio", label: "Radio" }] : []),
    ...(snap.prediction ? [{ id: "title", label: "Title" }] : []),
    ...(snap.lapPositions?.length ? [{ id: "story", label: "Race story" }] : []),
  ];
  const inView = useInView(parts.map((p) => p.id));

  // Arriving at /f1/live#race-control (from the Pit wall): go there once drawn.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !location.hash) return;
    jumped.current = true;
    requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const lapOrClock = race && snap.lap ? (
    <Tile label="Lap" value={`${snap.lap.current}`} unit={`/ ${snap.lap.total}`} />
  ) : (
    <Tile label={live ? (snap.partLabel ? `${snap.partLabel} · time left` : "Time left") : "Fastest lap"} value={live && snap.running ? <SessionClock snap={snap} /> : (snap.rows.find((r) => r.bestFastest)?.best ?? "—")} unit={live ? undefined : snap.rows.find((r) => r.bestFastest)?.code} />
  );

  return (
    <>
      {/* where the session is, at a glance */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-6">
        {lapOrClock}
        {live ? (
          <Tile label="Track" value={snap.track.tone === "green" ? "Green" : snap.track.label} tone={snap.track.tone === "green" ? undefined : tone.bg} />
        ) : (
          <Tile label="Session" value="Final" />
        )}
        {snap.weather ? (
          <>
            <Tile label="Air" value={snap.weather.air.toFixed(1)} unit="°C" />
            <Tile label="Track temp" value={snap.weather.track.toFixed(1)} unit="°C" />
            <Tile label="Humidity" value={Math.round(snap.weather.humidity)} unit="%" />
            <Tile label={snap.weather.rain ? "Rain" : "Wind"} value={snap.weather.rain ? "Wet" : snap.weather.wind.toFixed(1)} unit={snap.weather.rain ? undefined : "m/s"} tone={snap.weather.rain ? "var(--f1-pit)" : undefined} />
          </>
        ) : null}
      </div>
      <div className="h-[3px] rounded-full mt-6" style={{ background: !live || snap.track.tone === "green" ? "var(--hue-f1)" : tone.bg }} />

      <nav aria-label="Parts of the session" className="sticky top-[3.6rem] z-30 mt-6 -mx-1 flex">
        <div className="glass border hairline rounded-full p-1 flex gap-0.5 overflow-x-auto max-w-full [scrollbar-width:none]">
          {parts.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              className={`rounded-full px-3.5 h-8 flex items-center text-[12.5px] font-sans font-semibold whitespace-nowrap transition-colors ${inView === p.id ? "text-[color:var(--paper)]" : "text-ink-soft hover:text-ink"}`}
              style={inView === p.id ? { background: "var(--ink)" } : undefined}
            >
              {p.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] gap-6 items-start mt-6">
        <Panel
          id="timing"
          label={live ? "Timing" : "Final classification"}
          meta={live ? `Read ${new Date(snap.at).toLocaleTimeString("en-GB")} · every 5 s · tap a driver to follow` : "Tap a driver to follow on the map"}
        >
          <LiveTiming snap={snap} wide focus={focus} onFocus={setPicked} />
        </Panel>

        <div className="flex flex-col gap-6 lg:sticky lg:top-28">
          {track && (
            <Panel id="track" label={track.name || "Track"} meta={live ? "Cars placed from the timing loops" : `${track.corners.length} corners`}>
              <TrackMap model={track} snap={snap} focus={focus} onFocus={setPicked} onExpand={() => setEnlarged(true)} />
              {enlarged && <MapSheet model={track} snap={snap} focus={focus} onFocus={setPicked} onClose={() => setEnlarged(false)} />}
              {focusRow && <FocusCard row={focusRow} photo={photos[focusRow.code] ?? driverPhotoByCode(focusRow.code, focusRow.team)} snap={snap} />}
              {focusRow && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 font-mono text-[9.5px] text-ink-faint">
                  <span>{focusRow.code}&rsquo;s mini-sectors:</span>
                  <span style={{ color: "var(--f1-fastest)" }}>■ session best</span>
                  <span style={{ color: "var(--f1-personal)" }}>■ personal best</span>
                  <span style={{ color: "var(--f1-slower)" }}>■ slower</span>
                </div>
              )}
            </Panel>
          )}
          {snap.raceControl?.length ? (
            <Panel id="race-control" label="Race control" meta="Newest first">
              <RaceControl items={snap.raceControl} />
            </Panel>
          ) : null}
        </div>
      </div>

      {snap.stints?.some((d) => d.stints.length) && (
        <Panel id="strategy" label="Tyre strategy" meta={race && snap.lap ? `${snap.lap.total} laps` : "Laps on each set"} className="mt-6">
          <Strategy stints={snap.stints} total={race ? (snap.lap?.total ?? 0) : 0} highlight={highlight} />
        </Panel>
      )}

      {(snap.radio?.length || snap.prediction) && (
        <div className={`grid gap-6 mt-6 items-start ${snap.radio?.length && snap.prediction ? "lg:grid-cols-2" : ""}`}>
          {snap.radio?.length ? (
            <Panel id="radio" label="Team radio" meta="Newest first · transcribed">
              <Radio clips={snap.radio} photos={photos} />
            </Panel>
          ) : null}
          {snap.prediction && (
            <Panel id="title" label="The title, live" meta="F1's projection if the race ended now">
              <Title p={snap.prediction} fav={favCodes} />
            </Panel>
          )}
        </div>
      )}

      {snap.lapPositions && snap.lapPositions.length > 0 && (
        <Panel id="story" label="The race, lap by lap" meta="Position at the end of each lap" className="mt-6">
          <RaceStory data={snap.lapPositions} highlight={highlight} />
        </Panel>
      )}
    </>
  );
}

export default function LiveCentre({ race }: { race: F1Race | null }) {
  // ?session=<archive path>: a past session, kept in the address so it can be shared or reloaded.
  const [past, setPast] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setPast(new URLSearchParams(location.search).get("session"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const pick = (path: string | null) => {
    const url = new URL(location.href);
    if (path) url.searchParams.set("session", path);
    else url.searchParams.delete("session");
    history.pushState(null, "", url);
    setPast(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const { snapshot, last, next, checked } = useF1Live({ full: true, always: !past, session: past });
  const live = !past && !!snapshot;
  const snap = live ? snapshot : last;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Link href="/#paddock-notes" className="chip">
          <span aria-hidden="true">←</span> Pit wall
        </Link>
        <span className="flex items-center gap-2">
          <PastSessions current={past} onPick={pick} />
          {snap && (
            <span className="flex items-center gap-2 rounded-full border hairline h-8 px-3 font-label text-[9.5px]">
              <LiveDot running={live && snap.running} />
              <span style={{ color: live && snap.running ? "var(--hue-f1)" : undefined }}>
                {live ? (snap.running ? "Live" : snap.status === "Inactive" ? "Starting soon" : "Chequered flag") : past ? "Archive" : "Final"}
              </span>
            </span>
          )}
        </span>
      </div>

      <header className="mt-8" data-reveal="fade">
        <div className="font-label text-[10px] text-ink-soft">
          {snap ? `${snap.location} · ${sessionLine(snap)}` : "Live centre"}
        </div>
        <h1 className="font-display font-extrabold uppercase text-[clamp(2.8rem,9vw,6.5rem)] leading-[0.84] mt-3">
          {snap?.meeting ?? race?.name ?? "Live centre"}
        </h1>
      </header>

      {!checked && <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] mt-8 h-72 animate-pulse" />}
      {checked && !live && !past && (
        <div className="mt-8">
          <NextUp race={race} next={next} />
        </div>
      )}
      {past && checked && !snap && (
        <p className="mt-8 font-mono text-[11px] text-ink-faint">F1&rsquo;s archive hasn&rsquo;t published that session yet.</p>
      )}
      {snap && <Session snap={snap} live={live} />}
    </>
  );
}
