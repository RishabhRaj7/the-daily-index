"use client";

import { useState } from "react";
import type { OddsMarket } from "@/lib/types";
import type { OddsPick } from "@/lib/odds-pick";
import { compactMoney, SUBJECT_LABEL } from "@/lib/odds-pick";
import SectionHeader from "@/components/story/SectionHeader";
import OddsSheet from "@/components/widgets/OddsSheet";

// Straw Poll: what the crowd with money on it thinks, for this reader.
// One lead card (the question that matters most to you today, every
// contender as a bar) beside up to four rows. Each says why it's here.
// Everything opens in a sheet on this page, since the exchanges' own sites
// need a VPN in India.

function Move({ v, className = "" }: { v: number | null; className?: string }) {
  if (v == null || Math.abs(v) < 1) return null;
  return (
    <span className={`font-mono text-[11px] font-semibold ${v > 0 ? "text-up" : "text-down"} ${className}`}>
      {v > 0 ? "▲" : "▼"} {Math.abs(Math.round(v))} pts
    </span>
  );
}

/** "Kimi Antonelli 91%" or, for a yes/no question, "Yes 62%". */
function Favourite({ m, size = "lg" }: { m: OddsMarket; size?: "lg" | "sm" }) {
  const name = m.lead.name === "Yes" ? "Yes" : m.lead.name;
  return (
    <span className="text-right shrink-0">
      <span className={`block font-display font-bold leading-none tabular-nums ${size === "lg" ? "text-[3rem]" : "text-[1.6rem]"}`}>
        {Math.round(m.lead.prob)}%
      </span>
      <span className={`block font-sans ${size === "lg" ? "text-[13px] mt-1" : "text-[11px] mt-0.5"} text-ink-soft truncate max-w-[11rem]`}>{name}</span>
    </span>
  );
}

function Footer({ m }: { m: OddsMarket }) {
  return (
    <span className="font-mono text-[10px] text-ink-faint">
      {m.source} · ${compactMoney(m.vol24)} today
      {m.also?.length ? ` · ${m.also.map((a) => `${a.source} ${Math.round(a.prob)}%`).join(" · ")}` : ""}
    </span>
  );
}

function Lead({ p, onOpen }: { p: OddsPick; onOpen: () => void }) {
  const m = p.market;
  const rows = m.binary ? [] : m.outcomes.slice(0, 4);
  const max = Math.max(...rows.map((o) => o.prob), 1);
  return (
    <button type="button" onClick={onOpen} className="module text-left w-full h-full flex flex-col gap-4 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color:var(--section-hue)]" data-reveal>
      <span className="font-label text-[9px]" style={{ color: "var(--section-hue)" }}>
        {SUBJECT_LABEL[m.subject]} · {p.why}
      </span>
      <span className="flex items-start justify-between gap-4">
        <span className="font-headline text-[1.45rem] leading-tight">{m.title}</span>
        <Favourite m={m} />
      </span>
      <Move v={m.lead.move} className="-mt-2" />
      {rows.length > 1 && (
        <span className="grid gap-2">
          {rows.map((o, i) => (
            <span key={o.name} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_2.8rem] items-center gap-2 text-[12px]">
              <span className={`truncate ${i === 0 ? "font-semibold" : "text-ink-soft"}`}>{o.name}</span>
              <span className="h-1.5 rounded-full bg-[color:var(--rule)] overflow-hidden">
                <span
                  className="block h-full rounded-full bar-grow"
                  style={{ width: `${(o.prob / max) * 100}%`, background: i === 0 ? "var(--section-hue)" : "var(--ink-faint)", ["--bar-i" as string]: i }}
                />
              </span>
              <span className="font-mono text-right tabular-nums">{Math.round(o.prob)}%</span>
            </span>
          ))}
        </span>
      )}
      <span className="mt-auto">
        <Footer m={m} />
      </span>
    </button>
  );
}

function Row({ p, onOpen }: { p: OddsPick; onOpen: () => void }) {
  const m = p.market;
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full text-left py-3 grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-center group">
        <span className="min-w-0">
          <span className="block font-label text-[8.5px] text-ink-soft">
            {SUBJECT_LABEL[m.subject]} · <span style={{ color: "var(--section-hue)" }}>{p.why}</span>
          </span>
          <span className="block font-sans font-semibold text-[14px] leading-snug mt-1 line-clamp-2 group-hover:text-[color:var(--section-hue)]">{m.title}</span>
          <span className="flex items-center gap-2 mt-1.5">
            <span className="h-1 w-24 rounded-full bg-[color:var(--rule)] overflow-hidden shrink-0">
              <span className="block h-full rounded-full" style={{ width: `${m.lead.prob}%`, background: "var(--section-hue)" }} />
            </span>
            <Move v={m.lead.move} />
          </span>
        </span>
        <Favourite m={m} size="sm" />
      </button>
    </li>
  );
}

export default function StrawPollSection({ poll, readAt }: { poll: OddsPick[]; readAt: string | null }) {
  const [open, setOpen] = useState<OddsPick | null>(null);
  if (poll.length === 0) return null;
  const [lead, ...rest] = poll;
  const read = readAt
    ? new Date(readAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : null;

  return (
    <section id="straw-poll">
      <SectionHeader sectionKey="straw-poll" folio={read ? `Read ${read} IST` : undefined} />
      <div className={`grid gap-6 ${rest.length ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : ""} items-stretch`}>
        <Lead p={lead} onOpen={() => setOpen(lead)} />
        {rest.length > 0 && (
          <ul className="divide-y hairline border-y hairline self-start" data-reveal>
            {rest.map((p) => (
              <Row key={p.market.id} p={p} onOpen={() => setOpen(p)} />
            ))}
          </ul>
        )}
      </div>
      <p className="font-mono text-[10px] text-ink-faint mt-4">
        From Polymarket and Kalshi: what traders with money on it expect, as a chance. Chosen for you: things you follow, today&rsquo;s news, real moves. The paper reads prices; it takes no bets.
      </p>
      {open && <OddsSheet market={open.market} why={open.why} onClose={() => setOpen(null)} />}
    </section>
  );
}
