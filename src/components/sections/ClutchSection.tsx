"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ValEvent, ValMatch, ValorantData, ValTeam } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import Sheet from "@/components/extras/Sheet";
import { loadPersonalization, savePersonalization } from "@/lib/personalization";
import ClutchSheet, { Logo, type ClutchView } from "@/components/widgets/ClutchSheets";

// Clutch: Valorant, kept small. One band, three columns:
//   your teams   next match (with the market's price), last result, where
//                they stand; "Edit" opens the picker right here
//   the event    what's on (Champions, Masters, a VCT league), how far in,
//                the next few matches and the market's favourites
//   the wire     three headlines from VLR, your teams first
// Off-season the band shrinks to one line of dates beside the headlines.
// A team opens its form and results since 2024; a match, the two teams'
// head-to-head; the event, its bracket, groups and odds (ClutchSheets).
// Times are IST, like the Week Ahead; "now" ticks by the minute from the
// moment the data was read, so the server's HTML and the page agree.

const MAX_TEAMS = 3;
const REFRESH_MS = 2 * 60_000;

const TZ = "Asia/Kolkata";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ });
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
const dayOf = (t: string | number) => new Date(t).toLocaleDateString("en-CA", { timeZone: TZ });

function subscribeMinute(cb: () => void) {
  const id = window.setInterval(cb, 60_000);
  return () => window.clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const h = (now - Date.parse(iso)) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/** Two teams' chances as one split bar, the followed side (or the first) in the section's colour. */
function OddsBar({ m, focus }: { m: ValMatch; focus?: string }) {
  if (!m.odds) return null;
  const [a, b] = m.teams;
  const leftIsFocus = !focus || a.code === focus;
  return (
    <span title={`Polymarket · $${Math.round(m.odds.volume).toLocaleString("en-US")} traded`} className="block mt-1.5">
      <span className="flex justify-between font-mono text-[10px] tabular-nums">
        <span className={leftIsFocus ? "text-[color:var(--section-hue)] font-semibold" : "text-ink-soft"}>
          {a.code} {m.odds.a}%
        </span>
        <span className={!leftIsFocus ? "text-[color:var(--section-hue)] font-semibold" : "text-ink-soft"}>
          {m.odds.b}% {b.code}
        </span>
      </span>
      <span className="flex h-1 mt-1 rounded-full overflow-hidden bg-[color:var(--rule)]">
        <span
          className="h-full bar-grow"
          style={{ width: `${m.odds.a}%`, background: leftIsFocus ? "var(--section-hue)" : "var(--ink-faint)" }}
        />
      </span>
    </span>
  );
}

// ---- the picker ---------------------------------------------------------------------

function TeamPicker({ teams, onClose }: { teams: ValTeam[]; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>(loadPersonalization().valorantTeams);
  const toggle = (code: string) =>
    setPicked((list) =>
      list.includes(code) ? list.filter((c) => c !== code) : list.length >= MAX_TEAMS ? [...list.slice(1), code] : [...list, code],
    );
  const regions = [...new Set(teams.map((t) => t.region ?? "Other"))];
  const save = () => {
    savePersonalization({ ...loadPersonalization(), valorantTeams: picked });
    onClose();
  };

  return (
    <Sheet title="Your teams" kicker="Clutch · Valorant" onClose={onClose} width={760}>
      <p className="font-sans text-[13px] text-ink-soft -mt-2 mb-5">
        Up to {MAX_TEAMS} teams from the VCT leagues. Their matches, results and odds lead the section.
      </p>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
        {regions.map((region) => (
          <div key={region}>
            <div className="font-label text-[10px] text-ink-soft mb-2">{region}</div>
            <div className="flex flex-wrap gap-2">
              {teams
                .filter((t) => (t.region ?? "Other") === region)
                .map((t) => {
                  const on = picked.includes(t.code);
                  return (
                    <button
                      key={t.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(t.code)}
                      className="chip h-8 text-[12px] gap-1.5"
                      style={on ? { background: "var(--hue-clutch)", borderColor: "var(--hue-clutch)", color: "var(--paper)" } : undefined}
                    >
                      <Logo src={t.image} name={t.code} size={16} />
                      {t.name}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 mt-6 pt-4 pb-1 bg-surface border-t hairline flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-ink-faint">
          {picked.length}/{MAX_TEAMS} picked
        </span>
        <span className="flex gap-2">
          <button type="button" className="chip" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="chip chip-signal" onClick={save}>
            Save teams
          </button>
        </span>
      </div>
    </Sheet>
  );
}

// ---- your teams ---------------------------------------------------------------------

function TeamCard({ team, data, open }: { team: ValTeam; data: ValorantData; open: (v: ClutchView) => void }) {
  const mine = data.matches.filter((m) => m.teams.some((t) => t.code === team.code));
  const next = mine.find((m) => m.state !== "completed");
  const last = [...mine].reverse().find((m) => m.state === "completed");
  const us = (m: ValMatch) => m.teams.find((t) => t.code === team.code)!;
  const them = (m: ValMatch) => m.teams.find((t) => t.code !== team.code)!;
  const inFeatured = data.featured && mine.some((m) => m.eventKey === data.featured!.key);
  const record = last ? us(last).record : undefined;
  const chance = data.featured?.odds?.field.find((f) => f.name.toLowerCase() === team.name.toLowerCase());

  // Still in it? A team the market still prices to win is; so is one whose
  // last match was a win (the next round's pairings may not be drawn yet).
  // A loss with the market no longer pricing it means it's out.
  const featured = data.featured;
  const field = featured?.odds?.field;
  const lastInEvent = last && featured && last.eventKey === featured.key ? last : undefined;
  const alive = !!chance || (lastInEvent ? us(lastInEvent).outcome === "win" || !field : false);
  const nextRound =
    featured && lastInEvent
      ? data.matches.find((m) => m.eventKey === featured.key && m.state === "unstarted" && m.stage && m.stage !== lastInEvent.stage)
      : undefined;

  let status = "";
  if (next?.state === "inProgress") status = "Playing now";
  else if (next) status = `${next.stage || next.event}${record ? ` · ${record}` : ""}`;
  else if (featured?.international && !inFeatured) status = `Not at ${featured.name}`;
  else if (lastInEvent && !featured!.finished && alive)
    status = `${record ? `${record} in ${lastInEvent.stage} · ` : ""}${nextRound ? `${nextRound.stage} from ${date(nextRound.start)}` : "through"}`;
  else if (lastInEvent && !featured!.finished) status = `Out of ${featured!.name}`;
  else if (last) status = "Season done";

  // Through, but the next round isn't drawn: say when it starts.
  const pending = !next && alive && nextRound && lastInEvent ? nextRound : undefined;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <button type="button" onClick={() => open({ kind: "team", code: team.code })} className="w-full flex items-center gap-2.5 text-left group">
        <Logo src={team.image} name={team.code} size={26} />
        <div className="min-w-0 flex-1">
          <div className="font-sans font-semibold text-[14px] leading-tight truncate group-hover:text-[color:var(--section-hue)]">
            {team.name} <span className="font-mono text-[10px] text-ink-faint font-normal">›</span>
          </div>
          <div className="font-mono text-[10px] text-ink-soft truncate">{status}</div>
        </div>
        {chance && (
          <div className="text-right shrink-0" title={`${data.featured!.odds!.title} · Polymarket`}>
            <div className="font-display font-bold text-[1.35rem] leading-none tabular-nums">{Math.round(chance.prob)}%</div>
            <div className="font-label text-[7px] text-ink-faint mt-0.5">to win it</div>
          </div>
        )}
      </button>
      {pending && (
        <div className="mt-2 pl-[36px] font-sans text-[12.5px]">
          <span className="text-ink-soft">Next </span>
          {pending.stage}, from {when(pending.start)}
          <span className="block font-mono text-[10px] text-ink-soft">Opponent set when the draw is made</span>
        </div>
      )}
      {next && (
        <button
          type="button"
          disabled={them(next).code === "TBD"}
          onClick={() => open({ kind: "match", a: team.code, b: them(next).code, id: next.id })}
          className="block w-full text-left mt-2 pl-[36px] group/next"
        >
          <div className="font-sans text-[12.5px] flex items-center gap-1.5 min-w-0">
            <span className="text-ink-soft shrink-0">Next</span>
            <Logo src={them(next).image} name={them(next).code} size={14} />
            <span className="truncate group-enabled/next:group-hover/next:underline decoration-dotted underline-offset-2">
              {them(next).code === "TBD" ? "opponent to be decided" : them(next).name}
            </span>
          </div>
          <div className="font-mono text-[10px] text-ink-soft">
            {next.state === "inProgress" ? `Live · ${us(next).wins ?? 0}–${them(next).wins ?? 0}` : when(next.start)} · Bo{next.bestOf}
          </div>
          <OddsBar m={next} focus={team.code} />
        </button>
      )}
      {last && (
        <button
          type="button"
          onClick={() => open({ kind: "match", a: team.code, b: them(last).code, id: last.id })}
          className="block w-full text-left mt-1.5 pl-[36px] font-mono text-[10.5px] text-ink-soft truncate hover:text-ink"
        >
          <span className={us(last).outcome === "win" ? "text-up font-semibold" : us(last).outcome === "loss" ? "text-down font-semibold" : ""}>
            {us(last).outcome === "win" ? "W" : us(last).outcome === "loss" ? "L" : "–"} {us(last).wins ?? 0}–{them(last).wins ?? 0}
          </span>{" "}
          v {them(last).code} · {last.event.replace(/ · /g, " ")} · {date(last.start)}
        </button>
      )}
    </li>
  );
}

// ---- the event --------------------------------------------------------------------------

function EventPanel({ event, data, follows, now, open }: { event: ValEvent; data: ValorantData; follows: string[]; now: number; open: (v: ClutchView) => void }) {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  const progress = Math.round(Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start))) * 100) / 100;
  const inEvent = data.matches.filter((m) => m.eventKey === event.key);
  const live = inEvent.filter((m) => m.state === "inProgress");
  const upcoming = inEvent.filter((m) => m.state === "unstarted" && m.teams.some((t) => t.code !== "TBD"));
  // The last two results always stay (oldest first, so the newest sits just
  // above what's next), then what's live and up to four still to come.
  const results = inEvent.filter((m) => m.state === "completed").slice(-2);
  const ahead = [...live, ...upcoming.slice(0, Math.max(0, 4 - live.length))];
  const rows = [...results, ...ahead];
  const field = event.odds?.field.slice(0, 4) ?? [];

  return (
    <div className="min-w-0 flex flex-col h-full">
      <button type="button" onClick={() => open({ kind: "event", key: event.key })} className="flex items-center gap-2 text-left group">
        <Logo src={event.logo} name={event.name} size={22} />
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-[1.25rem] leading-none truncate group-hover:text-[color:var(--section-hue)]">{event.name}</div>
          <div className="font-mono text-[10px] text-ink-soft mt-1">
            {event.stage || "Scheduled"} · {date(event.start)}–{date(event.end)}
          </div>
        </div>
        <span className="chip h-7 px-2.5 text-[10.5px] shrink-0">Bracket ›</span>
      </button>
      <div className="relative h-1 rounded-full bg-[color:var(--rule)] mt-3" title={`${Math.round(progress * 100)}% of the way through`}>
        <div className="h-full rounded-full bar-grow" style={{ width: `${progress * 100}%`, background: "var(--section-hue)" }} />
      </div>

      <ul className="mt-3 divide-y hairline">
        {rows.map((m, i) => {
          const [a, b] = m.teams;
          const mineA = follows.includes(a.code);
          const mineB = follows.includes(b.code);
          const done = m.state === "completed";
          // On a phone: the latest result and the next two.
          const hideOnPhone = done ? i < results.length - 1 : i - results.length >= 2;
          // A hairline between what's played and what's next.
          const turn = i === results.length && results.length > 0;
          return (
            <li key={m.id} className={`${hideOnPhone ? "max-sm:hidden" : ""} ${turn ? "!border-t-[color:var(--ink-faint)]" : ""}`}>
              <button
                type="button"
                onClick={() => open({ kind: "match", a: a.code, b: b.code, id: m.id })}
                className={`w-full text-left py-2 grid grid-cols-[4.4rem_minmax(0,1fr)_auto] items-center gap-2 text-[12px] hover:bg-card-bg rounded-md ${done ? "opacity-80" : ""}`}
              >
              <span className="font-mono text-[10px] text-ink-soft whitespace-nowrap">
                {m.state === "inProgress" ? (
                  <span className="text-[color:var(--section-hue)] font-semibold">LIVE</span>
                ) : done ? (
                  `${weekday(m.start)} · FT`
                ) : dayOf(m.start) === dayOf(now) ? (
                  time(m.start)
                ) : (
                  `${weekday(m.start)} ${time(m.start)}`
                )}
              </span>
              <span className="flex items-center gap-1.5 min-w-0 font-sans">
                <Logo src={a.image} name={a.code} size={14} />
                <span className={`${mineA ? "font-semibold text-[color:var(--section-hue)]" : ""} ${done && a.outcome === "loss" ? "text-ink-soft" : ""}`}>{a.code}</span>
                <span className="text-ink-faint">v</span>
                <Logo src={b.image} name={b.code} size={14} />
                <span className={`${mineB ? "font-semibold text-[color:var(--section-hue)]" : ""} ${done && b.outcome === "loss" ? "text-ink-soft" : ""}`}>{b.code}</span>
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-right">
                {done || m.state === "inProgress" ? (
                  `${a.wins ?? 0}–${b.wins ?? 0}`
                ) : m.odds ? (
                  <span className="text-ink-soft" title="Polymarket's price to win">
                    {m.odds.a}–{m.odds.b}%
                  </span>
                ) : (
                  <span className="text-ink-faint">Bo{m.bestOf}</span>
                )}
              </span>
              </button>
            </li>
          );
        })}
      </ul>

      {field.length > 0 && event.odds && (
        <p className="font-mono text-[10px] text-ink-soft mt-auto pt-2 leading-relaxed">
          <a href={event.odds.url} target="_blank" rel="noopener noreferrer" className="hover:text-ink" title="Polymarket (needs VPN in India)">
            To win:
          </a>{" "}
          {field.map((f, i) => {
            const team = data.teams.find((t) => t.name.toLowerCase() === f.name.toLowerCase());
            const mine = team && follows.includes(team.code);
            return (
              <span key={f.name} className={mine ? "text-[color:var(--section-hue)] font-semibold" : ""}>
                {i > 0 && " · "}
                {team?.code ?? f.name} {Math.round(f.prob)}%
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}

// ---- the wire -----------------------------------------------------------------------------

function Wire({ data, teams, now }: { data: ValorantData; teams: ValTeam[]; now: number }) {
  const words = teams.flatMap((t) => [t.name, t.code]).filter((w) => w.length >= 2);
  const about = (text: string) => words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  const mine = data.news.filter((n) => about(`${n.title} ${n.summary}`));
  const rest = data.news.filter((n) => !mine.includes(n));
  const list = [...mine.slice(0, 2), ...rest].slice(0, 3);
  if (list.length === 0) return null;
  return (
    <ul className="divide-y hairline min-w-0">
      {list.map((n, i) => (
        <li key={n.url} className={`py-2 first:pt-0 ${i >= 2 ? "max-sm:hidden" : ""}`}>
          <a href={n.url} target="_blank" rel="noopener noreferrer" className="group block">
            <span className="block font-headline text-[15px] leading-snug group-hover:text-[color:var(--section-hue)] line-clamp-2">
              {mine.includes(n) && <span className="text-[color:var(--section-hue)]">● </span>}
              {n.title}
            </span>
            <span className="block font-mono text-[10px] text-ink-faint mt-0.5">VLR.gg · {ago(n.publishedAt, now)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// ---- the section ------------------------------------------------------------------------------

export default function ClutchSection({ initial, follows }: { initial: ValorantData | null; follows: string[] }) {
  const [data, setData] = useState<ValorantData | null>(initial);
  const [picking, setPicking] = useState(false);
  const [view, setView] = useState<ClutchView | null>(null);

  // Keep results and prices fresh while something is on; quietly otherwise.
  const liveNow = data?.matches.some((m) => m.state === "inProgress") ?? false;
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/valorant")
        .then((r) => (r.ok ? (r.json() as Promise<ValorantData>) : null))
        .then((d) => !cancelled && d && setData(d))
        .catch(() => {});
    };
    if (!initial) load();
    // While a match is being played, every 45 seconds, so the final score
    // lands soon after the last round; a returning tab catches up at once.
    const id = window.setInterval(load, liveNow ? 45_000 : data?.phase === "off" ? REFRESH_MS * 7 : REFRESH_MS);
    const back = () => !document.hidden && load();
    document.addEventListener("visibilitychange", back);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", back);
    };
  }, [initial, data?.phase, liveNow]);

  const now = useSyncExternalStore(subscribeMinute, minuteNow, () => (data ? Date.parse(data.fetchedAt) : 0));
  if (!data) return null;
  const teams = follows
    .map((code) => data.teams.find((t) => t.code === code) ?? null)
    .filter((t): t is ValTeam => t !== null);
  const event = data.featured;
  const picker = (
    <>
      {picking && <TeamPicker teams={data.teams} onClose={() => setPicking(false)} />}
      {view && <ClutchSheet key={JSON.stringify(view)} start={view} data={data} follows={follows} onClose={() => setView(null)} />}
    </>
  );

  const edit = (
    <button type="button" className="chip h-7 px-3 text-[11px]" onClick={() => setPicking(true)}>
      {teams.length ? "Edit teams" : "Pick teams"}
    </button>
  );

  // Off-season: one line of dates beside the headlines.
  if (data.phase === "off" || !event) {
    const lastFinal = data.lastEvent
      ? [...data.matches].reverse().find((m) => m.eventKey === data.lastEvent!.key && m.state === "completed")
      : undefined;
    const champion = lastFinal?.teams.find((t) => t.outcome === "win");
    return (
      <section id="clutch">
        <SectionHeader sectionKey="clutch" folio="Off-season" />
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 items-start">
          <div className="module">
            <div className="flex items-center justify-between gap-3">
              <span className="font-label text-[10px] text-ink-soft">Between events</span>
              {edit}
            </div>
            <p className="font-sans text-[14px] mt-3 leading-snug">
              {data.lastEvent ? (
                <>
                  {data.lastEvent.name} ended {date(data.lastEvent.end)}
                  {champion ? `, won by ${champion.name}` : ""}.{" "}
                </>
              ) : null}
              {data.nextEvent
                ? `Next: ${data.nextEvent.name}, from ${when(data.nextEvent.start)}.`
                : "The next VCT season's dates aren't out yet (Kickoff usually starts in January)."}
            </p>
            {teams.length > 0 && (
              <ul className="mt-3 divide-y hairline">
                {teams.map((t) => (
                  <TeamCard key={t.code} team={t} data={data} open={setView} />
                ))}
              </ul>
            )}
          </div>
          <Wire data={data} teams={teams} now={now} />
        </div>
        {picker}
      </section>
    );
  }

  return (
    <section id="clutch">
      <SectionHeader
        sectionKey="clutch"
        folio={
          data.matches.some((m) => m.state === "inProgress") ? (
            <>
              <span className="live-dot" style={{ color: "var(--section-hue)" }} /> live
            </>
          ) : (
            `${event.name} · ${event.stage} · times IST`
          )
        }
      />
      {/* Three cards of one height: the tallest sets the row. */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.95fr)] items-stretch">
        <div className="module h-full" data-reveal>
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="font-label text-[10px] text-ink-soft">Your teams</span>
            {edit}
          </div>
          {teams.length > 0 ? (
            <ul className="divide-y hairline">
              {teams.map((t) => (
                <TeamCard key={t.code} team={t} data={data} open={setView} />
              ))}
            </ul>
          ) : (
            <button type="button" onClick={() => setPicking(true)} className="w-full rounded-xl border border-dashed hairline p-3 text-left text-[13px] text-ink-soft">
              + Follow a team: its next match, result and odds live here
            </button>
          )}
        </div>
        <div className="module h-full" data-reveal>
          <EventPanel event={event} data={data} follows={follows} now={now} open={setView} />
        </div>
        <div className="module h-full md:col-span-2 lg:col-span-1" data-reveal>
          <div className="font-label text-[10px] text-ink-soft mb-3">From the scene</div>
          <Wire data={data} teams={teams} now={now} />
        </div>
      </div>
      {picker}
    </section>
  );
}
