"use client";

import { useEffect, useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { forgetSync, joinSync, keyFrom, leaveSync, loadSync, startSync, SYNC_CHANGED_EVENT, syncLink, syncNow, type SyncState } from "@/lib/sync";

// Settings → Devices: sync across devices (lib/sync.ts). Off: turn it on, or
// link this device with a link from another. On: when it last synced, a QR
// code and link to add a device, and the way out. Arriving through a sync
// link (/settings#sync=…) asks first: linking replaces this device's settings.

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export default function SyncCard() {
  const [state, setState] = useState<SyncState | null>(null);
  const [offered, setOffered] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const read = () => setState(loadSync());
    read();
    // A sync link: offer to link this device (unless it already is, to that
    // key) — on arrival, or pasted into the address bar of an open page.
    const offer = () => {
      const k = keyFrom(window.location.hash);
      if (k && loadSync()?.key !== k) setOffered(k);
      if (k) window.history.replaceState(null, "", "#devices");
    };
    offer();
    window.addEventListener("hashchange", offer);
    window.addEventListener(SYNC_CHANGED_EVENT, read);
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      window.removeEventListener(SYNC_CHANGED_EVENT, read);
      window.removeEventListener("hashchange", offer);
      clearInterval(t);
    };
  }, []);

  const link = useMemo(() => (state ? syncLink(state.key) : ""), [state]);
  const qr = useMemo(() => (link ? renderSVG(link, { border: 2, whiteColor: "#ffffff", blackColor: "#111113" }) : ""), [link]);

  const run = async (fn: () => Promise<void> | void, done?: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      if (done) setNote(done);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
      setState(loadSync());
    }
  };

  const join = (key: string) =>
    run(async () => {
      await joinSync(key);
      setOffered(null);
      setPaste("");
      // The paper re-reads its settings: simplest is to start afresh.
      window.location.reload();
    });

  return (
    <section className="module space-y-5">
      <div>
        <div className="font-label text-[10px] text-accent mb-1">Sync across devices</div>
        <p className="font-body text-sm text-ink-soft leading-relaxed">
          Keep your paddock, watchlist, topics, section order, news settings, puzzles and reading streak the same on every device you
          read on. Each device keeps its own theme, map view and travel mode.
        </p>
      </div>

      {offered && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--accent)" }}>
          <p className="font-sans text-[14px] font-semibold">Link this device?</p>
          <p className="font-body text-sm text-ink-soft leading-relaxed">
            Its settings will be replaced by the ones on your other devices. Reading history from both is kept.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => join(offered)} className="chip chip-signal h-9 px-4">
              {busy ? "Linking…" : "Link this device"}
            </button>
            <button type="button" disabled={busy} onClick={() => setOffered(null)} className="chip h-9 px-4">
              Not now
            </button>
          </div>
        </div>
      )}

      {!state ? (
        <div className="space-y-4">
          <button type="button" disabled={busy} onClick={() => run(startSync)} className="chip chip-signal h-10 px-5">
            {busy ? "Turning on…" : "Turn on sync"}
          </button>
          <div>
            <label htmlFor="sync-paste" className="font-label text-[10px] text-ink-soft block mb-1.5">
              Already on another device? Paste its sync link
            </label>
            <div className="flex gap-2">
              <input
                id="sync-paste"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="https://…/settings#sync=…"
                className="flex-1 min-w-0 h-10 rounded-full border hairline bg-transparent px-4 font-mono text-[12px] text-ink placeholder:text-ink-faint"
              />
              <button
                type="button"
                disabled={busy || !keyFrom(paste)}
                onClick={() => {
                  const k = keyFrom(paste);
                  if (k) void join(k);
                }}
                className="chip h-10 px-4 disabled:opacity-40"
              >
                Link
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={`font-label text-[11px] ${state.lastError ? "text-down" : "text-up"}`}>
              {state.lastError ? `Not synced · ${state.lastError}` : state.lastSync ? `Synced · ${ago(state.lastSync)}` : "Syncing…"}
            </span>
            <button type="button" disabled={busy} onClick={() => run(() => syncNow())} className="chip h-8 px-3 text-[12px]">
              {busy ? "Syncing…" : "Sync now"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[9.5rem_minmax(0,1fr)] gap-4 items-start">
            {/* generated here from the link; nothing external */}
            <div className="w-[9.5rem] rounded-xl overflow-hidden border hairline bg-white [&>svg]:block [&>svg]:w-full [&>svg]:h-auto" aria-label="QR code for the sync link" role="img" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="space-y-2 min-w-0">
              <p className="font-sans text-[14px] font-semibold">Add a device</p>
              <p className="font-body text-sm text-ink-soft leading-relaxed">Scan the code with the other device, or send yourself the link and open it there.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    });
                  }}
                  className="chip h-8 px-3 text-[12px]"
                >
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button type="button" onClick={() => void navigator.share({ title: "The Daily Index · sync", url: link }).catch(() => {})} className="chip h-8 px-3 text-[12px]">
                    Share link
                  </button>
                )}
              </div>
              <p className="font-mono text-[10.5px] text-ink-faint leading-snug">
                Anyone with this link can see and change your settings. Keep it to your own devices.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 border-t hairline">
            <button type="button" disabled={busy} onClick={() => run(leaveSync, "Sync is off on this device. Its settings stay as they are.")} className="font-label text-[10px] text-ink-soft underline mt-3">
              Stop on this device
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Delete the synced copy? Every device stops syncing; each keeps its settings as they are now.")) void run(forgetSync, "The synced copy is deleted.");
              }}
              className="font-label text-[10px] text-down underline mt-3"
            >
              Delete synced copy
            </button>
          </div>
        </div>
      )}

      {note && <p className="font-mono text-[11px] text-ink-soft">{note}</p>}
    </section>
  );
}
