"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { F1Race } from "@/lib/types";
import type { LivePrediction, LiveRaceControl, LiveRadio, LiveSnapshot, LiveStints } from "@/lib/f1-live-types";
import { useF1Live } from "@/lib/use-f1-live";
import LiveTiming, { useF1Favourites } from "./LiveTiming";
import TyreIcon, { TYRE } from "./TyreIcon";
import { LiveDot, SessionClock, TONE, sessionLine } from "./LiveCard";

// /f1/live: the whole of a live session, one scroll. A sticky jump bar leads
// to each part; race control, radio and the projected title fight only
// appear when they have something in them.

const time = (utc: string) =>
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

function Module({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="module scroll-mt-32" data-reveal>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display font-extrabold text-[1.5rem] leading-none">{title}</h2>
        {note && <span className="font-mono text-[10px] text-ink-faint">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Strategy({ stints, total }: { stints: LiveStints[]; total: number }) {
  const scale = Math.max(total, ...stints.map((d) => d.stints.reduce((n, s) => n + s.laps, 0)), 1);
  return (
    <div className="space-y-[5px]">
      {stints.map((d, row) => (
        <div key={d.code} className="grid grid-cols-[2.6rem_minmax(0,1fr)] items-center gap-2">
          <span className="flex items-center gap-1.5 font-sans font-bold text-[11.5px]">
            <span className="w-[3px] h-3 rounded-full" style={{ background: d.colour }} />
            {d.code}
          </span>
          <span className="flex h-4 gap-[3px]">
            {d.stints.map((s, i) => {
              const t = TYRE[s.compound];
              return (
                <span
                  key={i}
                  className="stint-in h-full rounded-[4px] flex items-center justify-center font-mono text-[9.5px] font-bold overflow-hidden border"
                  style={{
                    width: `${(Math.max(s.laps, 0.6) / scale) * 100}%`,
                    background: `color-mix(in srgb, ${t.colour} ${s.fresh ? 30 : 16}%, transparent)`,
                    borderColor: `color-mix(in srgb, ${t.colour} ${s.fresh ? 75 : 45}%, transparent)`,
                    color: t.colour,
                    animationDelay: `${row * 25 + i * 60}ms`,
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
      <div className="flex flex-wrap gap-3 pt-2 font-mono text-[10px] text-ink-soft">
        {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
          <span key={c} className="flex items-center gap-1">
            <TyreIcon compound={c} size={13} /> {TYRE[c].name}
          </span>
        ))}
        <span>· paler = used set</span>
      </div>
    </div>
  );
}

function RaceControl({ items }: { items: LiveRaceControl[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 12);
  return (
    <>
      <ol>
        {shown.map((m, i) => (
          <li key={`${m.utc}-${i}`} className="grid grid-cols-[3.2rem_minmax(0,1fr)] gap-3 border-t hairline first:border-t-0 py-2">
            <span className="font-mono text-[10.5px] text-ink-soft tabular-nums">
              {time(m.utc)}
              {m.lap != null && <span className="block text-ink-faint">L{m.lap}</span>}
            </span>
            <span className="text-[12.5px] leading-snug">
              {(m.flag || m.category !== "Other") && (
                <span className="inline-flex items-center gap-1 font-label text-[8.5px] mr-1.5 align-[1px]" style={{ color: flagColour(m.flag, m.category) }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
                  {m.flag ? m.flag.toLowerCase() : m.category.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}
                </span>
              )}
              {sentence(m.message)}
            </span>
          </li>
        ))}
      </ol>
      {items.length > 12 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-2">
          {all ? "Fewer messages" : `All ${items.length} messages`}
        </button>
      )}
    </>
  );
}

function RadioClip({ clip, playing, onToggle }: { clip: LiveRadio; playing: boolean; onToggle: () => void }) {
  return (
    <li className="flex items-center gap-3 border-t hairline first:border-t-0 py-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-8 h-8 rounded-full grid place-items-center shrink-0 transition-transform active:scale-95"
        style={{ background: `color-mix(in srgb, ${clip.colour} 18%, transparent)`, color: clip.colour }}
        aria-label={`${playing ? "Pause" : "Play"} ${clip.code}'s radio`}
      >
        {playing ? (
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" aria-hidden="true">
            <rect x="2.5" y="2" width="2.6" height="8" rx="0.6" />
            <rect x="6.9" y="2" width="2.6" height="8" rx="0.6" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" className="w-3 h-3 ml-0.5" fill="currentColor" aria-hidden="true">
            <path d="M3 1.8v8.4c0 .5.5.8.9.5l6.4-4.2c.4-.3.4-.8 0-1.1L3.9 1.3c-.4-.3-.9 0-.9.5z" />
          </svg>
        )}
      </button>
      <span className="font-sans font-bold text-[12.5px]">{clip.code}</span>
      <span className={`flex-1 h-[3px] rounded-full overflow-hidden ${playing ? "bg-[var(--rule)]" : ""}`}>
        {playing && <span className="block h-full radio-progress" style={{ background: clip.colour }} />}
      </span>
      <span className="font-mono text-[10.5px] text-ink-soft tabular-nums">{time(clip.utc)}</span>
    </li>
  );
}

function Radio({ clips }: { clips: LiveRadio[] }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [all, setAll] = useState(false);
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
    a.onended = () => setPlaying(null);
    a.play().then(
      () => {
        setPlaying(c.url);
        document.documentElement.style.setProperty("--radio-ms", `${Math.round((a.duration || 8) * 1000)}ms`);
      },
      () => setPlaying(null),
    );
  };
  return (
    <>
      <ol>
        {(all ? clips : clips.slice(0, 10)).map((c) => (
          <RadioClip key={c.url} clip={c} playing={playing === c.url} onToggle={() => toggle(c)} />
        ))}
      </ol>
      {clips.length > 10 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-2">
          {all ? "Fewer clips" : `All ${clips.length} clips`}
        </button>
      )}
    </>
  );
}

function Title({ p }: { p: LivePrediction }) {
  const fav = useF1Favourites().codes;
  const Row = ({ label, colour, position, predicted, points, predictedPoints, mine }: { label: string; colour: string; position: number; predicted: number; points: number; predictedPoints: number; mine?: boolean }) => {
    const moved = position - predicted;
    return (
      <li
        className="grid grid-cols-[1.5rem_minmax(0,1fr)_1.6rem_3.2rem_3.4rem] items-center gap-2 border-t hairline first:border-t-0 py-[5px] text-[12px]"
        style={mine ? { background: `color-mix(in srgb, ${colour} 12%, transparent)` } : undefined}
      >
        <span className="font-mono text-[11px] text-ink-soft tabular-nums">{predicted}</span>
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: colour }} />
          <span className="font-sans font-bold truncate">{label}</span>
        </span>
        <span className="font-mono text-[10px] text-center" style={{ color: moved > 0 ? "var(--f1-personal)" : moved < 0 ? "var(--down)" : "var(--ink-faint)" }}>
          {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "–"}
        </span>
        <span className="font-mono text-[11.5px] tabular-nums text-right">{Math.round(predictedPoints)}</span>
        <span className="font-mono text-[10.5px] tabular-nums text-right text-ink-soft">{predictedPoints > points ? `+${Math.round(predictedPoints - points)}` : "—"}</span>
      </li>
    );
  };
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <div className="font-label text-[9px] text-ink-soft mb-1">Drivers · if it finished now</div>
        <ol>{p.drivers.slice(0, 10).map((d) => <Row key={d.code} label={d.code} {...d} mine={fav.has(d.code)} />)}</ol>
      </div>
      <div>
        <div className="font-label text-[9px] text-ink-soft mb-1">Constructors · if it finished now</div>
        <ol>{p.teams.map((t) => <Row key={t.name} label={t.name} {...t} />)}</ol>
      </div>
    </div>
  );
}

function Waiting({ race, next }: { race: F1Race | null; next: string | null }) {
  const [now] = useState(() => Date.now());
  const upcoming = (race?.sessions ?? []).filter((s) => Date.parse(s.end || s.start) > now);
  const first = upcoming[0];
  const at = first ? new Date(first.start) : next ? new Date(next) : null;
  return (
    <div className="module mt-8" data-reveal>
      <div className="flex items-center gap-2 font-label text-[10px] text-ink-soft">
        <LiveDot running={false} /> Nothing on track right now
      </div>
      <p className="font-headline text-[1.6rem] leading-tight mt-3 max-w-[30ch]">
        {first && at
          ? `${race?.name}: ${first.name} starts ${at.toLocaleDateString("en-GB", { weekday: "long" })} at ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`
          : "The next session isn’t on the calendar yet."}
      </p>
      <p className="text-[13px] text-ink-soft mt-2">This page goes live by itself a quarter of an hour before the start. Leave it open.</p>
      {upcoming.length > 1 && (
        <ol className="mt-5 max-w-md">
          {upcoming.map((s) => (
            <li key={s.name} className="flex justify-between border-t hairline py-2 text-[13px]">
              <span>{s.name}</span>
              <span className="font-mono text-[11px] text-ink-soft">
                {new Date(s.start).toLocaleDateString("en-GB", { weekday: "short" })} · {new Date(s.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function LiveCentre({ race }: { race: F1Race | null }) {
  const { snapshot: snap, next, checked } = useF1Live({ full: true, always: true });

  // Arriving at /f1/live#race-control: go there once the parts exist.
  const jumped = useRef(false);
  useEffect(() => {
    if (!snap || jumped.current || !location.hash) return;
    jumped.current = true;
    requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [snap]);

  const parts = snap
    ? [
        { id: "timing", label: "Timing" },
        ...(snap.stints?.some((d) => d.stints.length) ? [{ id: "strategy", label: "Strategy" }] : []),
        ...(snap.raceControl?.length ? [{ id: "race-control", label: "Race control" }] : []),
        ...(snap.radio?.length ? [{ id: "radio", label: "Radio" }] : []),
        ...(snap.prediction ? [{ id: "title", label: "Title" }] : []),
      ]
    : [];

  return (
    <>
      <Link href="/#paddock-notes" className="chip mb-8">
        <span aria-hidden="true">←</span> Back to the Pit wall
      </Link>

      <header data-reveal="fade">
        <div className="flex items-center gap-2 font-label text-[10px]">
          <LiveDot running={!!snap?.running} />
          <span style={{ color: snap?.running ? "var(--hue-f1)" : undefined }} className={snap?.running ? "" : "text-ink-soft"}>
            {snap ? (snap.running ? "Live" : snap.status === "Inactive" ? "Starting soon" : "Chequered flag") : "Live centre"}
          </span>
          {snap && <span className="text-ink-soft">{sessionLine(snap)}</span>}
        </div>
        <h1 className="font-display font-extrabold uppercase text-[clamp(2.6rem,9vw,6.5rem)] leading-[0.84] mt-3">
          {snap?.meeting ?? race?.name ?? "Live centre"}
        </h1>
        <div className="mt-5 h-[3px] rule-draw" style={{ background: "var(--hue-f1)" }} />
        {snap && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {snap.track.tone !== "green" && (
              <span className="rounded-full px-2.5 py-1 font-label text-[9px]" style={{ background: TONE[snap.track.tone].bg, color: TONE[snap.track.tone].fg }}>
                {snap.track.label}
              </span>
            )}
            {snap.running && (
              <span className="chip h-7 text-[11px] gap-1.5">
                <span className="font-label text-[8.5px] text-ink-faint">Clock</span>
                <SessionClock snap={snap} />
              </span>
            )}
            {snap.weather && (
              <>
                <span className="chip h-7 text-[11px] gap-1.5">
                  <span className="font-label text-[8.5px] text-ink-faint">Air</span>
                  {snap.weather.air.toFixed(1)}°
                </span>
                <span className="chip h-7 text-[11px] gap-1.5">
                  <span className="font-label text-[8.5px] text-ink-faint">Track</span>
                  {snap.weather.track.toFixed(1)}°
                </span>
                <span className="chip h-7 text-[11px] gap-1.5">
                  <span className="font-label text-[8.5px] text-ink-faint">Humidity</span>
                  {Math.round(snap.weather.humidity)}%
                </span>
                <span className="chip h-7 text-[11px] gap-1.5">
                  <span className="font-label text-[8.5px] text-ink-faint">Wind</span>
                  {snap.weather.wind.toFixed(1)} m/s
                </span>
                <span className="chip h-7 text-[11px] gap-1.5" style={snap.weather.rain ? { borderColor: "var(--f1-pit)", color: "var(--f1-pit)" } : undefined}>
                  {snap.weather.rain ? "Raining" : "Dry"}
                </span>
              </>
            )}
          </div>
        )}
      </header>

      {!checked && <div className="module mt-8 h-64 animate-pulse" />}
      {checked && !snap && <Waiting race={race} next={next} />}

      {snap && (
        <>
          <nav aria-label="Live centre" className="sticky top-14 z-30 glass -mx-4 sm:mx-0 px-4 sm:px-3 sm:rounded-full mt-8 mb-5 flex gap-1 overflow-x-auto [scrollbar-width:none] border hairline">
            {parts.map((p) => (
              <a key={p.id} href={`#${p.id}`} className="px-3 py-2 text-[12.5px] font-sans font-semibold text-ink-soft hover:text-ink whitespace-nowrap">
                {p.label}
              </a>
            ))}
          </nav>
          <div className="space-y-5">
            <Module id="timing" title="Timing" note={`Every 5 seconds · read ${new Date(snap.at).toLocaleTimeString("en-GB")}`}>
              <LiveTiming snap={snap} wide />
            </Module>
            {snap.stints?.some((d) => d.stints.length) && (
              <Module id="strategy" title="Strategy" note={snap.type === "Race" && snap.lap ? `${snap.lap.total} laps` : "Laps on each set"}>
                <Strategy stints={snap.stints} total={snap.type === "Race" ? (snap.lap?.total ?? 0) : 0} />
              </Module>
            )}
            {(snap.raceControl?.length || snap.radio?.length) && (
              <div className="grid lg:grid-cols-2 gap-5 items-start">
                {snap.raceControl?.length ? (
                  <Module id="race-control" title="Race control" note="Newest first">
                    <RaceControl items={snap.raceControl} />
                  </Module>
                ) : null}
                {snap.radio?.length ? (
                  <Module id="radio" title="Team radio" note="Newest first">
                    <Radio clips={snap.radio} />
                  </Module>
                ) : null}
              </div>
            )}
            {snap.prediction && (
              <Module id="title" title="The title, live" note="F1's projection if the race ended now">
                <Title p={snap.prediction} />
              </Module>
            )}
          </div>
        </>
      )}
    </>
  );
}
