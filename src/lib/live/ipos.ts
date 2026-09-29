// IPO watch: mainboard IPOs from the day they are announced to a couple of
// days after they list.
//
// Two sources, merged by company name:
//   NSE (official)   — the issue list, and per IPO the category-wise
//                      subscription and the issue details (detail view only)
//   investorgain.com — GMP (grey market premium), issue size in crores and
//                      the allotment / listing dates. GMP is unofficial and
//                      the page can change shape: every field is optional and
//                      the board still prints from NSE alone if it fails.
//
// The board is kept in the store, so an IPO that has dropped off both
// sources' "current" lists stays until two days after it lists, and each
// IPO's GMP is recorded once a day to draw its trend.

import type { IpoDetail, IpoEntry, IpoStage } from "@/lib/types";
import { getStore } from "@/lib/server/store";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const NSE_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  Referer: "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
};
const GMP_PAGE = "https://www.investorgain.com/report/live-ipo-gmp/331/";
const DAY = 86_400_000;
/** How long a listed IPO stays on the board. */
const KEEP_AFTER_LISTING_DAYS = 2;
const BOARD_KEY = "ipo:board";
const GMP_KEY = (id: string) => `ipo:gmp:${id}`;

/** "AceVector Limited" / "Acevector" → "acevector". */
export function ipoId(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(limited|ltd|ipo|india|the|and)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "30-Sep-2026" or "5-Oct" (year implied) → "2026-10-05". */
function toIso(raw: string | undefined | null, today = new Date()): string | null {
  const m = raw?.trim().match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*(?:[-\s](\d{4}))?/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  let year = m[3] ? Number(m[3]) : today.getUTCFullYear();
  if (!m[3]) {
    // A December date read in January belongs to last year, and vice versa.
    const guess = Date.UTC(year, month, Number(m[1]));
    if (guess - today.getTime() > 180 * DAY) year -= 1;
    else if (today.getTime() - guess > 180 * DAY) year += 1;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

function num(raw: string | undefined | null): number | null {
  const n = Number(String(raw ?? "").replace(/[^0-9.\-]/g, ""));
  return raw && Number.isFinite(n) && /\d/.test(raw) ? n : null;
}

// ---- NSE ---------------------------------------------------------------------

interface NseIssue {
  symbol: string;
  companyName: string;
  issueStartDate: string;
  issueEndDate: string;
  issuePrice: string;
  issueSize: string;
  status: string;
  series: string;
}

async function nseIssues(): Promise<NseIssue[]> {
  try {
    const res = await fetch("https://www.nseindia.com/api/all-upcoming-issues?category=ipo", {
      headers: NSE_HEADERS,
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as NseIssue[];
    // Series EQ is the mainboard; SME issues trade as SM / ST.
    return Array.isArray(data) ? data.filter((d) => d.series === "EQ") : [];
  } catch {
    return [];
  }
}

/** Symbols of issues NSE has already closed or listed, by company id — for
 *  IPOs the board only knows from the GMP table (listing-day prices need
 *  the symbol). */
async function nsePastSymbols(): Promise<Map<string, string>> {
  try {
    const res = await fetch("https://www.nseindia.com/api/public-past-issues", {
      headers: NSE_HEADERS,
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return new Map();
    const rows = (await res.json()) as Array<{ company?: string; symbol?: string; securityType?: string }>;
    return new Map(
      rows
        .slice(0, 150)
        .filter((r) => r.company && r.symbol && r.securityType === "EQ")
        .map((r) => [ipoId(r.company!), r.symbol!]),
    );
  } catch {
    return new Map();
  }
}

// ---- GMP table -----------------------------------------------------------------

interface GmpRow {
  name: string;
  href: string | null;
  sme: boolean;
  gmp: number | null;
  gmpPct: number | null;
  subscription: string | null;
  price: number | null;
  sizeCr: number | null;
  open: string | null;
  close: string | null;
  allotment: string | null;
  listing: string | null;
  gmpAtOpen: number | null;
  updated: string | null;
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8377;/g, "₹")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseGmpTable(html: string): GmpRow[] {
  const rows: GmpRow[] = [];
  for (const tr of html.split(/<tr[\s>]/).slice(1)) {
    const cells: Record<string, string> = {};
    for (const [, label, value] of tr.matchAll(/data-label="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)) cells[label] = value;
    if (!cells.Name) continue;
    const anchor = cells.Name.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const name = anchor ? text(anchor[2]) : text(cells.Name).split(" ")[0];
    if (!name) continue;
    const gmpText = text(cells.GMP ?? "");
    const gmpMatch = gmpText.match(/₹\s*(-?[\d.]+|--)\s*\((-?[\d.]+)%\)/);
    const openText = text(cells.Open ?? "");
    rows.push({
      name,
      href: anchor ? new URL(anchor[1], GMP_PAGE).toString() : null,
      sme: /\bSME\b/.test(text(cells.Name)),
      gmp: gmpMatch && gmpMatch[1] !== "--" ? Number(gmpMatch[1]) : null,
      gmpPct: gmpMatch && gmpMatch[1] !== "--" ? Number(gmpMatch[2]) : null,
      subscription: /x$/i.test(text(cells.Sub ?? "")) ? text(cells.Sub ?? "") : null,
      price: num(text(cells["Price (₹)"] ?? "")),
      sizeCr: num(text(cells["IPO Size"] ?? "").replace(/Cr.*/i, "")),
      open: toIso(openText),
      close: toIso(text(cells.Close ?? "")),
      allotment: toIso(text(cells["BoA Dt"] ?? "")),
      listing: toIso(text(cells.Listing ?? "")),
      gmpAtOpen: num(openText.match(/GMP:\s*(-?[\d.]+)/)?.[1]),
      updated: text(cells["Updated-On"] ?? "") || null,
    });
  }
  return rows;
}

async function gmpRows(): Promise<GmpRow[]> {
  try {
    const res = await fetch(GMP_PAGE, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    return parseGmpTable(await res.text()).filter((r) => !r.sme);
  } catch {
    return [];
  }
}

// ---- the board -----------------------------------------------------------------

function stageOf(e: Pick<IpoEntry, "open" | "close" | "listing">, today: string): IpoStage {
  if (e.listing && today > e.listing) return "listed";
  if (e.listing && today === e.listing) return "listing";
  if (e.close && today > e.close) return "closed";
  if (e.open && today >= e.open) return "open";
  return "upcoming";
}

/** Price band "Rs.208 to Rs.220" → [208, 220]. */
function band(raw: string | undefined): [number, number] | null {
  // "Rs.123 to Rs.130": the dot after "Rs" must not start a number.
  const n = (raw ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number).filter((x) => x > 0) ?? [];
  if (n.length === 0) return null;
  return [n[0], n[n.length - 1]];
}

// Working days after a date (weekends skipped; exchange holidays aren't known).
function addWorkingDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

export async function getIpoBoard(): Promise<IpoEntry[]> {
  const today = istToday();
  const [nse, gmp, stored, pastSymbols] = await Promise.all([
    nseIssues(),
    gmpRows(),
    getStore().get<Record<string, IpoEntry>>(BOARD_KEY).catch(() => null),
    nsePastSymbols(),
  ]);
  // Re-key what was stored, so a change in how names are matched never
  // leaves the same IPO on the board twice.
  const board: Record<string, IpoEntry> = {};
  for (const e of Object.values(stored ?? {})) board[ipoId(e.name)] = { ...e, id: ipoId(e.name) };

  for (const n of nse) {
    const id = ipoId(n.companyName);
    const b = band(n.issuePrice);
    const prev = board[id];
    board[id] = {
      ...prev,
      id,
      name: n.companyName.replace(/\s+Limited$/i, ""),
      symbol: n.symbol,
      open: toIso(n.issueStartDate) ?? prev?.open ?? null,
      close: toIso(n.issueEndDate) ?? prev?.close ?? null,
      priceLow: b?.[0] ?? prev?.priceLow ?? null,
      priceHigh: b?.[1] ?? prev?.priceHigh ?? null,
      // NSE's issueSize is not in consistent units; the size comes from the GMP table.
      sizeCr: prev?.sizeCr ?? null,
      allotment: prev?.allotment ?? null,
      listing: prev?.listing ?? null,
      gmp: prev?.gmp ?? null,
      gmpPct: prev?.gmpPct ?? null,
      subscription: prev?.subscription ?? null,
      gmpUrl: prev?.gmpUrl ?? null,
      stage: "upcoming",
      listingEstimated: prev?.listingEstimated ?? true,
    };
  }

  for (const g of gmp) {
    const id = ipoId(g.name);
    // The GMP table lists names in its own style ("Acevector"); match by id
    // or by an NSE name that starts the same way.
    const key =
      board[id] ? id : Object.keys(board).find((k) => k.startsWith(id) || id.startsWith(k)) ?? id;
    const prev = board[key];
    board[key] = {
      id: key,
      name: prev?.name ?? g.name,
      symbol: prev?.symbol ?? null,
      open: prev?.open ?? g.open,
      close: prev?.close ?? g.close,
      priceLow: prev?.priceLow ?? g.price,
      priceHigh: prev?.priceHigh ?? g.price,
      sizeCr: g.sizeCr ?? prev?.sizeCr ?? null,
      allotment: g.allotment ?? prev?.allotment ?? null,
      listing: g.listing ?? prev?.listing ?? null,
      listingEstimated: g.listing ? false : (prev?.listingEstimated ?? true),
      gmp: g.gmp ?? prev?.gmp ?? null,
      gmpPct: g.gmpPct ?? prev?.gmpPct ?? null,
      subscription: g.subscription ?? prev?.subscription ?? null,
      gmpUrl: g.href ?? prev?.gmpUrl ?? null,
      stage: "upcoming",
    };
  }

  // Fill what is still unknown (SEBI's T+3: allotment the next working
  // day after closing, listing three), work out each stage, and drop IPOs
  // that listed more than two days ago.
  const out: IpoEntry[] = [];
  for (const e of Object.values(board)) {
    if (!e.symbol) {
      const key = [...pastSymbols.keys()].find((k) => k === e.id || k.startsWith(e.id) || e.id.startsWith(k));
      if (key) e.symbol = pastSymbols.get(key)!;
    }
    if (e.close && !e.allotment) e.allotment = addWorkingDays(e.close, 1);
    if (e.close && !e.listing) {
      e.listing = addWorkingDays(e.close, 3);
      e.listingEstimated = true;
    }
    e.stage = stageOf(e, today);
    const done = e.listing && Date.parse(today) - Date.parse(e.listing) > KEEP_AFTER_LISTING_DAYS * DAY;
    if (!done) out.push(e);
  }
  out.sort((a, b) => (a.open ?? "9").localeCompare(b.open ?? "9"));

  // Remember the board and today's GMP for each IPO. Best effort.
  const store = getStore();
  const kept = Object.fromEntries(out.map((e) => [e.id, e]));
  await Promise.all([
    store.set(BOARD_KEY, kept, { ttlSeconds: 30 * 86_400 }).catch(() => {}),
    ...out
      .filter((e) => e.gmp !== null)
      .map(async (e) => {
        const history = (await store.get<Record<string, number>>(GMP_KEY(e.id)).catch(() => null)) ?? {};
        if (history[today] === e.gmp) return;
        history[today] = e.gmp!;
        await store.set(GMP_KEY(e.id), history, { ttlSeconds: 60 * 86_400 }).catch(() => {});
      }),
  ]);
  return out;
}

// ---- one IPO in full -------------------------------------------------------------

interface NseDetail {
  bidDetails?: Array<{ category?: string; noOfTime?: string | number; noOfSharesOffered?: string; noOfsharesBid?: string }>;
  issueInfo?: { dataList?: Array<{ title?: string | null; value?: string | null }> };
}

function clean(value: string | null | undefined): string {
  return text(String(value ?? "").replace(/^"|"$/g, "")).replace(/^"|"$/g, "");
}

export async function getIpoDetail(id: string): Promise<IpoDetail | null> {
  const board = await getIpoBoard();
  const entry = board.find((e) => e.id === id);
  if (!entry) return null;

  let subscription: IpoDetail["subscriptionByCategory"] = [];
  let facts: IpoDetail["facts"] = [];
  let documents: IpoDetail["documents"] = [];
  let subscriptionUpdated: string | null = null;
  if (entry.symbol) {
    try {
      const res = await fetch(
        `https://www.nseindia.com/api/ipo-detail?symbol=${encodeURIComponent(entry.symbol)}&series=EQ`,
        { headers: NSE_HEADERS, next: { revalidate: 300 }, signal: AbortSignal.timeout(10_000) },
      );
      if (res.ok) {
        const d = (await res.json()) as NseDetail;
        // The main categories only; NSE nests sub-rows under each.
        const wanted: Array<[RegExp, string]> = [
          [/^Qualified Institutional/i, "QIB"],
          [/^Non Institutional Investors$/i, "NII"],
          [/more than Ten Lakh/i, "bNII (>₹10L)"],
          [/Two Lakh Rupees upto Ten/i, "sNII (₹2–10L)"],
          [/^Retail Individual/i, "Retail"],
          [/^Employee/i, "Employees"],
          [/^Shareholder/i, "Shareholders"],
          [/^Total$/i, "Total"],
        ];
        for (const [re, label] of wanted) {
          const row = d.bidDetails?.find((r) => re.test(r.category ?? ""));
          const times = num(String(row?.noOfTime ?? ""));
          if (row && times !== null) subscription.push({ category: label, times });
        }
        subscription = subscription.filter((s, i, all) => all.findIndex((x) => x.category === s.category) === i);
        const keep = /^(Issue Size|Issue Type|Price Range|Face Value|Bid Lot|Minimum Order Quantity|Maximum Subscription Amount for Retail|Book Running Lead Managers|Name of the Registrar|IPO Market Timings|Discount)/i;
        for (const row of d.issueInfo?.dataList ?? []) {
          const title = clean(row.title);
          const value = clean(row.value);
          if (!title || !value) continue;
          const link = String(row.value ?? "").match(/https?:\/\/[^\s"<>]+\.(?:zip|pdf)/i)?.[0];
          if (link && /Prospectus|Anchor|Ratios/i.test(title)) documents.push({ label: title, url: link });
          else if (keep.test(title)) facts.push({ label: title.replace(/for Retail I.*$/i, "(retail)"), value: value.slice(0, 220) });
        }
        subscriptionUpdated = subscription.length > 0 ? new Date().toISOString() : null;
      }
    } catch {
      /* NSE unreachable: the board's own figures still print */
    }
  }
  documents = documents.slice(0, 4);
  facts = facts.slice(0, 12);

  const history = (await getStore().get<Record<string, number>>(GMP_KEY(id)).catch(() => null)) ?? {};
  const gmpHistory = Object.entries(history)
    .map(([date, gmp]) => ({ date, gmp }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Listing day and after: the stock's own first sessions.
  let listingPerformance: IpoDetail["listingPerformance"] = null;
  if (entry.symbol && (entry.stage === "listing" || entry.stage === "listed")) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(entry.symbol)}.NS?range=5d&interval=1d`,
        { headers: { "User-Agent": UA }, next: { revalidate: 120 } },
      );
      const data = res.ok ? await res.json() : null;
      const r = data?.chart?.result?.[0];
      const q = r?.indicators?.quote?.[0];
      const first = (q?.open ?? []).findIndex((v: number | null) => typeof v === "number");
      if (r && first >= 0) {
        const lastClose = [...(q.close ?? [])].reverse().find((v: number | null) => typeof v === "number");
        listingPerformance = {
          open: q.open[first],
          close: q.close?.[first] ?? null,
          last: lastClose ?? r.meta?.regularMarketPrice ?? null,
        };
      }
    } catch {
      /* not trading yet */
    }
  }

  return { ...entry, subscriptionByCategory: subscription, subscriptionUpdated, facts, documents, gmpHistory, listingPerformance };
}
