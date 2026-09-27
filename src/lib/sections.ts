import type { SectionKey, SectionMeta } from "./types";

export const SECTION_META: Record<SectionKey, SectionMeta> = {
  dateline: {
    key: "dateline",
    label: "Dateline — World & India",
    kicker: "World & India",
    slug: "dateline",
    name: "Dateline",
    short: "World",
    hue: "var(--hue-world)",
  },
  "paddock-notes": {
    key: "paddock-notes",
    label: "Paddock Notes — Formula 1",
    kicker: "Formula 1",
    slug: "paddock-notes",
    name: "Paddock Notes",
    short: "F1",
    hue: "var(--hue-f1)",
  },
  sports: {
    key: "sports",
    label: "Sports — Football & Tennis",
    kicker: "Football & Tennis",
    slug: "sports",
    name: "Sports",
    short: "Sport",
    hue: "var(--hue-sport)",
  },
  "sky-report": {
    key: "sky-report",
    label: "Sky Report — Weather",
    kicker: "Weather",
    slug: "sky-report",
    name: "Sky Report",
    short: "Weather",
    hue: "var(--hue-sky)",
  },
  "circuit-board": {
    key: "circuit-board",
    label: "The Circuit Board — Tech",
    kicker: "Technology",
    slug: "circuit-board",
    name: "The Circuit Board",
    short: "Tech",
    hue: "var(--hue-tech)",
  },
  ledger: {
    key: "ledger",
    label: "The Ledger — Finance & Markets",
    kicker: "Finance",
    slug: "ledger",
    name: "The Ledger",
    short: "Money",
    hue: "var(--hue-money)",
  },
  "market-pulse": {
    key: "market-pulse",
    label: "Market Pulse — Indices",
    kicker: "Indices",
    slug: "market-pulse",
    name: "Market Pulse",
    short: "Markets",
    hue: "var(--hue-markets)",
  },
  grapevine: {
    key: "grapevine",
    label: "The Grapevine — You Should See This",
    kicker: "Forwarded to You",
    slug: "grapevine",
    name: "The Grapevine",
    short: "Grapevine",
    hue: "var(--hue-grapevine)",
  },
};

// The day in the order you'd read it: the world, then your sport, then
// money (stories, then the numbers), then tech, the sky, and the extras.
export const SECTION_ORDER: SectionKey[] = [
  "dateline",
  "paddock-notes",
  "sports",
  "ledger",
  "market-pulse",
  "circuit-board",
  "sky-report",
  "grapevine",
];

/** The default order before the redesign; readers who never changed it get
 *  the new one. */
export const PREVIOUS_DEFAULT_ORDER: SectionKey[] = [
  "dateline",
  "paddock-notes",
  "sports",
  "sky-report",
  "circuit-board",
  "ledger",
  "market-pulse",
  "grapevine",
];
