"use client";

import { useEffect, useState } from "react";
import type { OddsRecordSummary } from "@/lib/types";
import type { OddsLayout, OddsPick } from "@/lib/odds-pick";
import { compactMoney, ladderLine, SUBJECT_LABEL } from "@/lib/odds-pick";
import SectionHeader from "@/components/story/SectionHeader";
import Sheet from "@/components/extras/Sheet";
import OddsSheet from "@/components/widgets/OddsSheet";
import OddsChart, { pinsFor, type ChartSeries } from "@/components/odds/OddsChart";
import { FieldBar, HitLadder, Move } from "@/components/odds/OddsCard";
import Spark from "@/components/odds/Spark";
import { useSpark } from "@/components/odds/odds-context";
import { loadPersonalization, savePersonalization } from "@/lib/personalization";

// Straw Poll: the day's action on the prediction markets, for this reader.
// (The standing questions live at the foot of their own sections.)
//   the lead      the biggest move among what the reader cares about: its
//                 week as a chart, every contender a line, with the news
//                 pinned where it lines up with the jump and one line on why
//   the movers    the next biggest moves, each with its week as a sparkline
//   the busiest   where the money is today
//   the record    how often a week-out favourite won this past month,
//                 by how sure it was; tap for every verdict
//   the watchlist the questions the reader keeps an eye on, editable
// Everything opens in a sheet on this page: the exchanges need a VPN in India.

interface WhyItem {
  title: string;
  source: string;
  url: string;
  at: string;
}

function Lead({ p, onOpen }: { p: OddsPick; onOpen: () => void }) {
  const m = p.market;
  const [series, setSeries] = useState<ChartSeries[] | null>(null);
  const [news, setNews] = useState<{ items: WhyItem[]; why: string | null } | null>(null);
  const lines = m.outcomes.filter((o) => (m.source === "Polymarket" ? o.token : o.ticker)).slice(0, m.binary || m.hit ? 1 : 3);
  const refs = lines.map((o) => `${o.name}~${m.source === "Polymarket" ? o.token : o.ticker}`).join("|");
  useEffect(() => {
    const controller = new AbortController();
    const q = new URLSearchParams({ id: m.id, range: "1w", o: refs, ...(m.series ? { series: m.series } : {}) });
    fetch(`/api/odds/history?${q}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ series: ChartSeries[] }>) : { series: [] }))
      .then((d) => setSeries(d.series))
      .catch(() => setSeries([]));
    const w = new URLSearchParams({ id: m.id, q: m.title, lead: m.hit ? "" : m.lead.name, move: String(p.move || m.lead.week || 0), days: p.move ? "2" : "7" });
    fetch(`/api/odds/why?${w}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: WhyItem[]; why: string | null }>) : null))
      .then(setNews)
      .catch(() => {});
    return () => controller.abort();
  }, [m.id, m.series, m.title, refs, p.move, m.lead.week]);
  const pins = series && news ? pinsFor(series[0], news.items) : [];
  const top = news?.items.find((n) => pins.some((x) => x.title === n.title)) ?? news?.items[0];

  return (
    <div className="module h-full flex flex-col gap-3" data-reveal>
      <button type="button" onClick={onOpen} className="text-left group">
        <span className="flex items-center justify-between gap-3 font-label text-[9px]">
          <span style={{ color: "var(--section-hue)" }}>
            {SUBJECT_LABEL[m.subject]} · {p.watched ? "★ " : ""}
            {p.why}
          </span>
          <span className="text-ink-faint">Tap for the whole market ›</span>
        </span>
        <span className="flex items-start justify-between gap-4 mt-2">
          <span className="font-headline text-[1.5rem] sm:text-[1.7rem] leading-[1.12] group-hover:underline decoration-dotted underline-offset-4">{m.title}</span>
          {!m.hit && (
            <span className="text-right shrink-0">
              <span className="block font-display font-extrabold text-[3.2rem] leading-[0.85] tabular-nums">{Math.round(m.lead.prob)}%</span>
              <span className="block font-sans text-[13px] font-semibold mt-1 truncate max-w-[10rem]">{m.lead.name === "Yes" ? "Yes" : m.lead.name}</span>
              <Move v={m.lead.move} />
            </span>
          )}
        </span>
      </button>
      {m.hit ? (
        <>
          <p className="font-mono text-[11px] text-ink-soft">{ladderLine(m)}</p>
          <HitLadder m={m} rows={6} size="lg" />
        </>
      ) : series === null ? (
        <div className="h-[190px] rounded-xl bg-card-bg animate-pulse" />
      ) : series.length > 0 ? (
        <OddsChart series={series} pins={pins} height={190} />
      ) : (
        <FieldBar m={m} height={8} />
      )}
      {(news?.why || top) && (
        <div className="mt-auto border-t hairline pt-3">
          <div className="font-label text-[8.5px] text-ink-soft mb-1">{news?.why ? "Why it moved" : "In the news"}</div>
          {news?.why && <p className="font-headline text-[1.05rem] leading-snug">{news.why}</p>}
          {top && (
            <a href={top.url} target="_blank" rel="noopener noreferrer" className="block mt-1 font-sans text-[12.5px] text-ink-soft hover:text-ink leading-snug">
              {pins.find((x) => x.title === top.title) && (
                <span className="inline-grid place-items-center w-4 h-4 mr-1 rounded-full border border-[color:var(--ink)] font-mono text-[9px] font-bold align-[1px]">
                  {pins.find((x) => x.title === top.title)!.n}
                </span>
              )}
              {top.title} <span className="font-mono text-[10px] text-ink-faint">· {top.source} ↗</span>
            </a>
          )}
        </div>
      )}
      <span className="font-mono text-[10px] text-ink-faint">
        {m.source} · ${compactMoney(m.vol24)} today · ${compactMoney(m.vol)} in all
        {m.also?.length ? ` · ${m.also.map((a) => `${a.source} ${Math.round(a.prob)}%`).join(" · ")}` : ""}
      </span>
    </div>
  );
}

