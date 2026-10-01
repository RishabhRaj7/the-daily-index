"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { OddsMarket } from "@/lib/types";
import { loadPersonalization, savePersonalization, PERSONALIZATION_CHANGED_EVENT } from "@/lib/personalization";

// What every odds card on the page shares: a week's line per market (one
// request for the lot, made by the page) and the reader's stars.

export const SparksContext = createContext<Map<string, number[]>>(new Map());
export const useSpark = (id: string) => useContext(SparksContext).get(id);

/** What /api/odds/sparks needs to draw a market's favourite: id~token or id~ticker~series. */
export function sparkRef(m: OddsMarket): string | null {
  const lead = m.outcomes.find((o) => o.name === m.lead.name) ?? m.outcomes[0];
  if (m.source === "Polymarket" && lead?.token) return `${m.id}~${lead.token}`;
  if (m.source === "Kalshi" && lead?.ticker && m.series) return `${m.id}~${lead.ticker}~${m.series}`;
  return null;
}

/** The page's sparks, fetched once for every market it shows. */
export function useSparks(markets: OddsMarket[]): Map<string, number[]> {
  const refs = [...new Set(markets.map(sparkRef).filter((r): r is string => !!r))].sort().join("|");
  const [sparks, setSparks] = useState<Map<string, number[]>>(new Map());
  useEffect(() => {
    if (!refs) return;
    const controller = new AbortController();
    fetch(`/api/odds/sparks?m=${encodeURIComponent(refs)}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, number[]>>) : {}))
      .then((d) => setSparks(new Map(Object.entries(d))))
      .catch(() => {});
    return () => controller.abort();
  }, [refs]);
  return sparks;
}

/** A market starred from its sheet: always read, always considered. */
function subscribePersonalization(cb: () => void) {
  window.addEventListener(PERSONALIZATION_CHANGED_EVENT, cb);
  return () => window.removeEventListener(PERSONALIZATION_CHANGED_EVENT, cb);
}

export function useStar(m: OddsMarket): [boolean, () => void] {
  const on = useSyncExternalStore(
    subscribePersonalization,
    () => (loadPersonalization().oddsPins ?? []).some((p) => p.id === m.id),
    () => false,
  );
  const toggle = () => {
    const p = loadPersonalization();
    const pins = p.oddsPins ?? [];
    const next = pins.some((x) => x.id === m.id) ? pins.filter((x) => x.id !== m.id) : [...pins, { id: m.id, title: m.title }].slice(-12);
    savePersonalization({ ...p, oddsPins: next });
  };
  return [on, toggle];
}
