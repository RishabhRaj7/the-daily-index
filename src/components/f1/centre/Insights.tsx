"use client";

import { CarProfileIcon, CrownIcon, FlagCheckeredIcon, FlagIcon, GavelIcon, type Icon, MicrophoneIcon, PauseIcon, PlayIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { LiveSnapshot } from "@/lib/f1-live-types";
import { driverPhotoByCode } from "@/lib/f1-assets";
import type { Insights, SessionRecap, TurnKind } from "@/lib/live/f1-insights";
import { splitFirstSentence } from "@/lib/format";
import { PHONE, useMedia } from "@/lib/use-media";
import { goToView } from "../live-views";
import { usePlayer } from "./Radio";

// A finished session, written up (lib/live/f1-insights.ts), in the live centre's
// own cards. The recap sits on the Weekend under the session it's about, with the
// race result card's chequered edge: a headline, the story, and for a race its flags
// along a lap bar with the turning points under it. A phone gets the first sentence
// with More in place. The moments lead the Feed: cards in the team's colour, like the
// paddock card, three across, stacked in the narrow Feed column, a row to swipe on a
// phone. With nothing written, none of this shows, and neither shows during a session.

const EMPTY: Insights = { recap: null, moments: [] };

export function useInsights(snap: LiveSnapshot | null): Insights {
  const path = snap && !snap.running ? snap.path : null;
  const [got, setGot] = useState<{ path: string; data: Insights } | null>(null);
  useEffect(() => {
    if (!path) return;
    let on = true;
    fetch(`/api/f1/insights?session=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Insights>) : EMPTY))
      .then((data) => on && setGot({ path, data }))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [path]);
  return got && got.path === path ? got.data : EMPTY;
}

const TURN: Record<TurnKind, { Glyph: Icon; colour: string }> = {
  "safety-car": { Glyph: CarProfileIcon, colour: "#ff9f1a" },
  "red-flag": { Glyph: FlagIcon, colour: "var(--down)" },
  penalty: { Glyph: GavelIcon, colour: "var(--down)" },
  lead: { Glyph: CrownIcon, colour: "#e8b418" },
  retirement: { Glyph: WarningIcon, colour: "var(--ink-soft)" },
};
const BAND = { vsc: "var(--f1-slower)", sc: "#ff9f1a", red: "var(--down)" };

function LapBar({ recap }: { recap: SessionRecap }) {
  const total = recap.laps ?? 0;
  const ticks = [1, ...[20, 40, 60].filter((l) => l < total - 6), total];
  return (
    <>
      <div className="font-label text-[11px] text-ink-faint flex justify-between">
        <span>The race, lap by lap</span>
        <span>{total} laps</span>
      </div>
      <div className="recap-track" role="img" aria-label={`${recap.bands.length} stretches under a flag across ${total} laps`}>
        {recap.bands.map((b, i) => (
          <i key={i} style={{ left: `${((b.from - 1) / total) * 100}%`, width: `${Math.max(1.2, ((b.to - b.from + 1) / total) * 100)}%`, background: BAND[b.kind] }} />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-ink-faint mt-1" aria-hidden="true">
        {ticks.map((l) => (
          <span key={l}>L{l}</span>
        ))}
      </div>
    </>
  );
}

export function SessionRecapCard({ recap }: { recap: SessionRecap }) {
  const phone = useMedia(PHONE);
  const [open, setOpen] = useState(false);
  const [first, rest] = splitFirstSentence(recap.story);
  const race = recap.laps !== null;
  return (
    <section className="module overflow-hidden" aria-label={`${recap.session}, in short`}>
      <div className="result-check" aria-hidden="true" />
      <div className={race ? "recap-grid" : ""}>
        <div className="min-w-0">
          <div className="font-label text-[11px] tracking-[0.1em] flex items-center gap-1.5" style={{ color: "var(--hue-f1)" }}>
            <FlagCheckeredIcon size={15} weight="fill" aria-hidden="true" />
            The {recap.session.toLowerCase()}, in short
          </div>
          <h3 className="font-display font-extrabold lean-title uppercase text-[clamp(1.9rem,3.2vw,3.1rem)] leading-[0.94] mt-2 mb-2.5 [text-wrap:balance]">{recap.headline}</h3>
          <p className="font-headline text-[16.5px] leading-[1.5] [text-wrap:pretty] max-w-[68ch]">
            {phone && !open && rest ? (
              <>
                {first}{" "}
                <button type="button" onClick={() => setOpen(true)} className="font-sans text-[13px] font-semibold text-ink-soft hover:text-ink underline underline-offset-2">
                  More
                </button>
              </>
            ) : (
              recap.story
            )}
          </p>
        </div>
        {race && (
          <div className="min-w-0">
            <LapBar recap={recap} />
            {recap.turns.length > 0 && (
              <ol className="mt-3">
                {recap.turns.map((t, i) => {
                  const { Glyph, colour } = TURN[t.kind] ?? TURN.lead;
                  return (
                    <li key={i}>
                      <button type="button" onClick={() => goToView("analysis", "laps")} className="w-full text-left border-t hairline py-2 grid grid-cols-[2.6rem_1.25rem_minmax(0,1fr)] gap-1.5 items-center font-sans font-semibold text-[13.5px] hover:text-[color:var(--hue-f1)] transition-colors">
                        <span className="font-mono text-[11px] text-ink-soft">L{t.lap}</span>
                        <Glyph size={16} weight="fill" style={{ color: colour }} aria-hidden="true" />
                        <span className="min-w-0">{t.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** The clips that mattered. `narrow`: stacked, for the Feed column beside the map. */
export function RadioMoments({ insights, photos, narrow = false }: { insights: Insights; photos: Record<string, string>; narrow?: boolean }) {
  const player = usePlayer();
  if (insights.moments.length === 0) return null;
  return (
    <div className={`moments ${narrow ? "moments-narrow" : ""}`}>
      <div className="font-label text-[11px] tracking-[0.1em] flex items-center gap-1.5 mb-2" style={{ color: "var(--hue-f1)" }}>
        <MicrophoneIcon size={15} weight="fill" aria-hidden="true" />
        The moments that mattered
      </div>
      <div className="moments-row">
        {insights.moments.map((m) => {
          const playing = player.playing === m.url;
          const photo = photos[m.code] ?? driverPhotoByCode(m.code, "");
          return (
            <article key={m.url} className="moment" style={{ ["--team" as string]: m.colour }}>
              <span className="moment-photo">
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" loading="lazy" />
                )}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="moment-name font-display font-extrabold uppercase leading-none truncate">{m.name}</span>
                  {m.lap !== null && <span className="font-mono text-[11px] text-ink-soft shrink-0">Lap {m.lap}</span>}
                  <button type="button" onClick={() => player.toggle(m.url)} className="moment-play" aria-label={playing ? `Stop ${m.name}'s radio` : `Play ${m.name}'s radio`}>
                    {playing ? <PauseIcon size={15} weight="fill" aria-hidden="true" /> : <PlayIcon size={15} weight="fill" aria-hidden="true" />}
                  </button>
                </div>
                <p className="moment-quote font-headline [text-wrap:pretty]">&ldquo;{m.quote}&rdquo;</p>
                {m.why && <div className="font-sans font-medium text-[12.5px] leading-snug text-ink-soft">{m.why}</div>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
