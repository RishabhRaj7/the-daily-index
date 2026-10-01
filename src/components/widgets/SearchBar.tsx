"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrendCountry, TrendItem } from "@/lib/live/trends";
import LiveBadge from "./LiveBadge";

// The Search Bar: what India, the US and the world are typing into Google
// right now (Google Trends' live feed), a tab per country, the top five
// with a way to see twenty. Each search shows roughly
// how many searched, how long it's been climbing, and the story behind it;
// one that's also in today's paper says so. "World" is the paper's own:
// the searches trending in the most countries at once (lib/live/trends.ts). Refreshed every ten
// minutes while the page is open.

const REFRESH_MS = 10 * 60_000;
const SHORT: Record<string, string> = { IN: "India", US: "US", WORLD: "World" };
const COUNTRY: Record<string, string> = { US: "US", GB: "UK", IN: "India", CA: "Canada", AU: "Australia", IE: "Ireland", DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", BR: "Brazil", MX: "Mexico", JP: "Japan", SG: "Singapore", PH: "Philippines", ZA: "South Africa" };
const FEW = 5;
const MANY = 20;

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
            {t.traffic}
            {t.started ? ` · ${since(t.started, now)}` : ""}
          </span>
        </span>
        <span className="block h-1 mt-1 rounded-full bg-[color:var(--rule)] overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: `${width}%`, background: "var(--section-hue)", opacity: 0.75 }} />
        </span>
        {t.countries && (
          <span className="block font-mono text-[10px] mt-1 truncate" style={{ color: "var(--section-hue)" }}>
            Trending in {t.countries.length} countries: {t.countries.map((g) => COUNTRY[g] ?? g).join(" · ")}
          </span>
        )}
        {!story && t.related.length > 0 && (
          <span className="block font-mono text-[10.5px] text-ink-soft mt-1 truncate">also searched: {t.related.join(" · ")}</span>
        )}
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
  const [all, setAll] = useState(false);
  const [at, setAt] = useState<number>(0);
  useEffect(() => {
    let live = true;
    let retry: number | undefined;
    const load = (again = 2) => {
      if (document.hidden) return;
      fetch("/api/trends")
        .then((r) => (r.ok ? (r.json() as Promise<{ countries: TrendCountry[]; at: string }>) : null))
        .then((d) => {
          if (!live) return;
          if (!d?.countries.length) throw new Error("empty");
          setCountries(d.countries);
          setAt(Date.parse(d.at));
        })
        // A failed read tries again shortly (twice) rather than waiting ten minutes.
        .catch(() => {
          if (live && again > 0) retry = window.setTimeout(() => load(again - 1), 15_000);
        });
    };
    load();
    const id = window.setInterval(() => load(), REFRESH_MS);
    return () => {
      live = false;
      window.clearTimeout(retry);
      window.clearInterval(id);
    };
  }, []);

  const paper = useMemo(() => headlines.map(norm).join(" | "), [headlines]);
  if (!countries || countries.length === 0) return null;
  const country = countries.find((c) => c.geo === geo) ?? countries[0];
  const items = country.items.slice(0, all ? MANY : FEW);
  const half = Math.ceil(items.length / 2);
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
            What India, the US and the world are typing into Google right now
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
      <div>
        <div>
          {/* Five in one column; twenty in two. */}
          <div className={`grid gap-x-10 ${all ? "md:grid-cols-2" : ""}`}>
            <ol className="divide-y hairline">
              {(all ? items.slice(0, half) : items).map((t, i) => (
                <Row key={t.term} t={t} i={i} max={max} inPaper={inPaper(t)} now={at} />
              ))}
            </ol>
            {all && (
              <ol className="divide-y hairline md:border-t-0 border-t hairline">
                {items.slice(half).map((t, i) => (
                  <Row key={t.term} t={t} i={i + half} max={max} inPaper={inPaper(t)} now={at} />
                ))}
              </ol>
            )}
          </div>
          {country.items.length > FEW && (
            <button type="button" onClick={() => setAll((v) => !v)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-2">
              {all ? "Show the top five ↑" : `Show the top ${Math.min(MANY, country.items.length)} ↓`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
