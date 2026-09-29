import { getIpoDetail } from "@/lib/live/ipos";

// GET /api/ipos/:id — one IPO in full: category-wise subscription (NSE),
// issue details and documents, the GMP trend and listing-day prices.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{2,60}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const detail = await getIpoDetail(id).catch(() => null);
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(detail, { headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } });
}
