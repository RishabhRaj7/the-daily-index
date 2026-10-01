"use client";

import { useEffect, useMemo, useState } from "react";
import type { ValEvent, ValMatch, ValorantData, ValTeam } from "@/lib/types";
import Sheet from "@/components/extras/Sheet";
import { groupStage, playoffs, type Bracket, type GroupTable, type Slot } from "@/lib/val-bracket";

// Clutch's pop-ups, one sheet that steps between three views (with a way
// back):
//   event   the bracket drawn as a tree (upper, lower, grand final), the
//           groups or Swiss table, and the market's favourites
//   team    form, what's next, and every result since 2024 by event
//   match   two teams side by side: this match, their head-to-head since
//           2024 and each one's recent form
// Results come from Riot's schedule, kept by the paper (/api/valorant/team).

export type ClutchView = { kind: "event"; key: string } | { kind: "team"; code: string } | { kind: "match"; a: string; b: string; id?: string };

const TZ = "Asia/Kolkata";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: TZ });
const shortWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

export function Logo({ src, name, size = 22 }: { src: string | null; name: string; size?: number }) {
  if (!src) {
    return (
      <span className="grid place-items-center rounded-md bg-card-bg font-mono text-[9px] text-ink-soft shrink-0" style={{ width: size, height: size }} aria-hidden="true">
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  // Riot's logos are drawn for its dark site (many are white), so each
  // sits on a small dark tile in both themes.
  const pad = Math.max(2, Math.round(size * 0.12));
  return (
    <span className="grid place-items-center shrink-0 rounded-[5px]" style={{ width: size, height: size, background: "#17171c", padding: pad }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size - 2 * pad} height={size - 2 * pad} loading="lazy" className="object-contain w-full h-full" />
    </span>
  );
}

// ---- a team's results, fetched once per page -------------------------------------------

const history = new Map<string, Promise<ValMatch[]>>();
function loadHistory(code: string): Promise<ValMatch[]> {
  if (!history.has(code)) {
    history.set(
      code,
      fetch(`/api/valorant/team?code=${encodeURIComponent(code)}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ matches: ValMatch[] }>) : { matches: [] }))
        .then((d) => d.matches)
        .catch(() => {
          history.delete(code);
          return [];
        }),
    );
  }
  return history.get(code)!;
}

function useHistory(code: string | null): ValMatch[] | null {
  const [state, setState] = useState<{ code: string; list: ValMatch[] } | null>(null);
  useEffect(() => {
    if (!code) return;
    let live = true;
    loadHistory(code).then((list) => live && setState({ code, list }));
    return () => {
      live = false;
    };
  }, [code]);
  return code && state?.code === code ? state.list : null;
}

const us = (m: ValMatch, code: string) => m.teams.find((t) => t.code === code) ?? m.teams[0];
const them = (m: ValMatch, code: string) => m.teams.find((t) => t.code !== code) ?? m.teams[1];
const won = (m: ValMatch, code: string) => us(m, code).outcome === "win";

/** W/L squares, oldest left. */
function Form({ list, code, n = 10 }: { list: ValMatch[]; code: string; n?: number }) {
  const last = list.slice(0, n).reverse();
  if (last.length === 0) return <span className="font-mono text-[11px] text-ink-faint">No results yet</span>;
  return (
    <span className="flex gap-1" aria-label={`Last ${last.length}: ${last.map((m) => (won(m, code) ? "W" : "L")).join(" ")}`}>
      {last.map((m) => (
        <span
          key={m.id}
          title={`${won(m, code) ? "Won" : "Lost"} ${us(m, code).wins ?? 0}–${them(m, code).wins ?? 0} v ${them(m, code).name} · ${m.event} · ${date(m.start)}`}
          className="grid place-items-center w-5 h-5 rounded-[4px] font-mono text-[9px] font-bold"
          style={won(m, code) ? { background: "var(--up)", color: "var(--paper)" } : { background: "color-mix(in srgb, var(--down) 22%, transparent)", color: "var(--down)" }}
        >
          {won(m, code) ? "W" : "L"}
        </span>
      ))}
    </span>
  );
}

function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 rounded-lg bg-card-bg" />
      ))}
    </div>
  );
}

// ---- the bracket ------------------------------------------------------------------------

const CARD_W = 184;
const CARD_H = 58;
const COL_GAP = 34;
const ROW = CARD_H + 26;
const HEAD = 22;

function SlotCard({ s, follows, onOpen }: { s: Slot; follows: string[]; onOpen: (m: ValMatch) => void }) {
  const m = s.match;
  const done = m?.state === "completed";
  const live = m?.state === "inProgress";
  const known = m && m.teams.every((t) => t.code !== "TBD");
  return (
    <button
      type="button"
      disabled={!known}
      onClick={() => m && onOpen(m)}
      className="block w-full h-full text-left rounded-lg border hairline bg-surface overflow-hidden transition-colors enabled:hover:border-[color:var(--section-hue)] disabled:cursor-default"
      style={live ? { borderColor: "var(--section-hue)" } : undefined}
    >
      {(m?.teams ?? [null, null]).map((t, i) => {
        const mine = t && follows.includes(t.code);
        const lost = done && t?.outcome === "loss";
        return (
          <span
            key={i}
            className={`flex items-center gap-1.5 px-2 h-[24px] text-[12px] ${i === 0 ? "border-b hairline" : ""} ${lost ? "text-ink-faint" : ""}`}
            style={mine ? { background: "color-mix(in srgb, var(--section-hue) 14%, transparent)" } : undefined}
          >
            {t && t.code !== "TBD" ? <Logo src={t.image} name={t.code} size={14} /> : <span className="w-[14px] h-[14px] rounded bg-card-bg shrink-0" />}
            <span className={`truncate flex-1 ${t?.outcome === "win" ? "font-semibold" : ""} ${mine ? "text-[color:var(--section-hue)] font-semibold" : ""}`}>
              {t && t.code !== "TBD" ? t.name : "TBD"}
            </span>
            <span className="font-mono tabular-nums w-3 text-right">{done || live ? (t?.wins ?? 0) : ""}</span>
          </span>
        );
      })}
      <span className="sr-only">{s.label}</span>
    </button>
  );
}

function BracketTree({ b, follows, onOpen }: { b: Bracket; follows: string[]; onOpen: (m: ValMatch) => void }) {
  if (b.kind === "rounds") {
    return (
      <div className="overflow-x-auto -mx-1 px-1 pb-2">
        <div className="flex gap-6 min-w-max">
          {b.upper.map((c) => (
            <div key={c.title} style={{ width: CARD_W }}>
              <div className="font-label text-[9px] text-ink-soft mb-2">{c.title}</div>
              <div className="space-y-3">
                {c.slots.map((s) => (
                  <div key={s.id} style={{ height: CARD_H }}>
                    <SlotCard s={s} follows={follows} onOpen={onOpen} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {b.final.length > 0 && (
            <div style={{ width: CARD_W }}>
              <div className="font-label text-[9px] text-ink-soft mb-2">Final</div>
              {b.final.map((s) => (
                <div key={s.id} style={{ height: CARD_H }}>
                  <SlotCard s={s} follows={follows} onOpen={onOpen} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Positions: each column spreads its slots evenly over its band's height,
  // so a slot's winner meets its sibling halfway in the next column.
  const upperRows = Math.max(...b.upper.map((c) => c.slots.length), 1);
  const lowerRows = Math.max(...b.lower.map((c) => c.slots.length), 0);
  const upperH = HEAD + upperRows * ROW;
  const lowerTop = upperH + (lowerRows ? 26 : 0);
  const lowerH = lowerRows ? HEAD + lowerRows * ROW : 0;
  const finalCol = Math.max(b.upper.length, b.lower.length);
  const x = (col: number) => col * (CARD_W + COL_GAP);
  const pos = new Map<string, { x: number; y: number; title?: string }>();
  const place = (cols: Bracket["upper"], top: number, rows: number) =>
    cols.forEach((c, ci) =>
      c.slots.forEach((s, si) => {
        const band = (rows * ROW) / c.slots.length;
        pos.set(s.id, { x: x(ci), y: top + HEAD + band * si + band / 2 - CARD_H / 2 });
      }),
    );
  place(b.upper, 0, upperRows);
  place(b.lower, lowerTop, lowerRows);
  // The grand final level with the upper final; third place under it.
  const uf = b.upper[b.upper.length - 1]?.slots[0];
  const ufY = uf ? pos.get(uf.id)!.y : HEAD;
  b.final.forEach((s, i) => pos.set(s.id, { x: x(finalCol), y: ufY + i * (CARD_H + 40) }));
  const width = x(finalCol) + CARD_W;
  const height = Math.max(lowerTop + lowerH, ufY + b.final.length * (CARD_H + 40));

  const all = [...b.upper, ...b.lower].flatMap((c) => c.slots).concat(b.final);
  // Every connector is one elbow: out of the right edge, along to just
  // before the target's column, up or down to its middle, then in.
  const lines = all.flatMap((s) => {
    const a = s.to ? pos.get(s.id) : undefined;
    const t = s.to ? pos.get(s.to) : undefined;
    if (!a || !t || t.x <= a.x) return [];
    const x1 = a.x + CARD_W;
    const turn = t.x - COL_GAP / 2;
    return [`M ${x1} ${a.y + CARD_H / 2} H ${turn} V ${t.y + CARD_H / 2} H ${t.x}`];
  });
  const titles = [
    ...b.upper.map((c, i) => ({ t: c.title, x: x(i), y: 0 })),
    ...b.lower.map((c, i) => ({ t: c.title, x: x(i), y: lowerTop })),
    ...b.final.map((f) => ({ t: f.label, x: x(finalCol), y: pos.get(f.id)!.y - HEAD + 4 })),
  ];

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2">
      <div className="relative" style={{ width, height }}>
        <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden="true">
          {lines.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="var(--rule)" strokeWidth={1.5} />
          ))}
        </svg>
        {titles.map((h) => (
          <div key={`${h.t}-${h.x}-${h.y}`} className="absolute font-label text-[9px] text-ink-soft" style={{ left: h.x, top: h.y, width: CARD_W }}>
            {h.t}
          </div>
        ))}
        {b.lower.length > 0 && <div className="absolute left-0 right-0 border-t hairline border-dashed" style={{ top: lowerTop - 13 }} />}
        {all.map((s) => {
          const p = pos.get(s.id)!;
          return (
            <div key={s.id} className="absolute" style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H }}>
              <SlotCard s={s} follows={follows} onOpen={onOpen} />
              {s.match && (
                <div className="absolute -bottom-[15px] left-0 font-mono text-[9px] text-ink-faint whitespace-nowrap">
                  {s.match.state === "inProgress" ? (
                    <span className="text-[color:var(--section-hue)] font-semibold">LIVE</span>
                  ) : s.match.state === "completed" ? (
                    `${date(s.match.start)} · Bo${s.match.bestOf}`
                  ) : (
                    `${shortWhen(s.match.start)} IST · Bo${s.match.bestOf}`
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupCard({ g, follows, onOpen, onTeam }: { g: GroupTable; follows: string[]; onOpen: (m: ValMatch) => void; onTeam: (code: string) => void }) {
  const next = g.matches.filter((m) => m.state !== "completed" && m.teams.every((t) => t.code !== "TBD")).slice(0, 2);
  return (
    <div className="rounded-xl border hairline p-3">
      <div className="font-label text-[10px] text-ink-soft mb-2">{g.name}</div>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="font-label text-[8px] text-ink-faint text-right">
            <th className="text-left font-normal pb-1">Team</th>
            <th className="font-normal pb-1 w-10">W–L</th>
            <th className="font-normal pb-1 w-12">Maps</th>
            <th className="font-normal pb-1 w-16" />
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r) => {
            const mine = follows.includes(r.code);
            return (
              <tr key={r.code} className={`border-t hairline ${r.status === "out" ? "text-ink-faint" : ""}`}>
                <td className="py-1.5">
                  <button type="button" onClick={() => onTeam(r.code)} className="flex items-center gap-1.5 min-w-0 hover:underline decoration-dotted underline-offset-2">
                    <Logo src={r.image} name={r.code} size={16} />
                    <span className={`truncate ${mine ? "font-semibold text-[color:var(--section-hue)]" : ""}`}>{r.name}</span>
                  </button>
                </td>
                <td className="font-mono text-right tabular-nums">
                  {r.w}–{r.l}
                </td>
                <td className="font-mono text-right tabular-nums text-ink-soft">{r.maps}</td>
                <td className="text-right">
                  {r.status && (
                    <span
                      className="font-label text-[8px] rounded-full px-1.5 py-0.5"
                      style={r.status === "through" ? { background: "var(--section-hue)", color: "var(--paper)" } : { border: "1px solid var(--rule)" }}
                    >
                      {r.status === "through" ? "Through" : "Out"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {next.length > 0 && (
        <ul className="mt-2 space-y-1">
          {next.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onOpen(m)} className="w-full flex justify-between gap-2 font-mono text-[10px] text-ink-soft hover:text-ink">
                <span>
                  {m.teams[0].code} v {m.teams[1].code}
                </span>
                <span>{m.state === "inProgress" ? "LIVE" : `${shortWhen(m.start)} IST`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventView({ event, data, follows, go }: { event: ValEvent; data: ValorantData; follows: string[]; go: (v: ClutchView) => void }) {
  const inEvent = useMemo(() => data.matches.filter((m) => m.eventKey === event.key && !m.fromMarket), [data.matches, event.key]);
  const bracket = useMemo(() => playoffs(inEvent), [inEvent]);
  const groups = useMemo(() => groupStage(inEvent), [inEvent]);
  const started = inEvent.some((m) => /playoff|final/i.test(m.stage) && m.state !== "unstarted");
  const groupsDone = groups ? groups.tables.every((t) => t.matches.every((m) => m.state === "completed")) : true;
  // In the order they're played; the one being played opens first.
  const tabs = [
    ...(groups ? [["groups", groups.kind === "swiss" ? "Swiss stage" : "Groups"] as const] : []),
    ...(bracket ? [["bracket", "Playoffs"] as const] : []),
    ...(event.odds ? [["odds", "To win"] as const] : []),
  ];
  const [tab, setTab] = useState<string>(bracket && (started || groupsDone) ? "bracket" : (tabs[0]?.[0] ?? "bracket"));
  const open = (m: ValMatch) => go({ kind: "match", a: m.teams[0].code, b: m.teams[1].code, id: m.id });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className="chip h-8 text-[12px]" aria-pressed={tab === k} style={tab === k ? { background: "var(--section-hue)", borderColor: "var(--section-hue)", color: "var(--paper)" } : undefined}>
            {label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-ink-faint">Times IST · tap a match for the head-to-head</span>
      </div>

      {tab === "bracket" && bracket && (
        <>
          {!started && <p className="font-sans text-[13px] text-ink-soft -mt-2 mb-4">The draw fills in as the {groups?.kind === "swiss" ? "Swiss stage" : "groups"} finish. Matches start {when(inEvent.find((m) => /playoff/i.test(m.stage))?.start ?? event.end)} IST.</p>}
          <BracketTree b={bracket} follows={follows} onOpen={open} />
        </>
      )}
      {tab === "groups" && groups && (
        <div className="grid sm:grid-cols-2 gap-3">
          {groups.tables.map((g) => (
            <GroupCard key={g.name} g={g} follows={follows} onOpen={open} onTeam={(code) => go({ kind: "team", code })} />
          ))}
        </div>
      )}
      {tab === "odds" && event.odds && (
        <div>
          <ul className="space-y-2">
            {event.odds.field.map((f, i) => {
              const team = data.teams.find((t) => t.name.toLowerCase() === f.name.toLowerCase());
              const mine = team && follows.includes(team.code);
              const max = event.odds!.field[0].prob || 1;
              return (
                <li key={f.name} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3.2rem] items-center gap-3 text-[13px]">
                  <span className={`flex items-center gap-1.5 min-w-0 ${mine ? "font-semibold text-[color:var(--section-hue)]" : i === 0 ? "font-semibold" : ""}`}>
                    {team && <Logo src={team.image} name={team.code} size={16} />}
                    <span className="truncate">{f.name}</span>
                  </span>
                  <span className="h-2 rounded-full bg-[color:var(--rule)] overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${(f.prob / max) * 100}%`, background: mine || i === 0 ? "var(--section-hue)" : "var(--ink-faint)" }} />
                  </span>
                  <span className="font-mono text-right tabular-nums">{f.prob < 1 ? "<1" : Math.round(f.prob)}%</span>
                </li>
              );
            })}
          </ul>
          <p className="font-mono text-[10px] text-ink-faint mt-4">
            Polymarket · ${Math.round(event.odds.volume).toLocaleString("en-US")} traded ·{" "}
            <a href={event.odds.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
              open ↗
            </a>{" "}
            (needs a VPN in India)
          </p>
        </div>
      )}
    </div>
  );
}

