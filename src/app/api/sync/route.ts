import { createHash } from "node:crypto";
import { getStore } from "@/lib/server/store";
import { mergeMemory, SYNC_DOCS, SYNC_KEY, type SyncChanges, type SyncDoc, type SyncProfile } from "@/lib/sync-shared";

// POST   /api/sync   send this device's changes, get the whole profile back
// DELETE /api/sync   forget the synced profile (every device stops receiving)
//
// The sync key comes in a header (x-sync-key), never in the address, and is
// kept only as a hash: the key is the reader's secret, held by their devices.
// One round trip does both directions: the server stamps the fields that
// arrive, merges reading memory, keeps the profile a year from its last
// change, and answers with all of it (lib/sync-shared.ts).

export const dynamic = "force-dynamic";

const KEEP_SECONDS = 400 * 86_400;
const MAX_BYTES = 512 * 1024;
const slot = (key: string) => `sync:v1:${createHash("sha256").update(key).digest("hex")}`;
const EMPTY: SyncProfile = { docs: {}, memory: null, at: 0 };

function keyOf(req: Request): string | null {
  const k = req.headers.get("x-sync-key") ?? "";
  return SYNC_KEY.test(k) ? k : null;
}

export async function POST(req: Request) {
  const key = keyOf(req);
  if (!key) return Response.json({ error: "key" }, { status: 400 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  let changes: SyncChanges;
  try {
    changes = raw ? (JSON.parse(raw) as SyncChanges) : {};
  } catch {
    return Response.json({ error: "body" }, { status: 400 });
  }

  const store = getStore();
  const profile: SyncProfile = (await store.get<SyncProfile>(slot(key)).catch(() => null)) ?? structuredClone(EMPTY);
  const now = Date.now();
  let changed = false;
  for (const [doc, fields] of Object.entries(changes.docs ?? {})) {
    if (!SYNC_DOCS.includes(doc as SyncDoc) || !fields || typeof fields !== "object") continue;
    const kept = (profile.docs[doc as SyncDoc] ??= {});
    for (const [f, v] of Object.entries(fields)) {
      kept[f] = { v: v ?? null, t: now };
      changed = true;
    }
  }
  if (changes.memory) {
    profile.memory = mergeMemory(profile.memory, changes.memory);
    changed = true;
  }
  if (changed) {
    profile.at = now;
    if (JSON.stringify(profile).length > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });
    await store.set(slot(key), profile, { ttlSeconds: KEEP_SECONDS });
  }
  return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request) {
  const key = keyOf(req);
  if (!key) return Response.json({ error: "key" }, { status: 400 });
  await getStore().del(slot(key));
  return new Response(null, { status: 204 });
}
