import type { OnThisDayEntry } from "@/lib/types";

const FALLBACK: OnThisDayEntry[] = [
  { year: "1969", text: "Apollo 11 astronauts returned to Earth after the first crewed Moon landing." },
  { year: "1991", text: "The World Wide Web was made publicly available for the first time." },
  { year: "2004", text: "Facebook launched at Harvard University." },
];

export async function getOnThisDay(): Promise<OnThisDayEntry[]> {
  try {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return FALLBACK;

    const json = await res.json();
    const events: { year: number; text: string }[] = json.events ?? [];
    if (events.length === 0) return FALLBACK;

    // Prefer events from the 20th/21st century with a reasonably short description.
    const interesting = events
      .filter((e) => e.year >= 1900 && e.text.length >= 40 && e.text.length <= 200)
      .sort((a, b) => b.year - a.year) // newest first, more relatable
      .slice(0, 3);

    if (interesting.length < 3) {
      return events.slice(0, 3).map((e) => ({ year: String(e.year), text: e.text }));
    }

    return interesting.map((e) => ({ year: String(e.year), text: e.text }));
  } catch {
    return FALLBACK;
  }
}