function MoverRow({ p, onOpen }: { p: OddsPick; onOpen: () => void }) {
  const m = p.market;
  const spark = useSpark(m.id);
  const color = p.move >= 0 ? "var(--up)" : "var(--down)";
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full text-left py-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center group">
        <span className="min-w-0">
          <span className="block font-label text-[8.5px] text-ink-soft">
            {SUBJECT_LABEL[m.subject]}
            {p.watched ? " · ★" : ""}
          </span>
          <span className="block font-sans font-semibold text-[13.5px] leading-snug mt-0.5 line-clamp-2 group-hover:text-[color:var(--section-hue)]">{m.title}</span>
          <span className="block font-mono text-[10px] text-ink-soft mt-0.5 truncate">{m.hit ? ladderLine(m) : m.lead.name === "Yes" ? "Yes" : m.lead.name}</span>
        </span>
        <Spark points={spark} width={70} height={30} color={color} />
        <span className="text-right w-[3.6rem]">
          <span className="block font-display font-bold text-[1.45rem] leading-none tabular-nums">{m.hit ? "—" : `${Math.round(m.lead.prob)}%`}</span>
          <Move v={p.move} />
        </span>
      </button>
    </li>
  );
}

function RecordSheet({ record, onClose }: { record: OddsRecordSummary; onClose: () => void }) {
  return (
    <Sheet title="How often the favourite wins" kicker="Straw Poll · track record" onClose={onClose} width={720} hue="var(--hue-poll)">
      <p className="font-headline text-[1.2rem] leading-snug">
        A week before each question settled, the market&rsquo;s favourite went on to win {record.called} of {record.total} times this past month (
        {Math.round((record.called / record.total) * 100)}%).
      </p>
      <div className="grid grid-cols-3 gap-3 mt-5">
        {record.buckets.map((b) => (
          <div key={b.label} className="rounded-xl border hairline p-3">
            <div className="font-label text-[9px] text-ink-soft">Favourite at {b.label}</div>
            <div className="font-display font-bold text-[1.6rem] leading-none mt-1 tabular-nums">{b.total ? `${Math.round((b.called / b.total) * 100)}%` : "—"}</div>
            <div className="font-mono text-[10px] text-ink-faint mt-1">
              won {b.called} of {b.total}
            </div>
          </div>
        ))}
      </div>
      <p className="font-mono text-[10px] text-ink-faint mt-2">A well-judged market&rsquo;s 90% favourites win about nine times in ten, its 60% ones about six.</p>
      <ul className="mt-5 divide-y hairline">
        {record.recent.map((v) => (
          <li key={`${v.title}-${v.settled}`} className="py-2 grid grid-cols-[1.2rem_minmax(0,1fr)_auto] gap-2 items-baseline text-[13px]">
            <span className={v.called ? "text-up font-bold" : "text-down font-bold"}>{v.called ? "✓" : "✗"}</span>
            <span className="min-w-0">
              <span className="block leading-snug">{v.title}</span>
              <span className="block font-mono text-[10px] text-ink-soft">
                Favourite {v.favourite} ({Math.round(v.chance)}%) · {v.called ? "won" : `${v.winner} won`}
              </span>
            </span>
            <span className="font-mono text-[10px] text-ink-faint">
              {new Date(`${v.settled}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function WatchSheet({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState(loadPersonalization);
  const [draft, setDraft] = useState("");
  const save = (next: typeof p) => {
    setP(next);
    savePersonalization(next);
  };
  const watch = p.oddsWatch ?? [];
  const pins = p.oddsPins ?? [];
  return (
    <Sheet title="Your watchlist" kicker="Straw Poll" onClose={onClose} width={640} hue="var(--hue-poll)">
      <p className="font-sans text-[13px] text-ink-soft -mt-2">
        Questions you keep an eye on. Each is a search, so &ldquo;Fed decision&rdquo; finds next month&rsquo;s once this one settles. They lead their section&rsquo;s odds.
      </p>
      <form
        className="flex gap-2 mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const q = draft.trim();
          if (q.length >= 3 && !watch.includes(q)) save({ ...p, oddsWatch: [...watch, q].slice(-12) });
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Will OpenAI IPO before 2027"
          className="flex-1 min-w-0 border hairline rounded-lg px-3 py-2 bg-transparent text-sm outline-none focus:border-[color:var(--hue-poll)]"
          maxLength={80}
        />
        <button type="submit" className="chip chip-signal">
          Add
        </button>
      </form>
      <ul className="mt-4 divide-y hairline">
        {watch.map((q) => (
          <li key={q} className="py-2 flex items-center justify-between gap-3 text-[14px]">
            <span>{q}</span>
            <button type="button" className="font-mono text-[11px] text-ink-faint hover:text-down" onClick={() => save({ ...p, oddsWatch: watch.filter((x) => x !== q) })} aria-label={`Remove ${q}`}>
              remove
            </button>
          </li>
        ))}
        {pins.map((x) => (
          <li key={x.id} className="py-2 flex items-center justify-between gap-3 text-[14px]">
            <span>★ {x.title}</span>
            <button type="button" className="font-mono text-[11px] text-ink-faint hover:text-down" onClick={() => save({ ...p, oddsPins: pins.filter((y) => y.id !== x.id) })}>
              unstar
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export default function StrawPollSection({
  poll,
  readAt,
  record = null,
}: {
  poll: OddsLayout["poll"];
  readAt: string | null;
  record?: OddsRecordSummary | null;
}) {
  const [open, setOpen] = useState<OddsPick | null>(null);
  const [sheet, setSheet] = useState<"record" | "watch" | null>(null);
  if (!poll.lead) return null;
  const read = readAt ? new Date(readAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;
  const rate = record ? record.called / record.total : 0;

  return (
    <section id="straw-poll">
      <SectionHeader sectionKey="straw-poll" folio={read ? `Read ${read} IST` : undefined} />
      <div className={`grid gap-6 ${poll.movers.length ? "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" : ""} items-stretch`}>
        <Lead p={poll.lead} onOpen={() => setOpen(poll.lead)} />
        {poll.movers.length > 0 && (
          <div data-reveal>
            <div className="font-label text-[9.5px] text-ink-soft">Biggest moves today</div>
            <ul className="divide-y hairline border-b hairline mt-1">
              {poll.movers.map((p) => (
                <MoverRow key={p.market.id} p={p} onOpen={() => setOpen(p)} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {poll.busiest.length > 0 && (
        <div className="mt-6" data-reveal>
          <div className="font-label text-[9.5px] text-ink-soft mb-2">Where the money is today</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {poll.busiest.map((p) => (
              <button
                key={p.market.id}
                type="button"
                onClick={() => setOpen(p)}
                className="text-left rounded-xl border hairline px-3 py-2.5 hover:border-[color:var(--section-hue)] transition-colors"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display font-bold text-[1.2rem] leading-none tabular-nums">{p.market.hit ? "↕" : `${Math.round(p.market.lead.prob)}%`}</span>
                  <span className="font-mono text-[10px] text-ink-faint">${compactMoney(p.market.vol24)} today</span>
                </span>
                <span className="block font-sans text-[12.5px] leading-snug mt-1 line-clamp-2">{p.market.title}</span>
                <span className="block font-mono text-[10px] text-ink-soft mt-0.5 truncate">{p.market.lead.name === "Yes" ? "Yes" : p.market.lead.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-center border-t hairline pt-4">
        {record ? (
          <button type="button" onClick={() => setSheet("record")} className="text-left group flex items-center gap-4 min-w-0">
            <span className="relative w-12 h-12 shrink-0" aria-hidden="true">
              <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--rule)" strokeWidth="4" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--section-hue)" strokeWidth="4" strokeDasharray={`${rate * 94.2} 94.2`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 grid place-items-center font-mono text-[10px] font-bold">{Math.round(rate * 100)}%</span>
            </span>
            <span className="min-w-0">
              <span className="block font-label text-[9px] text-ink-soft">Track record</span>
              <span className="block font-sans text-[13px] leading-snug group-hover:underline decoration-dotted underline-offset-2">
                A week out, the favourite won {record.called} of {record.total} questions settled this past month.
              </span>
              <span className="block font-mono text-[10px] text-ink-faint">
                {record.buckets
                  .filter((b) => b.total > 0)
                  .map((b) => `${b.label}: ${b.called}/${b.total}`)
                  .join(" · ")}{" "}
                · every verdict ›
              </span>
            </span>
          </button>
        ) : (
          <p className="font-mono text-[10px] text-ink-faint">The track record appears once ten questions have settled.</p>
        )}
        <button type="button" onClick={() => setSheet("watch")} className="chip h-8 text-[12px] justify-self-start sm:justify-self-end">
          ★ Your watchlist
        </button>
      </div>
      <p className="font-mono text-[10px] text-ink-faint mt-3">
        From Polymarket and Kalshi: what traders with money on it expect, as a chance. Each section&rsquo;s own questions sit at its foot. The paper reads prices;
        it takes no bets.
      </p>
      {open && <OddsSheet market={open.market} why={open.why} watched={open.watched} onClose={() => setOpen(null)} />}
      {sheet === "record" && record && <RecordSheet record={record} onClose={() => setSheet(null)} />}
      {sheet === "watch" && <WatchSheet onClose={() => setSheet(null)} />}
    </section>
  );
}
