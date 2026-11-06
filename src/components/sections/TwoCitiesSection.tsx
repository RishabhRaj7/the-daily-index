import type { Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

// Two Cities: the reader's cities side by side from a tablet up, one column
// each, like the regional pages of a national paper; with the room, each city's
// stories run across (globals.css, .city-stories). Each story's kicker is its
// city; the column header carries the name instead, so it isn't repeated per
// story.

function CityColumn({ city, stories, i }: { city: string; stories: Story[]; i: number }) {
  return (
    <div className="min-w-0" data-reveal style={{ ["--reveal-i" as string]: i }}>
      <header className="pb-1.5 mb-2 border-b hairline">
        <div className="flex items-baseline justify-between gap-3">
          <h3
            className="font-display font-extrabold uppercase text-[1.5rem] leading-[0.95] tracking-tight"
            style={{ color: "var(--section-hue, var(--accent))" }}
          >
            {city}
          </h3>
          <span className="font-mono text-[11px] text-ink-soft shrink-0">
            {stories.length} {stories.length === 1 ? "STORY" : "STORIES"}
          </span>
        </div>
      </header>
      <div className="story-grid city-stories">
        {stories.map((s) => (
          <StoryArticle key={s.id} story={{ ...s, kicker: undefined }} />
        ))}
      </div>
    </div>
  );
}

export default function TwoCitiesSection({ stories }: { stories: Story[] }) {
  // Columns in the order their cities first appear (the editor's priority).
  const cities: string[] = [];
  const byCity = new Map<string, Story[]>();
  for (const s of stories) {
    const city = s.kicker ?? cities[0] ?? "Home";
    if (!byCity.has(city)) {
      byCity.set(city, []);
      cities.push(city);
    }
    byCity.get(city)!.push(s);
  }

  return (
    <section id="two-cities">
      <SectionHeader sectionKey="two-cities" />
      <div
        className={`grid gap-y-6 ${
          cities.length > 1 ? "md:grid-cols-2 md:divide-x hairline md:[&>*]:px-8 md:[&>*:first-child]:pl-0 md:[&>*:last-child]:pr-0" : ""
        }`}
      >
        {cities.map((city, i) => (
          <CityColumn key={city} city={city} stories={byCity.get(city)!} i={i} />
        ))}
      </div>
    </section>
  );
}