// ---- a team -----------------------------------------------------------------------------

function MatchRow({ m, code, onOpen }: { m: ValMatch; code: string; onOpen: (m: ValMatch) => void }) {
  const o = them(m, code);
  const done = m.state === "completed";
  const w = won(m, code);
  return (
    <li>
      <button type="button" onClick={() => onOpen(m)} disabled={o.code === "TBD"} className="w-full grid grid-cols-[4.6rem_minmax(0,1fr)_auto] items-center gap-2 py-2 text-left text-[13px] group enabled:hover:bg-card-bg rounded-md px-1 -mx-1">
        <span className="font-mono text-[10px] text-ink-soft">{done ? date(m.start) : shortWhen(m.start)}</span>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-ink-faint text-[11px]">v</span>
          {o.code !== "TBD" && <Logo src={o.image} name={o.code} size={16} />}
          <span className="truncate group-enabled:group-hover:underline decoration-dotted underline-offset-2">{o.code === "TBD" ? "To be decided" : o.name}</span>
          <span className="font-mono text-[10px] text-ink-faint truncate hidden sm:inline">· {m.stage}</span>
        </span>
        <span className="font-mono text-[12px] tabular-nums">
          {done ? (
            <span className={w ? "text-up font-semibold" : "text-down font-semibold"}>
              {w ? "W" : "L"} {us(m, code).wins ?? 0}–{o.wins ?? 0}
            </span>
          ) : m.state === "inProgress" ? (
            <span className="text-[color:var(--section-hue)] font-semibold">LIVE</span>
          ) : m.odds ? (
            <span className="text-ink-soft">{m.teams[0].code === code ? m.odds.a : m.odds.b}% to win</span>
          ) : (
            <span className="text-ink-faint">Bo{m.bestOf}</span>
          )}
        </span>
      </button>
    </li>
  );
}

