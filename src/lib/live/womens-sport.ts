// The reader follows men's football, tennis and F1 only: women's sport is
// left out of the sports wires and the odds. Most stories say so in words
// (WSL, Lionesses, "women's"); tennis often doesn't ("Rybakina wins in
// Wuhan"), so the WTA's top 150 by name (ESPN's rankings, refreshed daily)
// fills the gap. A surname an ATP player shares is not used on its own.

const WORDS =
  /\b(women'?s?|womens|female|ladies|girls|wsl|nwsl|liga f|lionesses|matildas|frauen|f[ée]minine|wta|w(15|25|35|50|75|100)|game changers|f1 academy|she ?believes|uswnt|wwc)\b/i;

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/tennis";

interface Ranks { rankings?: Array<{ ranks?: Array<{ athlete?: { firstName?: string; lastName?: string } }> }> }

async function names(tour: "atp" | "wta"): Promise<Array<{ first: string; last: string }>> {
  try {
    const res = await fetch(`${ESPN}/${tour}/rankings`, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const body = (await res.json()) as Ranks;
    return (body.rankings?.[0]?.ranks ?? [])
      .map((r) => ({ first: r.athlete?.firstName ?? "", last: r.athlete?.lastName ?? "" }))
      .filter((n) => n.last.length >= 3);
  } catch {
    return [];
  }
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let cached: { at: number; re: RegExp | null } | null = null;

/** WTA players by full name, or by a surname no ATP player shares. */
async function wtaPattern(): Promise<RegExp | null> {
  if (cached && Date.now() - cached.at < 6 * 3_600_000) return cached.re;
  const [wta, atp] = await Promise.all([names("wta"), names("atp")]);
  const atpLast = new Set(atp.map((n) => fold(n.last)));
  const terms = new Set<string>();
  for (const n of wta) {
    terms.add(escape(fold(`${n.first} ${n.last}`)));
    if (!atpLast.has(fold(n.last)) && n.last.length >= 5) terms.add(escape(fold(n.last)));
  }
  const re = terms.size ? new RegExp(`\\b(${[...terms].join("|")})\\b`, "i") : null;
  cached = { at: Date.now(), re };
  return re;
}

/** A filter for the sports wires and the odds: true for women's sport. */
export async function womensSportTest(): Promise<(text: string) => boolean> {
  const re = await wtaPattern().catch(() => null);
  return (text: string) => WORDS.test(text) || (!!re && re.test(fold(text)));
}

/** The wording test alone, for code that can't wait on the rankings. */
export const saysWomens = (text: string) => WORDS.test(text);
