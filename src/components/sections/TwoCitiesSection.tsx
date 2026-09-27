import type { Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

// Two Cities: the reader's cities side by side, one column each, like the
// regional pages of a national paper. Each story's kicker is its city; the
// column header carries the name instead, so it isn't repeated per story.

const CITY_INFO: Record<string, { state: string; coords: string }> = {
  bengaluru: { state: "Karnataka", coords: "12.97° N · 77.59° E" },
  bangalore: { state: "Karnataka", coords: "12.97° N · 77.59° E" },
  ranchi: { state: "Jharkhand", coords: "23.34° N · 85.31° E" },
};

function CityColumn({ city, stories, i }: { city: string; stories: Story[]; i: number }) {
  const info = CITY_INFO[city.toLowerCase()];
  return (
    <div className="min-w-0" data-reveal style={{ ["--reveal-i" as string]: i }}>
      <header className="pb-4 mb-5 border-b-2" style={{ borderColor: "var(--section-hue, var(--accent))" }}>
        <div className="flex items-baseline justify-between gap-3">
          <h3
            className="font-display font-extrabold uppercase text-[clamp(2.4rem,5.5vw,3.6rem)] leading-[0.85] tracking-tight"
            style={{ color: "var(--section-hue, var(--accent))" }}
          >
            {city}
          </h3>
          <span className="font-mono text-[11px] text-ink-soft shrink-0">
            {stories.length} {stories.length === 1 ? "STORY" : "STORIES"}
          </span>
        </div>
        {info && (
          <div className="flex flex-wrap justify-between gap-x-4 mt-2 font-mono text-[11px] text-ink-soft">
            <span className="font-label text-[10px]">{info.state}</span>
            <span>{info.coords}</span>
          </div>
        )}
      </header>
      <div className="story-grid">
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
        className={`grid gap-y-14 ${
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
