import type { SectionKey, SectionMeta } from "./types";

export const SECTION_META: Record<SectionKey, SectionMeta> = {
  dateline: {
    key: "dateline",
    label: "Dateline — World & India",
    kicker: "World & India",
    slug: "dateline",
  },
  "paddock-notes": {
    key: "paddock-notes",
    label: "Paddock Notes — Formula 1",
    kicker: "Formula 1",
    slug: "paddock-notes",
  },
  "sky-report": {
    key: "sky-report",
    label: "Sky Report — Weather",
    kicker: "Weather",
    slug: "sky-report",
  },
  "circuit-board": {
    key: "circuit-board",
    label: "The Circuit Board — Tech",
    kicker: "Technology",
    slug: "circuit-board",
  },
  ledger: {
    key: "ledger",
    label: "The Ledger — Finance & Markets",
    kicker: "Finance",
    slug: "ledger",
  },
  "plastic-points": {
    key: "plastic-points",
    label: "Plastic & Points — India Credit Cards",
    kicker: "Rewards Desk",
    slug: "plastic-points",
  },
  "market-pulse": {
    key: "market-pulse",
    label: "Market Pulse — Indices",
    kicker: "Indices",
    slug: "market-pulse",
  },
  grapevine: {
    key: "grapevine",
    label: "The Grapevine — You Should See This",
    kicker: "Forwarded to You",
    slug: "grapevine",
  },
};

export const SECTION_ORDER: SectionKey[] = [
  "dateline",
  "paddock-notes",
  "sky-report",
  "circuit-board",
  "ledger",
  "plastic-points",
  "market-pulse",
  "grapevine",
];
