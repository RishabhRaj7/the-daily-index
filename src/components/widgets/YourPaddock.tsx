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

// Your paddock: the team and drivers the reader follows, with the numbers
// that say how their season is going — championship place, gaps, wins and
// how they did last Sunday. With nothing picked it becomes an invitation,
// and the picker opens right here instead of sending the reader to Settings.

const MAX_DRIVERS = 2;

function Badge({ team, size = 44 }: { team: string; size?: number }) {
  const color = teamColor(team) ?? "var(--ink-soft)";
  const ink = teamColor(team) && isLightTeamColor(teamColor(team)!) ? "#111" : "#fff";
  return (
    <span
      className="flex items-center justify-center rounded-lg font-mono font-black tracking-wider shrink-0"
      style={{ background: color, color: ink, width: size, height: size, fontSize: size * 0.26 }}
    >
      {teamAbbrev(team)}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="min-w-0">
      <div className="font-label text-[8px] text-ink-soft truncate">{label}</div>
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
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm animate-[fade-in_0.25s_ease]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose your team and drivers"
    >
      <div
        className="relative w-full sm:max-w-[720px] max-h-[92vh] overflow-y-auto bg-surface text-ink rounded-t-3xl sm:rounded-3xl border hairline shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] p-5 sm:p-7 animate-[sheet-up_0.45s_var(--ease-out)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
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
                className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors"
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
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
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
          className="rounded-xl p-4"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${color} 22%, var(--card-bg)), var(--card-bg) 70%)`,
            boxShadow: `inset 3px 0 0 ${color}`,
          }}
        >
          <div className="flex items-center gap-3">
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

          {row ? (
            <>
              <div className="h-1.5 rounded-full bg-[color:var(--rule)] mt-4 overflow-hidden" title="Points against the leader">
                <div
                  className="h-full rounded-full bar-grow"
                  style={{ width: `${leader ? Math.max(3, (row.points / leader.points) * 100) : 0}%`, background: color }}
                />
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3">
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
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-dashed hairline p-3 text-left text-[13px] text-ink-soft">
          + Follow a team
        </button>
      )}

      {drivers.length > 0 ? (
        <ul className="grid gap-2">
          {drivers.map((d) => {
            const c = teamColor(d.team) ?? "var(--ink-soft)";
            const s = d.standing;
            const ahead = s ? driverRows.find((x) => x.position === s.position - 1) : undefined;
            const finish = finishOf(lastRace, (_, code) => code === d.code)[0];
            return (
              <li key={d.id} className="rounded-xl border hairline p-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span
                  className="font-mono font-black text-[11px] rounded-md px-1.5 py-1"
                  style={{ background: c, color: teamColor(d.team) && isLightTeamColor(c) ? "#111" : "#fff" }}
                >
                  {d.code}
                </span>
                <span className="min-w-0">
                  <span className="block font-sans font-semibold text-[14px] truncate">{d.name}</span>
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
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-dashed hairline p-3 text-left text-[13px] text-ink-soft">
          + Follow up to two drivers
        </button>
      )}
      {picker}
    </div>
  );
}
