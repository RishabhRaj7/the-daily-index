"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrendCountry, TrendItem } from "@/lib/live/trends";
import LiveBadge from "./LiveBadge";

// The Search Bar: what each country is typing into Google right now
// (Google Trends' live feed), a tab per country. Each search shows roughly
// how many searched, how long it's been climbing, and the story behind it;
// one that's also in today's paper says so. "Across borders" picks out the
// searches trending in more than one country at once. Refreshed every ten
// minutes while the page is open.

const REFRESH_MS = 10 * 60_000;
const SHORT: Record<string, string> = { IN: "India", US: "US", GB: "UK", JP: "Japan", BR: "Brazil", DE: "Germany" };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function since(iso: string | null, now: number): string {
  if (!iso) return "";
  const h = (now - Date.parse(iso)) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

function Row({ t, i, max, inPaper, now }: { t: TrendItem; i: number; max: number; inPaper: boolean; now: number }) {
  const story = t.news[0];
  const width = max > 0 ? Math.max(6, (Math.log10(t.volume + 1) / Math.log10(max + 1)) * 100) : 6;
  return (
    <li className="py-2.5 grid grid-cols-[1.8rem_minmax(0,1fr)] gap-x-2">
      <span className="font-display font-extrabold text-[1.35rem] leading-none tabular-nums text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
      <span className="min-w-0">
        <span className="flex items-baseline justify-between gap-3">
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(t.term)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-headline text-[1.05rem] leading-snug truncate hover:underline decoration-dotted underline-offset-2"
          >
            {t.term}
          </a>
          <span className="font-mono text-[10px] text-ink-soft shrink-0 tabular-nums" title="Roughly how many searched">
            {t.volume >= 1e6 ? `${+(t.volume / 1e6).toFixed(1)}M+` : t.volume >= 1e3 ? `${Math.round(t.volume / 1e3)}K+` : t.traffic}
            {t.started ? ` · ${since(t.started, now)}` : ""}
          </span>
        </span>
        <span className="block h-1 mt-1 rounded-full bg-[color:var(--rule)] overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: `${width}%`, background: "var(--section-hue)", opacity: 0.75 }} />
        </span>
        {story && (
          <a href={story.url} target="_blank" rel="noopener noreferrer" className="block font-sans text-[12px] text-ink-soft mt-1 truncate hover:text-ink">
            {inPaper && (
              <span className="font-label text-[8px] mr-1.5 align-[1px]" style={{ color: "var(--section-hue)" }}>
                In today&rsquo;s paper
              </span>
            )}
            {story.title} <span className="font-mono text-[10px] text-ink-faint">· {story.source}</span>
          </a>
        )}
      </span>
    </li>
  );
}

export default function SearchBar({ headlines = [], home = "IN" }: { headlines?: string[]; home?: string }) {
  const [countries, setCountries] = useState<TrendCountry[] | null>(null);
  const [geo, setGeo] = useState(home);
  const [at, setAt] = useState<number>(0);
  useEffect(() => {
    let live = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/trends")
        .then((r) => (r.ok ? (r.json() as Promise<{ countries: TrendCountry[]; at: string }>) : null))
        .then((d) => {
          if (!live || !d) return;
          setCountries(d.countries);
          setAt(Date.parse(d.at));
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const paper = useMemo(() => headlines.map(norm).join(" | "), [headlines]);
  // A search trending in two or more countries at once.
  const across = useMemo(() => {
    const seen = new Map<string, { term: string; geos: string[]; volume: number }>();
    for (const c of countries ?? []) {
      for (const t of c.items) {
        const k = norm(t.term);
        if (k.length < 3) continue;
        const had = seen.get(k) ?? { term: t.term, geos: [], volume: 0 };
        if (!had.geos.includes(c.geo)) had.geos.push(c.geo);
        had.volume += t.volume;
        seen.set(k, had);
      }
    }
    return [...seen.values()].filter((x) => x.geos.length >= 2).sort((a, b) => b.geos.length - a.geos.length || b.volume - a.volume).slice(0, 6);
  }, [countries]);

  if (!countries || countries.length === 0) return null;
  const country = countries.find((c) => c.geo === geo) ?? countries[0];
  const items = country.items.slice(0, 10);
  const max = Math.max(...items.map((t) => t.volume), 1);
  const inPaper = (t: TrendItem) => {
    const k = norm(t.term);
    return k.length >= 4 && paper.includes(k);
  };

  return (
    <div className="mb-12" data-reveal>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-3 border-b hairline">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="font-display font-extrabold text-[1.9rem] leading-none">The Search Bar</h3>
            <LiveBadge />
          </div>
          <p className="font-body italic text-xs text-ink-soft mt-0.5">
            What each country is typing into Google right now
            {at ? ` · ${new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Country">
          {countries.map((c) => (
            <button
              key={c.geo}
              type="button"
              role="tab"
              aria-selected={c.geo === country.geo}
              onClick={() => setGeo(c.geo)}
              className="chip h-7 px-3 text-[11.5px]"
              style={c.geo === country.geo ? { background: "var(--section-hue)", borderColor: "var(--section-hue)", color: "var(--paper)" } : undefined}
            >
              {SHORT[c.geo] ?? c.name}
            </button>
          ))}
        </div>
      </div>
      <div className={`grid gap-x-10 ${across.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16rem]" : "md:grid-cols-2"}`}>
        <ol className="divide-y hairline">
          {items.slice(0, 5).map((t, i) => (
            <Row key={t.term} t={t} i={i} max={max} inPaper={inPaper(t)} now={at} />
          ))}
        </ol>
        <ol className="divide-y hairline md:border-t-0 border-t hairline">
          {items.slice(5, 10).map((t, i) => (
            <Row key={t.term} t={t} i={i + 5} max={max} inPaper={inPaper(t)} now={at} />
          ))}
        </ol>
        {across.length > 0 && (
          <aside className="mt-4 lg:mt-2.5">
            <div className="font-label text-[9px] text-ink-soft mb-2">Across borders</div>
            <ul className="space-y-2">
              {across.map((x) => (
                <li key={x.term} className="flex items-baseline justify-between gap-2">
                  <button type="button" onClick={() => setGeo(x.geos[0])} className="font-sans font-semibold text-[13px] truncate text-left hover:underline decoration-dotted underline-offset-2">
                    {x.term}
                  </button>
                  <span className="font-mono text-[10px] text-ink-soft shrink-0">{x.geos.map((g) => SHORT[g] ?? g).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
