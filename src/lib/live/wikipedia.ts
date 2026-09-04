// Real, freely-licensed circuit images straight from Wikipedia's own REST
// API — no scraping, no third-party image service.
export async function getWikipediaThumbnail(
  wikipediaUrl: string,
): Promise<string | undefined> {
  try {
    const title = decodeURIComponent(wikipediaUrl.split("/wiki/")[1] ?? "");
    if (!title) return undefined;

    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return undefined;
    const json = await res.json();
    return json?.thumbnail?.source as string | undefined;
  } catch {
    return undefined;
  }
}
