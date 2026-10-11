"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { F1ConstructorStanding, F1LastRace, F1RosterEntry, F1Standing } from "@/lib/types";
import {
  F1_TEAM_COLORS,
  isLightTeamColor,
  loadPersonalization,
  normalizeF1Team,
  savePersonalization,
  teamAbbrev,
  teamColor,
} from "@/lib/personalization";
import { driverPhotoByCode, teamCar, teamLogo } from "@/lib/f1-assets";
import { DriverName } from "@/components/f1/DriverLink";
import type { HeadToHead } from "@/lib/live/f1-h2h";

// Your paddock: the team and drivers the reader follows, with the numbers
// that say how their season is going — championship place, gaps, wins and
// how they did last Sunday. With nothing picked it becomes an invitation,
// and the picker opens right here instead of sending the reader to Settings.

const MAX_DRIVERS = 2;

// The team's logo on its colour (F1's own glyph); its initials if there's none.
function Badge({ team, size = 44 }: { team: string; size?: number }) {
  const color = teamColor(team) ?? "var(--ink-soft)";
  const light = teamColor(team) ? isLightTeamColor(teamColor(team)!) : false;
  const logo = teamLogo(team);
  return (
    <span
      className="flex items-center justify-center rounded-lg font-mono font-black tracking-wider shrink-0"
      style={{ background: color, color: light ? "#111" : "#fff", width: size, height: size, fontSize: size * 0.26 }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={team} width={size * 0.62} height={size * 0.62} style={{ width: size * 0.62, height: size * 0.62, filter: light ? "invert(1)" : undefined }} className="object-contain" />
      ) : (
        teamAbbrev(team)
      )}
    </span>
  );
}

// Head to head this season: who out-qualified whom, who finished ahead, and
// the usual qualifying gap — the reader's two drivers first when they're not
// teammates, else the followed team's pair (a switch picks between them).
const h2hCache = new Map<string, Promise<HeadToHead | null>>();

function useH2H(query: string | null): HeadToHead | null {
  const [h2h, setH2h] = useState<{ query: string; data: HeadToHead | null } | null>(null);
  useEffect(() => {
    if (!query) return;
    let live = true;
    let p = h2hCache.get(query);
    if (!p) {
      p = fetch(`/api/f1/h2h?v=2&${query}`)
        .then((r) => (r.ok ? (r.json() as Promise<HeadToHead | null>) : null))
        .catch(() => null);
      h2hCache.set(query, p);
    }
    p.then((data) => live && setH2h({ query, data }));
    return () => {
      live = false;
    };
  }, [query]);
  return h2h && h2h.query === query ? h2h.data : null;
}

function VersusBar({ label, pair, colours }: { label: string; pair: [number, number]; colours: [string, string] }) {
  const total = pair[0] + pair[1] || 1;
  return (
    <div className="grid grid-cols-[1.4rem_minmax(0,1fr)_1.4rem] items-center gap-2">
      <span className="font-mono text-[12px] tabular-nums text-right font-semibold">{pair[0]}</span>
      <span className="relative h-[18px] rounded-md overflow-hidden flex gap-[2px] bg-[color:var(--rule)]">
        <span className="h-full bar-grow rounded-l-md" style={{ width: `${(pair[0] / total) * 100}%`, background: colours[0] }} />
        <span className="h-full flex-1 rounded-r-md" style={{ background: `color-mix(in srgb, ${colours[1]} 55%, transparent)` }} />
        <span className="absolute inset-0 grid place-items-center font-label text-[9px] mix-blend-difference text-white">{label}</span>
      </span>
      <span className="font-mono text-[12px] tabular-nums font-semibold">{pair[1]}</span>
    </div>
  );
}

