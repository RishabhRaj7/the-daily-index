import { batchSummarize, generateEditionBrief } from "@/lib/live/summarize";

export async function POST(req: Request) {
  try {
    const { articles } = await req.json();
    if (!Array.isArray(articles) || articles.length === 0) {
      return Response.json({ summaries: {}, brief: null });
    }
    const map = await batchSummarize(articles);
    const brief = await generateEditionBrief(articles, map);
    return Response.json({ summaries: Object.fromEntries(map), brief });
  } catch {
    return Response.json({ summaries: {}, brief: null }, { status: 500 });
  }
}
