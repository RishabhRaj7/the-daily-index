"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Season, SeasonCell, SeasonDriver } from "@/lib/live/f1-season";
import { driverPhotoByCode } from "@/lib/f1-assets";
import { TeamGlyph } from "./LiveTiming";
import { DriverName } from "./DriverLink";

// A driver's season, round by round: where they qualified, started and
// finished (or why they didn't), their points, sprints and fastest laps; a
// chart of it all; the season's totals; and how they stand against their
// teammate. Opened from the season grid, the records, or the followed
// driver's card on the Live view. Esc, the close button or a tap outside put
// it away.

let seasonP: Promise<Season | null> | null = null;
export function useSeasonData(): Season | null {
  const [s, setS] = useState<Season | null>(null);
  useEffect(() => {
    seasonP ??= fetch("/api/f1/season")
      .then((r) => (r.ok ? (r.json() as Promise<Season>) : null))
      .catch(() => null);
    let live = true;
    seasonP.then((x) => live && setS(x));
    return () => {
      live = false;
    };
  }, []);
  return s;
}

const classified = (c: SeasonCell | null) => !!c && /^\d+$/.test(c.text);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border hairline px-3 py-2.5 min-w-0">
      <div className="font-label text-[8px] text-ink-faint truncate">{label}</div>
      <div className="font-display font-extrabold text-[1.5rem] leading-none mt-1.5 tabular-nums">{value}</div>
      {sub && <div className="font-mono text-[9.5px] text-ink-faint mt-1 truncate">{sub}</div>}
    </div>
  );
}

/** Qualifying (hollow) and finish (filled) by round, P1 at the top; a retirement is a red cross. */
function Chart({ season, d }: { season: Season; d: SeasonDriver }) {
  const W = 760;
  const H = 210;
  const pad = { l: 30, r: 10, t: 12, b: 26 };
  const n = season.rounds.length;
  const field = 22;
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (p: number) => pad.t + ((p - 1) / (field - 1)) * (H - pad.t - pad.b);
  const finishes = d.gp.map((c, i) => (c?.pos ? { i, p: c.pos, ok: classified(c) } : null)).filter(Boolean) as { i: number; p: number; ok: boolean }[];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img" aria-label={`${d.name}'s qualifying and finishing places by round`}>
      {[1, 5, 10, 15, 20].map((p) => (
        <g key={p}>
          <line x1={pad.l} x2={W - pad.r} y1={y(p)} y2={y(p)} stroke="var(--rule)" strokeDasharray={p === 1 ? undefined : "2 6"} />
          <text x={pad.l - 8} y={y(p)} dy="0.35em" textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
            P{p}
          </text>
        </g>
      ))}
      {season.rounds.map((r, i) => (
        <text key={r.round} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fontFamily="var(--font-mono)" fill={r.done ? "var(--ink-faint)" : "var(--rule)"}>
          {r.round}
        </text>
      ))}
      <polyline points={finishes.map((f) => `${x(f.i)},${y(f.p)}`).join(" ")} fill="none" stroke={d.colour} strokeWidth="2" strokeOpacity="0.6" strokeLinejoin="round" />
      {d.quali.map((q, i) => (q ? <circle key={`q${i}`} cx={x(i)} cy={y(q)} r="3.5" fill="var(--paper)" stroke="var(--ink-soft)" strokeWidth="1.4" /> : null))}
      {finishes.map((f) =>
        f.ok ? (
          <circle key={`f${f.i}`} cx={x(f.i)} cy={y(f.p)} r="4.5" fill={f.p <= 3 ? ["#E9B10E", "#AEB6C2", "#C9792E"][f.p - 1] : d.colour} stroke="var(--paper)" strokeWidth="1.5" />
        ) : (
          <path key={`f${f.i}`} d={`M${x(f.i) - 4},${y(f.p) - 4}l8,8m0,-8l-8,8`} stroke="var(--down)" strokeWidth="2" strokeLinecap="round" />
        ),
      )}
    </svg>
  );
}

