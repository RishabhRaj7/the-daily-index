import type { TrendingTopic } from "@/lib/types";

// Curated editorial topics — X/Twitter has no free public API so this list
// is hand-picked and updated periodically rather than fetched live.
// Displayed in the Grapevine section under "Editor's Picks".
export const CURATED_X_TOPICS: TrendingTopic[] = [
  {
    id: "x-1",
    label: "#MonzaWeekend",
    platform: "x",
    detail: "Formula 1 fans are dissecting Friday practice data ahead of the Italian Grand Prix at Monza. The debate centres on whether Pirelli's hard compound will survive the high-speed banking sections, with most teams expected to run a one-stop strategy.",
  },
  {
    id: "x-2",
    label: "#GPT6Rumors",
    platform: "x",
    detail: "Unverified screenshots purporting to show an OpenAI internal changelog for GPT-6 are circulating widely. AI researchers are split: some flag signs consistent with a real document, others point to metadata inconsistencies suggesting a fabrication.",
  },
  {
    id: "x-3",
    label: "#Monsoon2026",
    platform: "x",
    detail: "A dramatic timelapse of Bengaluru's evening downpour yesterday is going viral. The city received 94 mm of rain in under three hours — its heaviest single-evening event since 2022 — triggering waterlogging across the outer ring road.",
  },
  {
    id: "x-4",
    label: "#AxisAtlasTiers",
    platform: "x",
    detail: "Axis Bank quietly updated the spend thresholds for the Atlas card's lounge-access tiers overnight. Cardholders are sharing screenshots showing the domestic visit cap dropped from 8 to 5 at the base tier, drawing frustration from frequent flyers.",
  },
  {
    id: "x-5",
    label: "#UPICreditLine",
    platform: "x",
    detail: "RBI's pilot to allow credit lines directly on UPI is generating heated debate among fintech founders and consumer advocates. Proponents say it democratises short-term credit; critics argue it will normalise debt for everyday grocery purchases.",
  },
];
