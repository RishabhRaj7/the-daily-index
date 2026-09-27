import type { Story } from "@/lib/types";

export interface AlsoItem {
  story: Story;
  kicker: string;
  hue: string;
}

// The left rail of the front page: the top story from each of the other
// desks, numbered, each linking down to where it runs in full.
export default function AlsoToday({ items }: { items: AlsoItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Also in this edition" className="min-w-0">
      <h2 className="font-label text-[10px] text-ink-soft mb-3">Also in this edition</h2>
      <ol className="divide-y hairline border-t hairline">
        {items.map(({ story, kicker, hue }, i) => (
          <li key={story.id} data-reveal style={{ ["--reveal-i" as string]: i }}>
            <a href={`#story-${story.id}`} className="group block py-4" style={{ ["--section-hue" as string]: hue }}>
              <div className="flex items-baseline gap-3">
                <span className="font-display font-extrabold text-[1.9rem] leading-[0.8] text-ink-faint transition-colors duration-300 group-hover:text-[color:var(--section-hue)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-label text-[10px]" style={{ color: hue }}>
                  {kicker}
                </span>
              </div>
              <p className="font-headline text-[1.12rem] leading-[1.22] mt-2 text-balance">
                <span className="headline-link">{story.headline}</span>
              </p>
              {story.body[0] && (
                <p className="text-[13px] leading-snug text-ink-soft mt-1.5 line-clamp-2">{story.body[0]}</p>
              )}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
