"use client";

import {
  ArticleIcon,
  BuildingsIcon,
  CalendarDotsIcon,
  ChartLineUpIcon,
  ChatsCircleIcon,
  CloudSunIcon,
  CoinsIcon,
  CompassIcon,
  CpuIcon,
  CrosshairIcon,
  FlagBannerIcon,
  FlagCheckeredIcon,
  GlobeHemisphereEastIcon,
  type Icon,
  NewspaperIcon,
  PercentIcon,
  ReceiptIcon,
  SoccerBallIcon,
} from "@phosphor-icons/react";

// The paper's icons for where you are (Phosphor). One rule everywhere: the outline
// when inactive, the filled version when it's the current one. They draw in the
// text colour, so they need no separate dark and light versions.

export const CHAPTER_ICONS: Record<string, Icon> = {
  masthead: NewspaperIcon,
  "ch-news": GlobeHemisphereEastIcon,
  "ch-sport": FlagCheckeredIcon,
  "ch-money": CoinsIcon,
  "ch-next": CompassIcon,
};

const SECTION_ICONS: Record<string, Icon> = {
  dateline: GlobeHemisphereEastIcon,
  "the-nation": FlagBannerIcon,
  "two-cities": BuildingsIcon,
  "sky-report": CloudSunIcon,
  "paddock-notes": FlagCheckeredIcon,
  clutch: CrosshairIcon,
  sports: SoccerBallIcon,
  ledger: ReceiptIcon,
  "market-pulse": ChartLineUpIcon,
  "circuit-board": CpuIcon,
  "straw-poll": PercentIcon,
  "week-ahead": CalendarDotsIcon,
  grapevine: ChatsCircleIcon,
  masthead: NewspaperIcon,
};

/** A section's icon; the reader's own sections share one. */
export const sectionIcon = (id: string): Icon => SECTION_ICONS[id] ?? ArticleIcon;

/** A briefing line's icon, from its desk's label. */
export function deskIcon(label: string): Icon {
  const l = label.toLowerCase();
  if (/world/.test(l)) return GlobeHemisphereEastIcon;
  if (/india|nation/.test(l)) return FlagBannerIcon;
  if (/f1|formula/.test(l)) return FlagCheckeredIcon;
  if (/valorant|clutch/.test(l)) return CrosshairIcon;
  if (/football|tennis|sport/.test(l)) return SoccerBallIcon;
  if (/market/.test(l)) return ChartLineUpIcon;
  if (/money|financ|business/.test(l)) return ReceiptIcon;
  if (/tech/.test(l)) return CpuIcon;
  if (/weather|sky/.test(l)) return CloudSunIcon;
  // Anything else on a desk's line is one of the reader's cities.
  return BuildingsIcon;
}
