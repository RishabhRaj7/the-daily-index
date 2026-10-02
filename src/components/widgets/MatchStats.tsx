"use client";

import { useEffect, useState } from "react";
import type { ValMatchStats, ValPlayerStats, ValStatLine } from "@/lib/types";

// A match's scoreboard, the way the scene reads it: a tab per map (and the
// whole match), All / Attack / Defend, then each team's five with their
// agents, rating, ACS, K/D/A, +/–, KAST, ADR, headshots and first kills;
// the best in each column stands out. Each map also gets its rounds as a
// strip as VLR draws it (red won on attack, green on defence, with how it
// ended) and its VOD. Numbers from
// VLR.gg; a live match refreshes every minute. Agent icons are the paper's
// own copies (/public/val/agents).

type Side = "all" | "t" | "ct";
const COLS: Array<{ key: keyof ValStatLine; label: string; title: string; fmt?: (v: number) => string; low?: boolean }> = [
  { key: "r", label: "R", title: "Rating 2.0", fmt: (v) => v.toFixed(2) },
  { key: "acs", label: "ACS", title: "Average combat score" },
  { key: "k", label: "K", title: "Kills" },
  { key: "d", label: "D", title: "Deaths", low: true },
  { key: "a", label: "A", title: "Assists" },
  { key: "kd", label: "+/–", title: "Kills minus deaths", fmt: (v) => (v > 0 ? `+${v}` : `${v}`) },
  { key: "kast", label: "KAST", title: "Rounds with a kill, assist, survival or trade", fmt: (v) => `${v}%` },
  { key: "adr", label: "ADR", title: "Average damage per round" },
  { key: "hs", label: "HS%", title: "Headshot percentage", fmt: (v) => `${v}%` },
  { key: "fk", label: "FK", title: "First kills" },
  { key: "fd", label: "FD", title: "First deaths", low: true },
];

const HOW: Record<string, string> = { elim: "Elimination", defuse: "Spike defused", boom: "Spike detonated", time: "Time ran out" };

/** How a round ended, drawn after the broadcast's marks in the side's colour: a crossed box for eliminations, a three-tongued flame for the spike going off, wire cutters for a defuse, an hourglass for time. */
function HowIcon({ how, size = 14 }: { how: string | null; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 12 12", "aria-hidden": true, className: "block" } as const;
  if (how === "boom")
    return (
      <svg {...common}>
        <path
          fill="currentColor"
          d="M6 .6c1 1.9 2.7 2.6 2.5 4.9.8-.5 1.2-1.2 1.3-2C11 5.1 11.2 7.2 10.2 9 9.3 10.6 7.7 11.4 6 11.4S2.7 10.6 1.8 9C.8 7.2 1 5.1 2.2 3.5c.1.8.5 1.5 1.3 2C3.3 3.2 5 2.5 6 .6zm0 5.6c-.9 1-1.5 1.9-1.5 2.9 0 .9.7 1.5 1.5 1.5s1.5-.6 1.5-1.5c0-1-.6-1.9-1.5-2.9z"
          fillRule="evenodd"
        />
      </svg>
    );
  if (how === "defuse")
    return (
      <svg {...common}>
        <path fill="currentColor" d="M6 .3 8.1 5.4 6.9 6.2 6 3.3 5.1 6.2 3.9 5.4z" />
        <path d="M5.2 6.2C3.6 7.4 2.6 8.8 2.9 11.3M6.8 6.2C8.4 7.4 9.4 8.8 9.1 11.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="6" cy="5.9" r="1" fill="currentColor" />
      </svg>
    );
  if (how === "time")
    return (
      <svg {...common}>
        <path fill="currentColor" d="M2.2 1h7.6v1.2H9L6.7 6 9 9.8h.8V11H2.2V9.8H3L5.3 6 3 2.2h-.8z" />
      </svg>
    );
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <rect x="1.4" y="1.4" width="9.2" height="9.2" rx="1.6" />
      <circle cx="6" cy="6" r="2.4" />
      <path d="M1.9 1.9l8.2 8.2M10.1 1.9 1.9 10.1" />
    </svg>
  );
}

// The broadcast's colours: a round won on attack in red, on defence in teal.
const ATTACK = "#ff4655";
const DEFENCE = "#3edbb5";

