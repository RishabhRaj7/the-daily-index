import type { IpoEntry, IpoStage } from "@/lib/types";

// Where an IPO stands and the order the strip lists them in. Shared by the
// server and the page, so a strip left open past midnight re-files itself.

export function stageOf(e: Pick<IpoEntry, "open" | "close" | "listing">, today: string): IpoStage {
  if (e.listing && today > e.listing) return "listed";
  if (e.listing && today === e.listing) return "listing";
  if (e.close && today > e.close) return "closed";
  if (e.open && today >= e.open) return "open";
  return "upcoming";
}

// The strip follows the calendar from what needs doing now outwards:
//   open       bidding now, the one closing soonest first
//   listing    listing today
//   closed     bidding over, the one listing soonest first
//   upcoming   not open yet, the soonest first
//   listed     already trading, the most recent first
// Level pegging (same day), the stronger grey-market premium, then the
// bigger issue, leads.
const RANK: Record<IpoStage, number> = { open: 0, listing: 1, closed: 2, upcoming: 3, listed: 4 };

function keyDate(e: IpoEntry): string {
  switch (e.stage) {
    case "open":
      return e.close ?? "9";
    case "closed":
    case "listing":
    case "listed":
      return e.listing ?? "9";
    default:
      return e.open ?? "9";
  }
}

export function sortIpos(ipos: IpoEntry[], today: string): IpoEntry[] {
  return ipos
    .map((e) => ({ ...e, stage: stageOf(e, today) }))
    .sort((a, b) => {
      const byStage = RANK[a.stage] - RANK[b.stage];
      if (byStage) return byStage;
      const byDate = keyDate(a).localeCompare(keyDate(b));
      if (byDate) return a.stage === "listed" ? -byDate : byDate;
      return (b.gmpPct ?? -1) - (a.gmpPct ?? -1) || (b.sizeCr ?? 0) - (a.sizeCr ?? 0) || a.name.localeCompare(b.name);
    });
}