function Body({ season, d }: { season: Season; d: SeasonDriver }) {
  const rank = [...season.drivers].sort((a, b) => b.points - a.points).findIndex((x) => x.code === d.code) + 1;
  const races = d.gp.filter(Boolean) as SeasonCell[];
  const fin = races.filter(classified);
  const wins = fin.filter((c) => c.pos === 1).length;
  const podiums = fin.filter((c) => (c.pos ?? 99) <= 3).length;
  const poles = d.quali.filter((q) => q === 1).length;
  const dnfs = races.length - fin.length;
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "—");
  const laps = races.reduce((n, c) => n + (c.laps ?? 0), 0);
  const fastest = races.filter((c) => c.fastestOfAll).length;
  const sprintPts = d.sprint.reduce((n, c) => n + (c?.points ?? 0), 0);

  // Against the teammate: the other driver of the team with the most races.
  const mate = season.drivers.filter((x) => x.code !== d.code && x.team === d.team).sort((a, b) => b.gp.filter(Boolean).length - a.gp.filter(Boolean).length)[0];
  const q = [0, 0];
  const r = [0, 0];
  if (mate) {
    season.rounds.forEach((_, i) => {
      const a = d.quali[i];
      const b = mate.quali[i];
      if (a && b) q[a < b ? 0 : 1]++;
      const ca = d.gp[i];
      const cb = mate.gp[i];
      if (ca && cb) {
        const fa = classified(ca) ? ca.pos! : 99;
        const fb = classified(cb) ? cb.pos! : 99;
        if (fa !== fb) r[fa < fb ? 0 : 1]++;
      }
    });
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Stat label="Championship" value={`P${rank}`} sub={`${d.points} pts${sprintPts ? ` · ${sprintPts} from sprints` : ""}`} />
        <Stat label="Wins" value={String(wins)} sub={`${podiums} podiums`} />
        <Stat label="Poles" value={String(poles)} sub={`avg quali P${avg(d.quali.filter((x): x is number => !!x))}`} />
        <Stat label="Avg finish" value={avg(fin.map((c) => c.pos!))} sub={`${fin.length} of ${races.length} finished`} />
        <Stat label="Retirements" value={String(dnfs)} sub={`${laps} laps raced`} />
        <Stat label="Fastest laps" value={String(fastest)} sub="the race's quickest" />
      </div>

      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 sm:p-4 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="font-label text-[9.5px]">Round by round</span>
          <span className="flex gap-3 font-mono text-[9.5px] text-ink-faint">
            <span>○ qualified</span>
            <span style={{ color: d.colour }}>● finished</span>
            <span style={{ color: "var(--down)" }}>✕ retired</span>
          </span>
        </div>
        <Chart season={season} d={d} />
      </div>

      {mate && (
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 sm:p-4 mt-4 grid sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-center">
          <span className="font-label text-[9.5px]">
            Against{" "}
            <DriverName code={mate.code} className="font-label">
              {mate.name}
            </DriverName>
            <span className="block font-mono normal-case tracking-normal text-[10px] text-ink-faint mt-1">teammate</span>
          </span>
          {[
            { k: "Qualifying", v: q },
            { k: "Races", v: r },
          ].map(({ k, v }) => (
            <div key={k}>
              <div className="flex justify-between font-mono text-[11px] tabular-nums">
                <b>{v[0]}</b>
                <span className="text-ink-faint">{k}</span>
                <b className="text-ink-soft">{v[1]}</b>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden mt-1 bg-[var(--rule)]">
                <span style={{ width: `${(v[0] / Math.max(1, v[0] + v[1])) * 100}%`, background: d.colour }} />
                <span className="flex-1" style={{ background: `color-mix(in srgb, ${d.colour} 30%, transparent)` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto mt-4 -mx-1 px-1">
        <table className="w-full text-[12px] tabular-nums min-w-[34rem]">
          <thead>
            <tr className="font-label text-[8.5px] text-ink-faint text-left">
              <th className="font-normal py-1.5">Round</th>
              <th className="font-normal">Quali</th>
              <th className="font-normal">Grid</th>
              <th className="font-normal">Finish</th>
              <th className="font-normal text-right">Pts</th>
              <th className="font-normal pl-3">Sprint</th>
              <th className="font-normal">Fastest lap</th>
            </tr>
          </thead>
          <tbody>
            {season.rounds.map((round, i) => {
              const c = d.gp[i];
              const s = d.sprint[i];
              const qp = d.quali[i];
              if (!round.done && !c && !qp) return null;
              const ok = classified(c);
              return (
                <tr key={round.round} className="border-t hairline">
                  <td className="py-[7px] pr-2">
                    <span className="font-mono text-[10px] text-ink-faint mr-1.5">R{round.round}</span>
                    <span className="font-sans font-semibold">{round.name}</span>
                  </td>
                  <td className="font-mono">
                    {qp ? `P${qp}` : "—"}
                    {d.qualiTime[i] && <span className="text-ink-faint text-[10px]"> {d.qualiTime[i]}</span>}
                  </td>
                  <td className="font-mono text-ink-soft">{c?.grid ? `P${c.grid}` : c ? "Pit lane" : "—"}</td>
                  <td>
                    {c ? (
                      ok ? (
                        <span className="font-mono font-semibold" style={{ color: (c.pos ?? 99) <= 3 ? ["#c99a06", "var(--ink-soft)", "#C9792E"][(c.pos ?? 1) - 1] : undefined }}>
                          P{c.text}
                          {c.grid && c.pos && c.grid !== c.pos && (
                            <span className="text-[10px] ml-1" style={{ color: c.grid > c.pos ? "var(--up)" : "var(--down)" }}>
                              {c.grid > c.pos ? `▲${c.grid - c.pos}` : `▼${c.pos - c.grid}`}
                            </span>
                          )}
                          {c.status !== "Finished" && <span className="text-ink-faint text-[10px] font-normal ml-1">{c.status}</span>}
                        </span>
                      ) : (
                        <span className="font-mono" style={{ color: "var(--down)" }}>
                          {c.text} <span className="text-[10px] text-ink-faint">{c.status}{c.laps !== null ? `, lap ${c.laps}` : ""}</span>
                        </span>
                      )
                    ) : (
                      <span className="text-ink-faint">{round.done ? "—" : "to come"}</span>
                    )}
                  </td>
                  <td className="font-mono text-right">{c ? c.points : ""}</td>
                  <td className="font-mono pl-3 text-ink-soft">{s ? `${/^\d+$/.test(s.text) ? `P${s.text}` : s.text}${s.points ? ` · ${s.points}` : ""}` : ""}</td>
                  <td className="font-mono text-ink-soft" style={c?.fastestOfAll ? { color: "var(--f1-fastest)" } : undefined}>
                    {c?.fastestLap ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function DriverSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const season = useSeasonData();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  const d = season?.drivers.find((x) => x.code === code) ?? null;
  const photo = d ? driverPhotoByCode(d.code, d.team, 200) : null;

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm animate-[fade-in_0.2s_ease] sm:p-5 flex items-end sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={d ? `${d.name}'s season` : "A driver's season"}>
      <div
        className="relative w-full max-w-[980px] mx-auto max-h-[92vh] rounded-t-3xl sm:rounded-3xl border hairline bg-[var(--surface)] text-ink overflow-hidden flex flex-col animate-[sheet-up_0.4s_var(--ease-out)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-4 px-5 py-4 border-b hairline" style={d ? { background: `linear-gradient(90deg, color-mix(in srgb, ${d.colour} 22%, transparent), transparent 70%)` } : undefined}>
          <span className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 bg-[var(--rule)]">
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-label text-[9.5px] text-ink-soft">
              {d && <TeamGlyph team={d.team} colour={d.colour} size={14} />}
              {d ? `${d.team} · ${season?.year} season` : "Season"}
            </div>
            <div className="font-display font-extrabold uppercase text-[1.9rem] leading-none mt-1 truncate">{d?.name ?? code}</div>
          </div>
          <button type="button" onClick={onClose} className="icon-btn shrink-0" aria-label="Close">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain p-4 sm:p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {!season ? (
            <div className="h-64 rounded-2xl bg-[var(--rule)] animate-pulse opacity-40" />
          ) : !d ? (
            <p className="font-mono text-[11px] text-ink-faint">No results for {code} this season.</p>
          ) : (
            <Body season={season} d={d} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
