import { NextResponse } from "next/server";
import { clearRedditConnection } from "@/lib/reddit-auth";

export const dynamic = "force-dynamic";

// POST /api/reddit/disconnect — forgets the Reddit account entirely.
export async function POST() {
  await clearRedditConnection();
  const res = NextResponse.json({ ok: true });
  res.cookies.set("daily-index:reddit", "", { path: "/", maxAge: 0 });
  return res;
}
