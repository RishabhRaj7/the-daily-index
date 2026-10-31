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
import { stageOf } from "@/lib/ipo-order";
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

async function fetchGmpTable(): Promise<GmpRow[]> {
  try {
    const res = await fetch(GMP_PAGE, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      // The schedule below decides when to read; never serve a cached copy.
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    return parseGmpTable(await res.text()).filter((r) => !r.sme);
  } catch {
    return [];
  }
}

// ---- when GMP is read ------------------------------------------------------------
//
// GMP moves slowly before an issue opens and fast around its close, so the
// GMP page is read on a schedule set by where each IPO is (times IST):
//   not yet open                        10:00, once a day
//   bidding days before the last one    10:00 and 14:00
//   closing day                         every hour, 10:00 to 18:00
//   after closing, through listing day  10:00, once a day
//   after listing                       not read
// The busiest IPO sets the pace. Between slots the last reading is served
// from the store, so the page is never read more often than the schedule —
// however many readers load the paper. (There is no background job: the
// first request after a slot does the read.)

const GMP_TABLE_KEY = "ipo:gmp-table";
const HOURLY = [10, 11, 12, 13, 14, 15, 16, 17, 18];

/** Refresh hours (IST) for one IPO on one day. */
export function gmpHoursFor(e: Pick<IpoEntry, "open" | "close" | "listing">, day: string): number[] {
  if (e.listing && day > e.listing) return [];
  if (e.close && day > e.close) return [10];
  if (e.close && day === e.close) return HOURLY;
  if (e.open && day >= e.open) return [10, 14];
  return [10];
}

/** The latest scheduled read at or before `now` across the board, if any. */
export function latestGmpSlot(entries: Array<Pick<IpoEntry, "open" | "close" | "listing">>, now = Date.now()): number | null {
  const today = new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const yesterday = new Date(now + 5.5 * 3_600_000 - DAY).toISOString().slice(0, 10);
  let latest: number | null = null;
  for (const day of [today, yesterday]) {
    for (const e of entries) {
      for (const h of gmpHoursFor(e, day)) {
        const t = Date.parse(`${day}T${String(h).padStart(2, "0")}:00:00+05:30`);
        if (t <= now && (latest === null || t > latest)) latest = t;
      }
    }
  }
  return latest;
}

async function gmpRows(known: IpoEntry[]): Promise<GmpRow[]> {
  const store = getStore();
  const cached = await store.get<{ at: number; rows: GmpRow[] }>(GMP_TABLE_KEY).catch(() => null);
  // With nothing on the board yet, one read finds out what is coming.
  const due = known.length === 0 ? Date.now() : latestGmpSlot(known);
  if (cached && (due === null || cached.at >= due)) return cached.rows;
  const fresh = await fetchGmpTable();
  if (fresh.length === 0) return cached?.rows ?? [];
  await store.set(GMP_TABLE_KEY, { at: Date.now(), rows: fresh }, { ttlSeconds: 7 * 86_400 }).catch(() => {});
  return fresh;
}

// ---- the board -----------------------------------------------------------------

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
  const stored = await getStore().get<Record<string, IpoEntry>>(BOARD_KEY).catch(() => null);
  const [nse, gmp, pastSymbols] = await Promise.all([
    nseIssues(),
    gmpRows(Object.values(stored ?? {})),
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
  // The subscription: NSE's consolidated figure (NSE and BSE bids together)
  // over the GMP table's, which is read only a few times a day. Read on its
  // own schedule (subscriptionFor) and filled after the board is stored, so
  // the board keeps whatever the GMP table said and this is never kept stale.
  await Promise.all(
    out
      .filter((e) => e.symbol && (e.stage === "open" || e.stage === "closed"))
      .map(async (e) => {
        const sub = await subscriptionFor(e, today).catch(() => null);
        if (!sub) return;
        e.subscription = `${sub.total >= 10 ? sub.total.toFixed(1) : sub.total.toFixed(2)}x`;
        e.subscriptionAt = sub.asOf;
      }),
  );
  return out;
}

// ---- the subscription, from NSE ---------------------------------------------------
//
// NSE's issue page carries two tables: bidDetails (bids on NSE alone) and
// activeCat (NSE and BSE together, "Updated as on …"). Only the second is the
// issue's subscription; the first runs at roughly half of it. NSE refreshes it
// through the bidding day and posts the day's final figure at about 19:00 IST.
//
// When it is read (IST), per issue, from the store so every reader shares it:
//   a bidding day, 10:00–19:30   every 15 minutes
//   after the last bidding day   until the final figure is in, every 15 minutes
//   otherwise                    never (the kept figure stands)

const SUB_KEY = (id: string) => `ipo:sub:v2:${id}`;
const SUB_EVERY_MS = 15 * 60_000;

interface KeptSubscription {
  total: number;
  /** NSE's own "as on" time, ISO. */
  asOf: string | null;
  categories: Array<{ category: string; times: number }>;
  /** When it was last read here. */
  readAt: number;
}

/** "Updated as on 30-Oct-2026 19:00:00" → ISO (IST). */
function nseAsOf(raw: string | undefined): string | null {
  const m = raw?.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4]}:${m[5]}:${m[6] ?? "00"}+05:30`;
}

const istClock = (now: number) => {
  const d = new Date(now + 5.5 * 3_600_000);
  return { day: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
};

async function subscriptionFor(e: IpoEntry, today: string, now = Date.now()): Promise<KeptSubscription | null> {
  const store = getStore();
  const kept = await store.get<KeptSubscription>(SUB_KEY(e.id)).catch(() => null);
  const { day, minutes } = istClock(now);
  const bidding = !!e.open && !!e.close && day >= e.open && day <= e.close;
  const inHours = minutes >= 10 * 60 && minutes <= 19 * 60 + 30;
  // The last day's figure posted from 18:30 on counts as final.
  const finalIn = !!kept?.asOf && !!e.close && kept.asOf >= `${e.close}T18:30`;
  const due =
    !kept ||
    (bidding && inHours && now - kept.readAt >= SUB_EVERY_MS) ||
    (!!e.close && today > e.close && !finalIn && now - kept.readAt >= SUB_EVERY_MS);
  if (!due) return kept;
  const fresh = await nseSubscription(e.symbol!);
  if (!fresh) return kept;
  const next: KeptSubscription = { ...fresh, readAt: now };
  await store.set(SUB_KEY(e.id), next, { ttlSeconds: 30 * 86_400 }).catch(() => {});
  return next;
}

type NseRow = { category?: string; noOfTime?: string | number; noOfTotalMeant?: string | number };

// The main categories only; NSE nests sub-rows under each.
const CATEGORIES: Array<[RegExp, string]> = [
  [/^Qualified Institutional/i, "QIB"],
  [/^Non Institutional Investors$/i, "NII"],
  [/more than Ten Lakh/i, "bNII (>₹10L)"],
  [/Two Lakh Rupees upto Ten/i, "sNII (₹2–10L)"],
  [/^Retail Individual/i, "Retail"],
  [/^Employee/i, "Employees"],
  [/^Shareholder/i, "Shareholders"],
  [/^Total$/i, "Total"],
];

/** Category-wise times subscribed from NSE's consolidated table (NSE's own table only if that is missing). */
function categoriesOf(d: NseDetail): { categories: Array<{ category: string; times: number }>; asOf: string | null } {
  const consolidated = (d.activeCat?.dataList ?? []).filter((r) => r.srNo !== "Sr.No.");
  const rows: NseRow[] = consolidated.length ? consolidated : (d.bidDetails ?? []);
  const categories: Array<{ category: string; times: number }> = [];
  for (const [re, label] of CATEGORIES) {
    const row = rows.find((r) => re.test(r.category ?? ""));
    const times = num(String(row?.noOfTotalMeant ?? row?.noOfTime ?? ""));
    if (row && times !== null && !categories.some((c) => c.category === label)) categories.push({ category: label, times });
  }
  return { categories, asOf: consolidated.length ? nseAsOf(d.activeCat?.updateTime) : null };
}

async function nseDetail(symbol: string): Promise<NseDetail | null> {
  try {
    const res = await fetch(`https://www.nseindia.com/api/ipo-detail?symbol=${encodeURIComponent(symbol)}&series=EQ`, {
      headers: NSE_HEADERS,
      // The schedule above decides when to read.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as NseDetail) : null;
  } catch {
    return null;
  }
}