function TeamView({ team, data, go }: { team: ValTeam; data: ValorantData; go: (v: ClutchView) => void }) {
  const past = useHistory(team.code);
  const upcoming = data.matches.filter((m) => m.state !== "completed" && m.teams.some((t) => t.code === team.code));
  const open = (m: ValMatch) => go({ kind: "match", a: team.code, b: them(m, team.code).code, id: m.id });
  const year = String(new Date(data.fetchedAt).getUTCFullYear());
  const thisYear = (past ?? []).filter((m) => m.start.startsWith(year));
  const series = { w: thisYear.filter((m) => won(m, team.code)).length, l: thisYear.filter((m) => !won(m, team.code)).length };
  const maps = thisYear.reduce((s, m) => ({ w: s.w + (us(m, team.code).wins ?? 0), l: s.l + (them(m, team.code).wins ?? 0) }), { w: 0, l: 0 });
  // One block per event, newest event first (events overlap in time).
  const byEvent = useMemo(() => {
    const out = new Map<string, { event: string; list: ValMatch[] }>();
    for (const m of past ?? []) {
      const g = out.get(m.eventKey) ?? { event: m.event, list: [] };
      g.list.push(m);
      out.set(m.eventKey, g);
    }
    return [...out.values()];
  }, [past]);
  const [shown, setShown] = useState(4);
  // The featured event's next stage, when the team is through but not yet drawn.
  const featured = data.featured;
  const nextStage =
    upcoming.length === 0 && featured && !featured.finished
      ? data.matches.find((m) => m.eventKey === featured.key && m.state === "unstarted" && m.teams.every((t) => t.code === "TBD"))
      : undefined;

  return (
    <div>
      <div className="grid sm:grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 items-center">
        <Logo src={team.image} name={team.code} size={64} />
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-ink-soft">
            {team.region ?? "VCT"} · {team.code}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-1.5">
            {past ? <Form list={past} code={team.code} /> : <span className="h-5 w-40 rounded bg-card-bg animate-pulse" />}
            {past && thisYear.length > 0 && (
              <span className="font-mono text-[11px] text-ink-soft">
                {year}: series {series.w}–{series.l} · maps {maps.w}–{maps.l}
              </span>
            )}
          </div>
        </div>
      </div>

      <section className="mt-6">
        <h3 className="font-label text-[10px] text-ink-soft mb-1">Next</h3>
        {upcoming.length > 0 ? (
          <ul className="divide-y hairline">
            {upcoming.slice(0, 4).map((m) => (
              <MatchRow key={m.id} m={m} code={team.code} onOpen={open} />
            ))}
          </ul>
        ) : nextStage ? (
          <p className="font-sans text-[13px] py-2">
            {nextStage.stage} of {featured!.name} from {when(nextStage.start)} IST; the opponent is set when the draw is made.
          </p>
        ) : (
          <p className="font-sans text-[13px] text-ink-soft py-2">Nothing scheduled yet.</p>
        )}
      </section>

      <section className="mt-6">
        <h3 className="font-label text-[10px] text-ink-soft mb-2">Results since 2024</h3>
        {!past ? (
          <Skeleton />
        ) : past.length === 0 ? (
          <p className="font-sans text-[13px] text-ink-soft">No results in the majors since 2024.</p>
        ) : (
          <div className="space-y-4">
            {byEvent.slice(0, shown).map((g) => (
              <div key={g.event}>
                <div className="font-sans font-semibold text-[13px] border-b hairline pb-1">{g.event}</div>
                <ul className="divide-y hairline">
                  {g.list.map((m) => (
                    <MatchRow key={m.id} m={m} code={team.code} onOpen={open} />
                  ))}
                </ul>
              </div>
            ))}
            {byEvent.length > shown && (
              <button type="button" className="chip h-8 text-[12px]" onClick={() => setShown((n) => n + 6)}>
                Earlier events ({byEvent.length - shown})
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ---- two teams --------------------------------------------------------------------------

function Side({ t, align, go }: { t: { code: string; name: string; image: string | null }; align: "left" | "right"; go: (v: ClutchView) => void }) {
  return (
    <button type="button" onClick={() => go({ kind: "team", code: t.code })} className={`flex flex-col ${align === "left" ? "items-start text-left" : "items-end text-right"} gap-2 min-w-0 group`}>
      <Logo src={t.image} name={t.code} size={56} />
      <span className="font-display font-bold text-[1.25rem] leading-tight group-hover:underline decoration-dotted underline-offset-4">{t.name}</span>
    </button>
  );
}

function MatchView({ a, b, id, data, go }: { a: string; b: string; id?: string; data: ValorantData; go: (v: ClutchView) => void }) {
  const ha = useHistory(a);
  const hb = useHistory(b);
  const team = (code: string) => data.teams.find((t) => t.code === code);
  const live = data.matches.find((m) => m.id === id);
  const fromPast = ha?.find((m) => m.id === id);
  const match = live ?? fromPast;
  const side = (code: string) => match?.teams.find((t) => t.code === code) ?? (ha ?? []).flatMap((m) => m.teams).find((t) => t.code === code);
  const A = { code: a, name: team(a)?.name ?? side(a)?.name ?? a, image: team(a)?.image ?? side(a)?.image ?? null };
  const B = { code: b, name: team(b)?.name ?? side(b)?.name ?? b, image: team(b)?.image ?? side(b)?.image ?? null };
  const meetings = (ha ?? []).filter((m) => m.teams.some((t) => t.code === b));
  const aw = meetings.filter((m) => won(m, a)).length;
  const bw = meetings.length - aw;
  const mapsA = meetings.reduce((s, m) => s + (us(m, a).wins ?? 0), 0);
  const mapsB = meetings.reduce((s, m) => s + (us(m, b).wins ?? 0), 0);
  const done = match?.state === "completed";
  const oddsA = match?.odds ? (match.teams[0].code === a ? match.odds.a : match.odds.b) : null;

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
        <Side t={A} align="left" go={go} />
        <div className="text-center">
          {match && (done || match.state === "inProgress") ? (
            <div className="font-display font-extrabold text-[2.6rem] leading-none tabular-nums">
              {us(match, a).wins ?? 0}
              <span className="text-ink-faint mx-1">–</span>
              {us(match, b).wins ?? 0}
            </div>
          ) : (
            <div className="font-display font-extrabold text-[2rem] leading-none text-ink-faint">vs</div>
          )}
          {match && (
            <div className="font-mono text-[10px] text-ink-soft mt-2 leading-relaxed">
              {match.state === "inProgress" ? <span className="text-[color:var(--section-hue)] font-semibold">LIVE · </span> : null}
              {done ? date(match.start) : `${when(match.start)} IST`}
              <br />
              {match.event} · {match.stage} · Bo{match.bestOf}
            </div>
          )}
        </div>
        <Side t={B} align="right" go={go} />
      </div>

      {oddsA != null && !done && (
        <div className="mt-5">
          <div className="flex justify-between font-mono text-[11px] tabular-nums">
            <span className="font-semibold">{oddsA}%</span>
            <span className="text-ink-soft">Polymarket, to win the match</span>
            <span className="font-semibold">{100 - oddsA}%</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden mt-1 bg-[color:var(--rule)]">
            <span style={{ width: `${oddsA}%`, background: "var(--section-hue)" }} />
            <span className="flex-1" style={{ background: "var(--ink-faint)" }} />
          </div>
        </div>
      )}

      <section className="mt-7">
        <h3 className="font-label text-[10px] text-ink-soft mb-2">Head to head since 2024</h3>
        {!ha ? (
          <Skeleton rows={3} />
        ) : meetings.length === 0 ? (
          <p className="font-sans text-[13px] text-ink-soft">They haven&rsquo;t met in the majors since 2024.</p>
        ) : (
          <>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
              <span className="font-display font-extrabold text-[2.2rem] leading-none tabular-nums">{aw}</span>
              <span>
                <span className="flex h-2.5 rounded-full overflow-hidden bg-[color:var(--rule)]">
                  <span style={{ width: `${(aw / meetings.length) * 100}%`, background: "var(--section-hue)" }} />
                  <span className="flex-1" style={{ background: "var(--ink-faint)" }} />
                </span>
                <span className="block text-center font-mono text-[10px] text-ink-soft mt-1.5">
                  series won · maps {mapsA}–{mapsB}
                </span>
              </span>
              <span className="font-display font-extrabold text-[2.2rem] leading-none tabular-nums">{bw}</span>
            </div>
            <ul className="mt-4 divide-y hairline">
              {meetings.map((m) => (
                <li key={m.id} className="grid grid-cols-[4.6rem_minmax(0,1fr)_auto] items-center gap-2 py-2 text-[12.5px]">
                  <span className="font-mono text-[10px] text-ink-soft">{date(m.start)}</span>
                  <span className="truncate text-ink-soft">
                    {m.event} · {m.stage}
                  </span>
                  <span className="font-mono tabular-nums">
                    <span className={won(m, a) ? "font-semibold" : "text-ink-faint"}>{a} {us(m, a).wins ?? 0}</span>
                    <span className="text-ink-faint"> – </span>
                    <span className={won(m, b) ? "font-semibold" : "text-ink-faint"}>{us(m, b).wins ?? 0} {b}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-7 grid grid-cols-2 gap-4">
        {[
          [A, ha],
          [B, hb],
        ].map(([t, h]) => {
          const tt = t as typeof A;
          const list = h as ValMatch[] | null;
          return (
            <div key={tt.code}>
              <h3 className="font-label text-[10px] text-ink-soft mb-2">{tt.code}, last five</h3>
              {list ? <Form list={list} code={tt.code} n={5} /> : <span className="block h-5 w-28 rounded bg-card-bg animate-pulse" />}
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ---- the sheet --------------------------------------------------------------------------

export default function ClutchSheet({ start, data, follows, onClose }: { start: ClutchView; data: ValorantData; follows: string[]; onClose: () => void }) {
  const [stack, setStack] = useState<ClutchView[]>([start]);
  const view = stack[stack.length - 1];
  const go = (v: ClutchView) => setStack((s) => [...s, v]);
  const back = stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : null;

  const event = view.kind === "event" ? ([data.featured, ...data.events].find((e) => e?.key === view.key) ?? data.featured) : null;
  const team = view.kind === "team" ? data.teams.find((t) => t.code === view.code) : null;
  const nameOf = (code: string) => data.teams.find((t) => t.code === code)?.name ?? code;

  const title =
    view.kind === "event" ? (event?.name ?? "Event") : view.kind === "team" ? (team?.name ?? view.code) : `${nameOf(view.a)} v ${nameOf(view.b)}`;
  const kicker = (
    <span className="flex items-center gap-3">
      {back && (
        <button type="button" onClick={back} className="font-label text-[10px] hover:text-ink" style={{ color: "var(--section-hue)" }}>
          ‹ Back
        </button>
      )}
      <span>
        Clutch ·{" "}
        {view.kind === "event" && event
          ? `${event.stage || "Schedule"} · ${new Date(event.start).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ })}–${new Date(event.end).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ })}`
          : view.kind === "team"
            ? "Team"
            : "Head to head"}
      </span>
    </span>
  );

  return (
    <Sheet title={title} kicker={kicker} onClose={onClose} width={view.kind === "event" ? 1080 : 720} hue="var(--hue-clutch)">
      {view.kind === "event" && event && <EventView key={event.key} event={event} data={data} follows={follows} go={go} />}
      {view.kind === "team" && team && <TeamView key={team.code} team={team} data={data} go={go} />}
      {view.kind === "team" && !team && (
        <TeamView key={view.code} team={{ code: view.code, name: view.code, image: null }} data={data} go={go} />
      )}
      {view.kind === "match" && <MatchView key={`${view.a}-${view.b}-${view.id}`} a={view.a} b={view.b} id={view.id} data={data} go={go} />}
    </Sheet>
  );
}
