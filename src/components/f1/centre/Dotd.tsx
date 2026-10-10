"use client";

import type { LiveSnapshot } from "@/lib/f1-live-types";
import { Empty } from "./ui";

// Driver of the Day, the case so far (built on the server: lib/f1-dotd.ts).
// F1 keeps the fans' vote to itself until it names the winner after the flag,
// so this says plainly that it is our read, and why each driver is on it.

export default function Dotd({ snap }: { snap: LiveSnapshot }) {
  const d = snap.dotd;
  if (!d) return <Empty>{snap.lap && snap.lap.current < 5 ? "Too early to call — back after lap 5." : "No one is making a case yet."}</Empty>;
  const top = d.contenders[0]?.score || 1;
  const names = new Map(snap.rows.map((r) => [r.code, r.name]));
  const photos = snap.photos ?? {};
  return (
    <div>
      <ol className="space-y-2.5">
        {d.contenders.map((c, i) => (
          <li key={c.code} className="grid grid-cols-[1.9rem_minmax(0,1fr)] gap-2.5 items-center">
            <span className="relative w-[1.9rem] h-[1.9rem] rounded-full overflow-hidden" style={{ background: `color-mix(in srgb, ${c.colour} 30%, var(--paper))` }}>
              {photos[c.code] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[c.code]} alt="" className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
              )}
            </span>
            <span className="min-w-0">
              <span className="flex items-baseline gap-2">
                <b className="font-sans text-[13px] truncate">{names.get(c.code) || c.code}</b>
                <span className="font-mono text-[10px] text-ink-soft shrink-0">P{c.position}</span>
                {i === 0 && <span className="ml-auto font-label text-[8px] shrink-0" style={{ color: "var(--hue-f1)" }}>Front-runner</span>}
              </span>
              <span className="block h-[5px] rounded-full mt-1 overflow-hidden bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]">
                <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(6, (c.score / top) * 100)}%`, background: c.colour }} />
              </span>
              <span className="block font-mono text-[10px] text-ink-soft mt-1 leading-snug">{c.reasons.join(" · ")}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 pt-3 border-t hairline font-mono text-[9.5px] text-ink-faint leading-relaxed">
        Our read as of lap {d.lap}, not F1&rsquo;s count: the fans&rsquo; vote stays private until F1 names the winner after the flag. Places made up, recoveries, points in a slower car and leading weigh most.
      </p>
    </div>
  );
}