/** NSE's consolidated subscription for an issue, or null. */
async function nseSubscription(symbol: string): Promise<Omit<KeptSubscription, "readAt"> | null> {
  const d = await nseDetail(symbol);
  if (!d) return null;
  const { categories, asOf } = categoriesOf(d);
  const total = categories.find((c) => c.category === "Total")?.times;
  return total === undefined ? null : { total, asOf, categories };
}

// ---- one IPO in full -------------------------------------------------------------

interface NseDetail {
  bidDetails?: Array<{ category?: string; noOfTime?: string | number; noOfSharesOffered?: string; noOfsharesBid?: string }>;
  /** NSE and BSE bids together; the first row repeats the column names. */
  activeCat?: { updateTime?: string; dataList?: Array<{ category?: string; noOfTotalMeant?: string; srNo?: string | null }> };
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
    const d = await nseDetail(entry.symbol);
    if (d) {
      const read = categoriesOf(d);
      subscription = read.categories;
      const keep = /^(Issue Size|Issue Type|Price Range|Face Value|Bid Lot|Minimum Order Quantity|Maximum Subscription Amount for Retail|Book Running Lead Managers|Name of the Registrar|IPO Market Timings|Discount)/i;
      for (const row of d.issueInfo?.dataList ?? []) {
        const title = clean(row.title);
        const value = clean(row.value);
        if (!title || !value) continue;
        const link = String(row.value ?? "").match(/https?:\/\/[^\s"<>]+\.(?:zip|pdf)/i)?.[0];
        if (link && /Prospectus|Anchor|Ratios/i.test(title)) documents.push({ label: title, url: link });
        else if (keep.test(title)) facts.push({ label: title.replace(/for Retail I.*$/i, "(retail)"), value: value.slice(0, 220) });
      }
      subscriptionUpdated = subscription.length > 0 ? (read.asOf ?? new Date().toISOString()) : null;
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
