"use client";

import { loadPersonalization, savePersonalization } from "./personalization";
import { loadDigestPreferences, PREFERENCES_STORAGE_KEY, saveDigestPreferences } from "./preferences/storage";
import { MEMORY_KEY } from "./reader-memory";
import { mergeMemory, SYNC_KEY, type SyncChanges, type SyncDoc, type SyncProfile } from "./sync-shared";
import type { ReaderMemory } from "./types";

// Sync across devices, the browser's side (the server's: app/api/sync).
//
// The page keeps reading and writing localStorage as it always has; this
// watches it. Every few seconds it compares each synced document with what
// was last synced and marks the fields that changed; those go to the server
// in the next exchange, which also brings back what other devices changed.
// A field changed here and not yet sent always wins over what comes back,
// so nothing typed on this device is lost to a slower sync. Applied values
// go through the paper's own save functions, so the page updates (and the
// cookies the server reads for sports and Reddit are set) as if the reader
// had made the change here.

const STATE_KEY = "daily-index:sync";
export const SYNC_CHANGED_EVENT = "daily-index:sync-changed";

interface Doc {
  storage: string;
  /** Kept field by field (an object), or whole ("_"). */
  whole?: boolean;
  /** Writes a value that arrived, through the paper's own save path. */
  apply: (raw: string | null) => void;
}

const write = (key: string, raw: string | null) => {
  if (raw === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, raw);
};

const DOCS: Record<SyncDoc, Doc> = {
  personalization: {
    storage: "daily-index:personalization",
    apply: (raw) => {
      write("daily-index:personalization", raw);
      savePersonalization(loadPersonalization());
    },
  },
  preferences: {
    storage: PREFERENCES_STORAGE_KEY,
    apply: (raw) => {
      write(PREFERENCES_STORAGE_KEY, raw);
      saveDigestPreferences(loadDigestPreferences());
    },
  },
  puzzles: { storage: "daily-index:puzzle-desk", whole: true, apply: (raw) => write("daily-index:puzzle-desk", raw) },
};

export interface SyncState {
  key: string;
  linkedAt: string;
  /** The last exchange that went through. */
  lastSync: number | null;
  lastError: string | null;
  /** Each field as last synced (JSON), to spot changes made here. */
  snap: Partial<Record<SyncDoc | "memory", Record<string, string>>>;
  /** When the server stamped each field this device holds. */
  seen: Partial<Record<SyncDoc, Record<string, number>>>;
  /** Fields changed here and not yet sent. */
  dirty: Partial<Record<SyncDoc | "memory", string[]>>;
}

export function loadSync(): SyncState | null {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(window.localStorage.getItem(STATE_KEY) ?? "null") as SyncState | null;
    return s && SYNC_KEY.test(s.key) ? s : null;
  } catch {
    return null;
  }
}

function saveSync(s: SyncState | null) {
  write(STATE_KEY, s ? JSON.stringify(s) : null);
  window.dispatchEvent(new Event(SYNC_CHANGED_EVENT));
}

/** A new secret: 24 random bytes as 32 base64url characters. */
function newKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** This device's documents, field by field, as JSON. */
function fieldsOf(doc: SyncDoc): Record<string, string> {
  const raw = window.localStorage.getItem(DOCS[doc].storage);
  if (DOCS[doc].whole) return { _: raw ?? "null" };
  try {
    const obj = JSON.parse(raw ?? "null") as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, JSON.stringify(v)]));
  } catch {
    return {};
  }
}

function memoryRaw(): string {
  return window.localStorage.getItem(MEMORY_KEY) ?? "null";
}

/** Takes this device as it stands as already synced (joining: the profile's values then arrive). */
function snapshot(s: SyncState) {
  for (const doc of Object.keys(DOCS) as SyncDoc[]) s.snap[doc] = fieldsOf(doc);
  s.snap.memory = { _: memoryRaw() };
}

/** Marks what changed here since the last look. */
function scan(s: SyncState): boolean {
  let any = false;
  const mark = (doc: SyncDoc | "memory", f: string) => {
    const d = (s.dirty[doc] ??= []);
    if (!d.includes(f)) d.push(f);
    any = true;
  };
  for (const doc of Object.keys(DOCS) as SyncDoc[]) {
    const now = fieldsOf(doc);
    const was = (s.snap[doc] ??= {});
    for (const f of new Set([...Object.keys(now), ...Object.keys(was)])) {
      if (now[f] === was[f]) continue;
      if (now[f] === undefined) delete was[f];
      else was[f] = now[f];
      mark(doc, f);
    }
  }
  const mem = memoryRaw();
  if (mem !== s.snap.memory?._) {
    s.snap.memory = { _: mem };
    mark("memory", "_");
  }
  return any;
}

/** What goes up: the current value of every field still waiting. */
function outgoing(s: SyncState): SyncChanges {
  const out: SyncChanges = {};
  for (const doc of Object.keys(DOCS) as SyncDoc[]) {
    const fields = s.dirty[doc];
    if (!fields?.length) continue;
    const now = fieldsOf(doc);
    out.docs ??= {};
    out.docs[doc] = Object.fromEntries(fields.map((f) => [f, now[f] === undefined ? null : JSON.parse(now[f])]));
  }
  if (s.dirty.memory?.length) out.memory = JSON.parse(memoryRaw()) as ReaderMemory | null;
  return out;
}

