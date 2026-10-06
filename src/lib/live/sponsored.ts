// Paid content dressed as news: advertorials, "partner" and sponsored posts.
// Caught on the headline, snippet and URL at the wire, and again on the
// article's own text once it is read (the disclaimer is often only there).
const SPONSORED =
  /\b(?:produced by (?:our |an? )?(?:advertising|commercial|content|brand|marketing) partner|advertorial|sponsored (?:content|post|feature|story|article)|partner(?:ed)? content|paid (?:post|partnership|promotion)|brand ?post|brand ?connect|in association with our partner|this (?:article|content|story) (?:is|was) (?:sponsored|paid for))\b/i;
const SPONSORED_PATH = /\/(?:sponsored|brandpost|brand-post|partner-content|partnercontent|advertorial|brandconnect|brand-connect|spotlight\/brand)(?:\/|-|$)/i;

export function isSponsored(title: string, text: string, url = ""): boolean {
  if (SPONSORED.test(`${title} ${text}`)) return true;
  try {
    return url ? SPONSORED_PATH.test(new URL(url).pathname) : false;
  } catch {
    return false;
  }
}
