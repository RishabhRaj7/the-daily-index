"use client";

import { LightningIcon } from "@phosphor-icons/react";
import type { BriefItem } from "@/lib/preferences/types";

// In Brief: the big stories this section didn't have room for, a headline each
// under the section's own stories (beside them, on the widest screens). Each is leading the country's news
// (Google's top page, or three or more outlets), which is why it's here. The
// headline prints alone and whole (the writer completes one a feed cut off).
export default function InBrief({ items }: { items: BriefItem[] }) {
  if (items.length === 0) return null;
  return (
    <aside className="mt-4" aria-label="In brief" data-reveal>
      <div className="flex items-center gap-3 mb-0.5">
        <span className="font-label text-[11px] inline-flex items-center gap-1" style={{ color: "var(--section-hue)" }}>
          <LightningIcon size={13} weight="fill" aria-hidden="true" />
          In Brief
        </span>
        <span className="h-px flex-1 bg-[color:var(--rule)]" />
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
        {items.map((b) => (
          <li key={b.url} className="py-2 border-b hairline">
            <a href={b.url} target="_blank" rel="noopener noreferrer" className="group block">
              <span className="block font-headline text-[15px] leading-snug group-hover:text-[color:var(--section-hue)]">{b.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