/** Brings in what other devices changed. */
function applyProfile(s: SyncState, p: SyncProfile) {
  for (const doc of Object.keys(DOCS) as SyncDoc[]) {
    const fields = p.docs[doc];
    if (!fields) continue;
    const seen = (s.seen[doc] ??= {});
    const snap = (s.snap[doc] ??= {});
    const waiting = new Set(s.dirty[doc] ?? []);
    const local = fieldsOf(doc);
    const take: Record<string, string> = {};
    for (const [f, { v, t }] of Object.entries(fields)) {
      if (waiting.has(f) || t <= (seen[f] ?? 0)) continue;
      seen[f] = t;
      const json = JSON.stringify(v);
      snap[f] = json;
      if (local[f] !== json) take[f] = json;
    }
    if (!Object.keys(take).length) continue;
    if (DOCS[doc].whole) {
      DOCS[doc].apply(take._ === "null" ? null : take._);
    } else {
      let obj: Record<string, unknown> = {};
      try {
        obj = (JSON.parse(window.localStorage.getItem(DOCS[doc].storage) ?? "{}") as Record<string, unknown>) ?? {};
      } catch {}
      for (const [f, json] of Object.entries(take)) obj[f] = JSON.parse(json);
      DOCS[doc].apply(JSON.stringify(obj));
    }
    // The save path may tidy the document (defaults, migrations): what it wrote is what's synced.
    s.snap[doc] = { ...fieldsOf(doc), ...Object.fromEntries([...waiting].map((f) => [f, snap[f]])) };
  }
  // Reading memory: the two together (compared in a canonical form: the merge reorders).
  const mine = JSON.parse(memoryRaw()) as ReaderMemory | null;
  const merged = mergeMemory(mine, p.memory);
  if (merged && stable(merged) !== stable(mine)) {
    write(MEMORY_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent("daily-index:memory"));
  }
  s.snap.memory = { _: memoryRaw() };
  // Something here the server hasn't got: up it goes next time.
  if (merged && stable(merged) !== stable(p.memory) && !s.dirty.memory?.length) s.dirty.memory = ["_"];
}

/** JSON with every object's keys in order, so equal data reads equal. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
}

let running: Promise<void> | null = null;

/** One round trip: send what changed here, take what changed elsewhere. */
export function syncNow(opts: { keepalive?: boolean } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    const s = loadSync();
    if (!s) return;
    scan(s);
    const body = outgoing(s);
    const sent = structuredClone(s.dirty);
    saveSync(s);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json", "x-sync-key": s.key },
        body: JSON.stringify(body),
        keepalive: opts.keepalive,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(res.status === 413 ? "Too much to sync" : `The server answered ${res.status}`);
      const profile = (await res.json()) as SyncProfile;
      const now = loadSync();
      if (!now || now.key !== s.key) return; // unlinked meanwhile
      // What was sent is through, unless it changed again since.
      for (const [doc, fields] of Object.entries(sent) as [SyncDoc | "memory", string[]][]) {
        const cur = fieldsOrMemory(doc);
        now.dirty[doc] = (now.dirty[doc] ?? []).filter((f) => !fields.includes(f) || cur[f] !== now.snap[doc]?.[f]);
      }
      applyProfile(now, profile);
      now.lastSync = Date.now();
      now.lastError = null;
      saveSync(now);
    } catch (err) {
      const now = loadSync();
      if (now) {
        now.lastError = err instanceof Error ? err.message : "Offline";
        saveSync(now);
      }
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

function fieldsOrMemory(doc: SyncDoc | "memory"): Record<string, string> {
  return doc === "memory" ? { _: memoryRaw() } : fieldsOf(doc);
}

/** Whether anything here waits to be sent. */
export function hasChanges(): boolean {
  const s = loadSync();
  if (!s) return false;
  const any = scan(s) || Object.values(s.dirty).some((d) => d?.length);
  if (any) saveSync(s);
  return any;
}

/** Turns sync on with a new key, this device's settings as the first copy. */
export async function startSync(): Promise<void> {
  const s: SyncState = { key: newKey(), linkedAt: new Date().toISOString(), lastSync: null, lastError: null, snap: {}, seen: {}, dirty: {} };
  // Everything here goes up.
  scan(s);
  saveSync(s);
  await syncNow();
}

/** Links this device to an existing key: the synced settings replace this device's. */
export async function joinSync(key: string): Promise<void> {
  if (!SYNC_KEY.test(key)) throw new Error("That isn't a sync link.");
  const s: SyncState = { key, linkedAt: new Date().toISOString(), lastSync: null, lastError: null, snap: {}, seen: {}, dirty: {} };
  snapshot(s);
  // Reading memory is merged, not replaced: this device's reading goes up too.
  s.dirty.memory = ["_"];
  saveSync(s);
  await syncNow();
}

/** Stops syncing on this device (its settings stay as they are). */
export function leaveSync() {
  saveSync(null);
}

/** Deletes the synced copy on the server and stops syncing here. */
export async function forgetSync(): Promise<void> {
  const s = loadSync();
  if (s) await fetch("/api/sync", { method: "DELETE", headers: { "x-sync-key": s.key } }).catch(() => {});
  saveSync(null);
}

/** The link that joins another device (the key rides in the fragment, which never reaches a server). */
export function syncLink(key: string): string {
  return `${window.location.origin}/settings#sync=${key}`;
}

/** A key from a pasted link or code. */
export function keyFrom(text: string): string | null {
  const t = text.trim();
  const m = /#sync=([A-Za-z0-9_-]{32})/.exec(t) ?? /^([A-Za-z0-9_-]{32})$/.exec(t);
  return m ? m[1] : null;
}