function Versus({ options }: { options: { id: string; label: string; query: string }[] }) {
  // Until the reader picks, the first option leads ("Your drivers" when there
  // are two of them): the options fill in after the first render, so the
  // first one then isn't fixed.
  const [pick, setPick] = useState<string | null>(null);
  const chosen = options.find((o) => o.id === pick) ?? options[0];
  const h = useH2H(chosen?.query ?? null);
  if (!chosen) return null;
  const ca = h?.a.team ? (teamColor(h.a.team) ?? "var(--ink-soft)") : "var(--ink-soft)";
  // Teammates share a colour: the second takes a lighter shade of it.
  const bColour = h?.b.team ? teamColor(h.b.team) : undefined;
  const cb = h ? (h.team ? `color-mix(in srgb, ${bColour ?? "var(--ink-soft)"} 45%, var(--paper))` : (bColour ?? "var(--ink-faint)")) : "var(--ink-faint)";
  return (
    <div className="rounded-xl border hairline p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-label text-[9.5px] text-ink-faint">Head to head{h ? ` · ${h.rounds} rounds` : ""}</span>
        {options.length > 1 && (
          <span className="flex rounded-full border hairline p-0.5" role="tablist" aria-label="Who to compare">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={o.id === chosen.id}
                onClick={() => setPick(o.id)}
                className={`rounded-full px-2.5 h-6 font-sans text-[11px] font-semibold transition-colors ${o.id === chosen.id ? "text-[color:var(--paper)]" : "text-ink-soft hover:text-ink"}`}
                style={o.id === chosen.id ? { background: "var(--ink)" } : undefined}
              >
                {o.label}
              </button>
            ))}
          </span>
        )}
      </div>
      {h ? (
        <>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-sans font-bold text-[12.5px]" style={{ color: ca }}>
              {h.a.name}
            </span>
            <span className="font-sans font-bold text-[12.5px]" style={{ color: h.team ? undefined : cb }}>
              {h.b.name}
            </span>
          </div>
          <div className="space-y-1.5">
            <VersusBar label="Qualifying" pair={h.quali} colours={[ca, cb]} />
            <VersusBar label="Race" pair={h.race} colours={[ca, cb]} />
          </div>
          {h.gap !== null && (
            <p className="font-mono text-[10.5px] text-ink-soft mt-2.5 text-center">
              {Math.abs(h.gap) < 0.0005
                ? "Dead level over a lap in qualifying"
                : `${h.gap < 0 ? h.a.name : h.b.name} usually ${Math.abs(h.gap).toFixed(3)}s quicker in qualifying`}
            </p>
          )}
        </>
      ) : (
        <p className="font-mono text-[10.5px] shimmer-text">Comparing the season…</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="min-w-0">
      <div className="font-label text-[9px] text-ink-soft truncate">{label}</div>
      <div className={`font-mono text-[14px] tabular-nums mt-0.5 ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function finishOf(lastRace: F1LastRace | null, match: (team: string, code: string) => boolean) {
  return (lastRace?.results ?? []).filter((r) => match(r.team, r.code));
}

// ---- the picker ---------------------------------------------------------------

function PaddockPicker({ roster, onClose }: { roster: F1RosterEntry[]; onClose: () => void }) {
  const current = loadPersonalization();
  const [team, setTeam] = useState(current.favoriteF1Team);
  const [drivers, setDrivers] = useState<string[]>(current.favoriteF1Drivers.map((d) => d.toLowerCase()));

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

  const toggleDriver = (id: string) =>
    setDrivers((list) =>
      list.includes(id) ? list.filter((d) => d !== id) : list.length >= MAX_DRIVERS ? [list[1], id] : [...list, id],
    );

  // Teams on this season's grid (a renamed team like Sauber → Audi drops
  // out once the roster no longer lists it); drivers grouped by team, the
  // chosen team first.
  const teams = Object.keys(F1_TEAM_COLORS).filter(
    (t) => roster.length === 0 || t === team || roster.some((d) => normalizeF1Team(d.team) === t),
  );
  const grouped = teams
    .map((t) => ({ team: t, list: roster.filter((d) => normalizeF1Team(d.team) === t) }))
    .filter((g) => g.list.length > 0)
    .sort((a, b) => (a.team === team ? -1 : b.team === team ? 1 : 0));

  const save = () => {
    savePersonalization({ ...loadPersonalization(), favoriteF1Team: team, favoriteF1Drivers: drivers });
    onClose();
  };

  return createPortal(
    <div
      className="sheet-scale fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm animate-[fade-in_0.25s_ease]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose your team and drivers"
    >
      <div
        className="sheet-panel relative w-full sm:max-w-[720px] flex flex-col overflow-hidden bg-surface text-ink rounded-t-3xl sm:rounded-3xl border hairline shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 sm:px-7 pt-6 sm:pt-7 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display font-extrabold text-[2rem] leading-none">Your paddock</h2>
              <p className="font-sans text-[13px] text-ink-soft mt-2">One team and up to two drivers. Their numbers lead the F1 section.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-7 pb-5 sm:pb-7">

          <div className="font-label text-[10px] text-ink-soft mb-2">Team</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {teams.map((t) => {
              const on = team === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTeam(on ? "" : t)}
                  aria-pressed={on}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left font-sans font-semibold text-[13px] transition-colors"
                  style={{
                    borderColor: on ? F1_TEAM_COLORS[t] : "var(--rule)",
                    background: on ? `color-mix(in srgb, ${F1_TEAM_COLORS[t]} 16%, var(--surface))` : undefined,
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: F1_TEAM_COLORS[t] }} />
                  <span className="truncate">{t}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-baseline justify-between mt-7 mb-2">
            <span className="font-label text-[10px] text-ink-soft">Drivers</span>
            <span className="font-mono text-[10px] text-ink-faint">
              {drivers.length}/{MAX_DRIVERS} picked
            </span>
          </div>
          {roster.length === 0 ? (
            <p className="font-sans text-[13px] text-ink-soft">The driver list is still loading…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {grouped.map((g) => (
                <div key={g.team}>
                  <div className="font-mono text-[10px] text-ink-faint mb-1">{g.team}</div>
                  <div className="flex flex-wrap gap-2">
                    {g.list.map((d) => {
                      const on = drivers.includes(d.id);
                      const c = F1_TEAM_COLORS[g.team];
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleDriver(d.id)}
                          aria-pressed={on}
                          className="chip h-8 text-[12px]"
                          style={on ? { background: c, borderColor: c, color: isLightTeamColor(c) ? "#111" : "#fff" } : undefined}
                        >
                          <span className="font-mono text-[10px] opacity-70">{d.code}</span> {d.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="sticky bottom-0 -mx-5 sm:-mx-7 -mb-5 sm:-mb-7 mt-7 px-5 sm:px-7 py-4 bg-surface border-t hairline flex items-center justify-end gap-2">
            <button type="button" className="chip" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="chip chip-signal" onClick={save}>
              Save paddock
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- the card -----------------------------------------------------------------

export default function YourPaddock({
  favoriteTeam,
  favoriteDriverIds,
  driverRows,
  constructorRows,
  roster,
  lastRace,
}: {
  favoriteTeam: string;
  favoriteDriverIds: string[];
  driverRows: F1Standing[];
  constructorRows: F1ConstructorStanding[];
  roster: F1RosterEntry[];
  lastRace: F1LastRace | null;
}) {
  const [open, setOpen] = useState(false);
  const picker = open ? <PaddockPicker roster={roster} onClose={() => setOpen(false)} /> : null;

  const drivers = favoriteDriverIds
    .map((raw) => {
      const id = raw.toLowerCase();
      const standing = driverRows.find(
        (s) => s.driverId === id || s.code.toLowerCase() === id || s.name.toLowerCase().includes(id),
      );
      const entry = roster.find((d) => d.id === id || d.code.toLowerCase() === id || d.name.toLowerCase().includes(id));
      const name = standing?.name ?? entry?.name;
      if (!name) return null;
      return { id, name, code: standing?.code ?? entry?.code ?? "", team: standing?.team ?? entry?.team ?? "", standing };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Nothing followed yet: an invitation, not an empty box.
  if (!favoriteTeam && drivers.length === 0) {
    return (
      <div className="module self-stretch flex flex-col items-start justify-center gap-4 border-dashed" data-reveal>
        <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden className="text-ink-faint">
          {Array.from({ length: 4 }).map((_, r) =>
            Array.from({ length: 7 }).map((__, c) => (
              <rect key={`${r}-${c}`} x={c * 8} y={r * 8 + 4} width="8" height="8" fill={(r + c) % 2 ? "currentColor" : "transparent"} />
            )),
          )}
        </svg>
        <div>
          <div className="font-display font-extrabold text-[1.8rem] leading-none">Build your paddock</div>
          <p className="font-sans text-[13px] text-ink-soft mt-2 max-w-[38ch]">
            Pick a team and up to two drivers. Their championship place, gaps, wins and last result will live here.
          </p>
        </div>
        <button type="button" className="chip chip-signal" onClick={() => setOpen(true)}>
          Choose team &amp; drivers
        </button>
        {picker}
      </div>
    );
  }

  // --- team numbers ---
  const color = favoriteTeam ? (F1_TEAM_COLORS[favoriteTeam] ?? teamColor(favoriteTeam)) : undefined;
  const row = constructorRows.find((c) => normalizeF1Team(c.team) === favoriteTeam);
  const leader = constructorRows[0];
  const ahead = row ? constructorRows[row.position - 2] : undefined;
  const behind = row ? constructorRows[row.position] : undefined;
  const teamDrivers = driverRows.filter((d) => normalizeF1Team(d.team) === favoriteTeam);
  const wins = teamDrivers.reduce((n, d) => n + d.wins, 0);
  const teamFinishes = finishOf(lastRace, (t) => normalizeF1Team(t) === favoriteTeam);
  const best = teamFinishes.map((r) => r.position).filter((p): p is number => p !== null).sort((a, b) => a - b)[0];
  const car = favoriteTeam ? teamCar(favoriteTeam, 720) : null;
  const logo = favoriteTeam ? teamLogo(favoriteTeam) : null;

  return (
    <div className="module self-stretch flex flex-col gap-4" data-reveal>
      <div className="flex items-center justify-between">
        <span className="font-label text-[10px] text-ink-soft">Your paddock</span>
        <button type="button" className="chip h-7 px-3 text-[11px]" onClick={() => setOpen(true)}>
          Edit
        </button>
      </div>

      {favoriteTeam ? (
        <div
          className="relative overflow-hidden rounded-xl p-4 border"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${color} 24%, var(--card-bg)), var(--card-bg) 72%)`,
            borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
          }}
        >
          {/* the team's mark, oversized and cropped, behind everything */}
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" aria-hidden="true" className="f1-logo absolute -right-8 -top-6 w-44 h-44 object-contain opacity-[0.07] pointer-events-none select-none" />
          )}
          <div className="relative flex items-center gap-3">
            <Badge team={favoriteTeam} />
            <div className="min-w-0 flex-1">
              <div className="font-display font-extrabold uppercase text-[1.5rem] leading-none truncate">{favoriteTeam}</div>
              <div className="font-mono text-[10px] text-ink-soft mt-1">
                {teamDrivers.length > 0 ? teamDrivers.map((d) => `${d.code} P${d.position}`).join(" · ") : "Constructors’ championship"}
              </div>
            </div>
            {row && (
              <div className="text-right shrink-0">
                <div className="font-display font-extrabold text-[2.4rem] leading-[0.8]">P{row.position}</div>
                <div className="font-mono text-[11px] text-ink-soft mt-1 tabular-nums">{row.points} pts</div>
              </div>
            )}
          </div>

          {car && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={car} alt={`The ${favoriteTeam} car`} className="relative w-full max-w-[22rem] mx-auto h-auto mt-3 -mb-1 drop-shadow-[0_10px_14px_rgba(0,0,0,0.35)]" loading="lazy" />
          )}
          {row ? (
            <>
              <div className="relative h-1.5 rounded-full bg-[color:var(--rule)] mt-4 overflow-hidden" title="Points against the leader">
                <div
                  className="h-full rounded-full bar-grow"
                  style={{ width: `${leader ? Math.max(3, (row.points / leader.points) * 100) : 0}%`, background: color }}
                />
              </div>
              <div className="relative grid grid-cols-4 gap-2 mt-3">
                <Stat
                  label={row.position === 1 ? "Lead" : "To leader"}
                  value={row.position === 1 && behind ? `+${row.points - behind.points}` : leader ? `−${leader.points - row.points}` : "—"}
                  tone={row.position === 1 ? "up" : undefined}
                />
                <Stat
                  label={ahead ? `To P${ahead.position}` : "To P2"}
                  value={ahead ? `−${ahead.points - row.points}` : behind ? `+${row.points - behind.points}` : "—"}
                />
                <Stat label="Wins" value={teamDrivers.length ? String(wins) : "—"} />
                <Stat label="Last race" value={best ? `P${best}` : "—"} />
              </div>
            </>
          ) : (
            <p className="font-mono text-[11px] text-ink-soft mt-3 animate-pulse">Waiting for the standings…</p>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-dashed hairline p-3 text-left font-sans text-[13px] text-ink-soft">
          + Follow a team
        </button>
      )}

      {(() => {
        const options: { id: string; label: string; query: string }[] = [];
        if (favoriteTeam) options.push({ id: "team", label: "Teammates", query: `team=${encodeURIComponent(favoriteTeam)}` });
        const codes = drivers.map((d) => d.code).filter(Boolean);
        const sameTeam = drivers.length === 2 && drivers.every((d) => normalizeF1Team(d.team) === favoriteTeam);
        // The reader's own two drivers come first; their team's pairing is the other choice.
        if (codes.length === 2 && !sameTeam) options.unshift({ id: "mine", label: "Your drivers", query: `a=${codes[0]}&b=${codes[1]}` });
        return options.length > 0 ? <Versus options={options} /> : null;
      })()}

      {drivers.length > 0 ? (
        <ul className="grid gap-2">
          {drivers.map((d) => {
            const c = teamColor(d.team) ?? "var(--ink-soft)";
            const s = d.standing;
            const ahead = s ? driverRows.find((x) => x.position === s.position - 1) : undefined;
            const finish = finishOf(lastRace, (_, code) => code === d.code)[0];
            return (
              <li key={d.id} className="rounded-xl border hairline p-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span className="relative w-11 h-11 rounded-full overflow-hidden shrink-0 grid place-items-center font-mono font-black text-[10px]" style={{ background: `color-mix(in srgb, ${c} 35%, var(--paper))` }}>
                  {d.code}
                  {driverPhotoByCode(d.code, d.team, 120) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={driverPhotoByCode(d.code, d.team, 120)!} alt="" className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
                  )}
                </span>
                <span className="min-w-0">
                  <DriverName code={d.code} className="block font-sans font-semibold text-[14px] truncate max-w-full">
                    {d.name}
                  </DriverName>
                  <span className="block font-mono text-[10px] text-ink-soft truncate">
                    {s ? `${s.points} pts · ${s.wins} win${s.wins === 1 ? "" : "s"}` : d.team}
                    {ahead && s ? ` · −${ahead.points - s.points} to P${ahead.position}` : ""}
                    {finish ? ` · last P${finish.position ?? "DNF"}` : ""}
                  </span>
                </span>
                <span className="font-display font-extrabold text-[1.8rem] leading-none">
                  {s ? `P${s.position}` : <span className="text-ink-faint animate-pulse">—</span>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-dashed hairline p-3 text-left font-sans text-[13px] text-ink-soft">
          + Follow up to two drivers
        </button>
      )}
      {picker}
    </div>
  );
}
