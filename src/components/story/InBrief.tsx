import type { BriefItem } from "@/lib/preferences/types";

// In Brief: the big stories this section didn't have room for, a line each
// under the section's own stories. Each is leading the country's news
// (Google's top page, or three or more outlets), which is why it's here.
export default function InBrief({ items }: { items: BriefItem[] }) {
  if (items.length === 0) return null;
  return (
    <aside className="mt-10" aria-label="In brief" data-reveal>
      <div className="flex items-center gap-3 mb-1">
        <span className="font-label text-[10px]" style={{ color: "var(--section-hue)" }}>
          In Brief
        </span>
        <span className="h-px flex-1 bg-[color:var(--rule)]" />
      </div>
      <ul className="grid md:grid-cols-2 gap-x-8">
        {items.map((b) => (
          <li key={b.url} className="py-3 border-b hairline">
            <a href={b.url} target="_blank" rel="noopener noreferrer" className="group block">
              <span className="block font-headline text-[16px] leading-snug group-hover:text-[color:var(--section-hue)]">{b.title}</span>
              {b.gist && <span className="block font-body text-[13.5px] text-ink-soft leading-snug mt-1">{b.gist}</span>}
              <span className="block font-mono text-[10px] text-ink-faint mt-1.5">
                {b.source}
                {b.outlets > 1 ? ` · carried by ${b.outlets} outlets` : ""}
                {b.lead ? ` · no. ${b.lead} in India's news` : ""}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
