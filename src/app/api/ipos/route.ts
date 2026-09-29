import { getIpoBoard } from "@/lib/live/ipos";

// GET /api/ipos — the IPO watch board: mainboard IPOs from announcement to
// two days after listing, with GMP (unofficial) and key dates.
export const dynamic = "force-dynamic";

export async function GET() {
  const board = await getIpoBoard().catch(() => []);
  return Response.json(
    { ipos: board, at: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