function Agent({ slug }: { slug: string }) {
  const [ok, setOk] = useState(true);
  return ok ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/val/agents/${slug}.webp`} alt={slug} title={slug} width={20} height={20} className="rounded-[4px] bg-[#17171c] shrink-0" onError={() => setOk(false)} />
  ) : (
    <span className="grid place-items-center w-[20px] h-[20px] rounded-[4px] bg-[#17171c] text-[8px] text-white uppercase shrink-0" title={slug}>
      {slug.slice(0, 2)}
    </span>
  );
}

function Table({ team, players, side, best, mine }: { team: string; players: ValPlayerStats[]; side: Side; best: Map<keyof ValStatLine, number>; mine: boolean }) {
  const lineOf = (p: ValPlayerStats) => (side === "all" ? p.all : p[side]);
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[640px] font-sans text-[12.5px] tabular-nums">
        <thead>
          <tr className="font-label text-[8.5px] text-ink-faint text-right">
            <th className="text-left font-normal py-1 sticky left-0 bg-surface" style={mine ? { color: "var(--section-hue)" } : undefined}>
              {team}
            </th>
            {COLS.map((c) => (
              <th key={c.key} className="font-normal py-1 px-1.5" title={c.title}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const l = lineOf(p);
            return (
              <tr key={p.name} className="border-t hairline text-right">
                <td className="text-left py-1 pr-2 sticky left-0 bg-surface">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="flex gap-0.5">
                      {p.agents.slice(0, 2).map((a) => (
                        <Agent key={a} slug={a} />
                      ))}
                    </span>
                    <span className="font-sans font-medium text-[13px] tracking-[0.01em] truncate">{p.name}</span>
                  </span>
                </td>
                {COLS.map((c) => {
                  const v = l?.[c.key];
                  const top = v != null && best.get(c.key) === v;
                  const tone = c.key === "kd" && v != null ? (v > 0 ? "text-up" : v < 0 ? "text-down" : "") : "";
                  return (
                    <td key={c.key} className={`px-1.5 py-1 font-mono ${tone} ${top ? "font-bold" : ""}`} style={top && !tone ? { color: "var(--section-hue)" } : undefined}>
                      {v == null ? "–" : c.fmt ? c.fmt(v) : v}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The map's rounds: one column each, team A's win above, team B's below; a gap at the half. */
function Rounds({ rounds, teams }: { rounds: ValMatchStats["maps"][number]["rounds"]; teams: [string, string] }) {
  if (rounds.length === 0) return null;
  // The side each team started on, read from round one, for the bar by its name.
  const first = rounds[0];
  const startSide = (row: 0 | 1) => (first.winner === row ? first.side : first.side === "t" ? "ct" : "t");
  const gap = (i: number) => i === 12 || (i > 24 && i % 2 === 0);
  const cell = (r: (typeof rounds)[number], row: 0 | 1, i: number) => {
    const won = r.winner === row;
    const hue = r.side === "t" ? ATTACK : DEFENCE;
    return (
      <span
        key={`${row}-${i}`}
        className="w-[22px] h-[22px] rounded-[3px] grid place-items-center shrink-0 border"
        style={
          won
            ? { color: hue, background: `color-mix(in srgb, ${hue} 14%, transparent)`, borderColor: `color-mix(in srgb, ${hue} 60%, transparent)` }
            : { borderColor: "var(--rule)" }
        }
        title={won ? `Round ${i + 1}: ${teams[row]} won on ${r.side === "t" ? "attack" : "defence"}${r.how ? ` (${HOW[r.how]})` : ""}` : `Round ${i + 1}`}
      >
        {won && <HowIcon how={r.how} />}
      </span>
    );
  };
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="inline-flex flex-col gap-[3px] py-1">
        <div className="flex items-center gap-[3px]">
          <span className="w-[3.2rem] shrink-0" />
          {rounds.flatMap((_, i) => [
            ...(gap(i) ? [<span key={`hg-${i}`} className="w-[6px] shrink-0" />] : []),
            <span key={`n-${i}`} className="w-[22px] shrink-0 text-center font-mono text-[9.5px] text-ink-faint tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>,
          ])}
        </div>
        {([0, 1] as const).map((row) => (
          <div key={row} className="flex items-center gap-[3px]">
            <span className="flex items-center gap-1.5 w-[3.2rem] shrink-0 min-w-0">
              <span className="w-[3px] h-[18px] rounded-full shrink-0" style={{ background: startSide(row) === "t" ? ATTACK : DEFENCE }} />
              <span className="font-sans font-semibold text-[11.5px] text-ink truncate">{teams[row]}</span>
            </span>
            {rounds.flatMap((r, i) => [
              // A gap at the half and at each overtime.
              ...(gap(i) ? [<span key={`gap-${i}`} className="w-[6px] shrink-0" />] : []),
              cell(r, row, i),
            ])}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchStats({
  id,
  a,
  b,
  codes,
  start,
  live,
  follows = [],
}: {
  id: string;
  a: string;
  b: string;
  codes: [string, string];
  start: string;
  live: boolean;
  follows?: string[];
}) {
  const [data, setData] = useState<ValMatchStats | null | "none">(null);
  const [vlr, setVlr] = useState<string | null>(null);
  const [map, setMap] = useState("all");
  const [side, setSide] = useState<Side>("all");

  useEffect(() => {
    let on = true;
    const load = () => {
      const q = new URLSearchParams({ id, a, b, t: start, ...(live ? { live: "1" } : {}) });
      fetch(`/api/valorant/stats?${q}`)
        .then(async (r) => {
          const body = (await r.json()) as ValMatchStats & { error?: string; url?: string | null };
          if (!on) return;
          if (!r.ok || body.error) {
            setVlr(body.url ?? null);
            setData((d) => (d && d !== "none" ? d : "none"));
          } else setData(body);
        })
        .catch(() => on && setData((d) => d ?? "none"));
    };
    load();
    const t = live ? window.setInterval(load, 60_000) : undefined;
    return () => {
      on = false;
      window.clearInterval(t);
    };
  }, [id, a, b, start, live]);

  if (data === null) {
    return (
      <div className="space-y-2 animate-pulse mt-6">
        <div className="h-8 w-2/3 rounded-lg bg-card-bg" />
        <div className="h-40 rounded-xl bg-card-bg" />
      </div>
    );
  }
  if (data === "none") {
    return (
      <p className="font-sans text-[13px] text-ink-soft mt-6">
        {live ? "The scoreboard appears once the first round is played." : "No scoreboard for this match yet."}
        {vlr && (
          <a href={vlr} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted ml-1">
            See it on VLR.gg ↗
          </a>
        )}
      </p>
    );
  }

  const current = data.maps.find((m) => m.id === map) ?? data.maps[0];
  const mapNo = data.maps.filter((m) => m.id !== "all").findIndex((m) => m.id === current.id) + 1;
  const vod = data.vods.find((v) => v.map === mapNo);
  // The best in each column across both teams.
  const all = [...current.teams[0], ...current.teams[1]].map((p) => (side === "all" ? p.all : p[side])).filter((l): l is ValStatLine => !!l);
  const best = new Map<keyof ValStatLine, number>();
  for (const c of COLS) {
    const vals = all.map((l) => l[c.key]).filter((v): v is number => v != null);
    if (vals.length) best.set(c.key, c.low ? Math.min(...vals) : Math.max(...vals));
  }

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {data.live && (
          <span className="font-label text-[9px] inline-flex items-center gap-1 mr-1" style={{ color: "var(--section-hue)" }}>
            <span className="live-dot" /> Live · every minute
          </span>
        )}
        {data.maps.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMap(m.id)}
            aria-pressed={current.id === m.id}
            className="chip h-8 text-[12px] gap-1.5"
            style={current.id === m.id ? { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" } : undefined}
          >
            {m.id === "all" ? (
              "All maps"
            ) : (
              <>
                <span className="font-mono text-[9px] opacity-60">{i}</span>
                {m.name}
                {m.score[0] != null && (
                  <span className="font-mono text-[11px] tabular-nums">
                    {m.score[0]}–{m.score[1]}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
        <span className="ml-auto flex gap-1">
          {(
            [
              ["all", "All"],
              ["t", "Attack"],
              ["ct", "Defend"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSide(k)}
              aria-pressed={side === k}
              className="font-mono text-[10.5px] rounded-full px-2.5 py-1 border hairline"
              style={side === k ? { background: "var(--section-hue)", color: "var(--paper)", borderColor: "var(--section-hue)" } : undefined}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-ink-soft">
        {current.id !== "all" && current.pickedBy != null && <span>{data.teams[current.pickedBy]}&rsquo;s pick</span>}
        {current.id !== "all" && current.pickedBy == null && <span>Decider</span>}
        {current.id !== "all" && current.duration && <span>{current.duration}</span>}
        {vod && (
          <a href={vod.url} target="_blank" rel="noopener noreferrer" className="hover:text-ink underline decoration-dotted underline-offset-2">
            Watch map {mapNo} ↗
          </a>
        )}
        {current.id !== "all" && current.rounds.length > 0 && (
          <span className="inline-flex items-center gap-2 text-ink-faint">
            <span className="inline-flex items-center gap-1">
              <span className="w-[10px] h-[10px] rounded-[2px]" style={{ background: ATTACK }} /> attack
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-[10px] h-[10px] rounded-[2px]" style={{ background: DEFENCE }} /> defence
            </span>
            {(["elim", "boom", "defuse", "time"] as const).map((h) => (
              <span key={h} className="inline-flex items-center gap-1">
                <span className="grid place-items-center w-[15px] h-[15px] rounded-[3px] border border-[var(--rule)] text-ink-soft">
                  <HowIcon how={h} size={11} />
                </span>
                {h === "elim" ? "kills" : h === "boom" ? "spike" : h === "defuse" ? "defuse" : "time"}
              </span>
            ))}
          </span>
        )}
        <span className="ml-auto text-ink-faint">
          Stats:{" "}
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-ink">
            VLR.gg ↗
          </a>
        </span>
      </div>
      {current.id !== "all" && (
        <div className="mt-2">
          <Rounds rounds={current.rounds} teams={codes} />
        </div>
      )}

      <div className="mt-3 space-y-3">
        {[0, 1].map((t) => (
          <Table key={t} team={data.teams[t]} players={current.teams[t]} side={side} best={best} mine={follows.includes(codes[t])} />
        ))}
      </div>
    </section>
  );
}
