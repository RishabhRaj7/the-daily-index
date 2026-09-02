import type { WireBrief } from "./types";

// Stable sort: items matching a user topic float to the top, but relative
// order within each group (matched / unmatched) is preserved.
export function biasWireByTopics(
  items: WireBrief[],
  topics: string[],
): WireBrief[] {
  if (topics.length === 0) return items;
  const lowerTopics = topics.map((t) => t.toLowerCase().trim()).filter(Boolean);
  if (lowerTopics.length === 0) return items;

  const matches = (item: WireBrief) => {
    const haystack = item.title.toLowerCase();
    return lowerTopics.some((t) => haystack.includes(t));
  };

  return [...items].sort((a, b) => Number(matches(b)) - Number(matches(a)));
}
