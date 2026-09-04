"use client";

import { useCallback, useEffect, useState } from "react";

interface Status {
  configured: boolean;
  connected: boolean;
  username?: string;
  subCount?: number;
}

// Login-with-Reddit panel for Settings → The Grapevine. Connects the reader's
// actual account so the column reads their subscriptions; the hand-picked
// subreddit list below keeps working and always wins ties.
export default function RedditConnect({
  onImport,
}: {
  onImport: (subs: string[]) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"import" | "disconnect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reddit/status")
      .then((r) => r.json())
      .then((s: Status) => setStatus(s))
      .catch(() => setStatus({ configured: true, connected: false }));
    // One-line confirmation after the OAuth round-trip.
    const params = new URLSearchParams(window.location.search);
    if (params.get("reddit") === "connected") {
      setMessage("Reddit account connected — your subscriptions now feed the column.");
      window.history.replaceState(null, "", window.location.pathname);
    } else if (params.get("reddit") === "error") {
      setMessage("Reddit connection failed — nothing changed. You can retry below.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const handleImport = useCallback(async () => {
    setBusy("import");
    setMessage(null);
    try {
      const r = await fetch("/api/reddit/subscriptions");
      const data = (await r.json()) as { connected: boolean; subs: string[] };
      if (!data.connected || data.subs.length === 0) {
        setMessage("Couldn't read your subscriptions — try again in a minute.");
      } else {
        onImport(data.subs);
        setMessage(
          `Imported ${data.subs.length} subscription${data.subs.length === 1 ? "" : "s"} into your list below — save to reprint.`,
        );
      }
    } catch {
      setMessage("Couldn't reach Reddit — try again in a minute.");
    }
    setBusy(null);
  }, [onImport]);

  const handleDisconnect = useCallback(async () => {
    setBusy("disconnect");
    try {
      await fetch("/api/reddit/disconnect", { method: "POST" });
    } catch {
      /* server clears what it can; UI state is what matters here */
    }
    setStatus({ configured: true, connected: false });
    setMessage("Reddit account disconnected — the column falls back to your list below.");
    setBusy(null);
  }, []);

  if (!status) {
    return <p className="text-[11px] text-ink-soft italic">Checking Reddit connection…</p>;
  }

  if (!status.configured) {
    return (
      <div className="text-[11px] text-ink-soft leading-relaxed space-y-1.5">
        <p>
          Reddit login isn&rsquo;t switched on yet. It activates automatically once the server has{" "}
          <span className="font-mono">REDDIT_CLIENT_ID</span> and{" "}
          <span className="font-mono">REDDIT_CLIENT_SECRET</span> set — free from{" "}
          <span className="font-mono">reddit.com/prefs/apps</span> (create a &ldquo;web app&rdquo;).
        </p>
        <p>
          One more field matters: the app&rsquo;s <em>redirect uri</em> must be exactly{" "}
          <span className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}/api/reddit/callback</span>.
          The hand-picked list below works regardless.
        </p>
      </div>
    );
  }

  return (
    <div>
      {status.connected ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-label text-[11px] text-up">Connected · u/{status.username}</span>
          <span className="font-mono text-[11px] text-ink-soft">
            {status.subCount} subscription{status.subCount === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={handleImport}
            disabled={busy !== null}
            className="font-label text-[10px] text-masthead-red underline underline-offset-2 disabled:opacity-50"
          >
            {busy === "import" ? "Importing…" : "Import my subscriptions ↓"}
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy !== null}
            className="font-label text-[10px] text-ink-soft underline underline-offset-2 disabled:opacity-50"
          >
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <a
            href="/api/reddit/connect"
            className="font-label text-[11px] px-3 py-1.5 border hairline rounded-sm hover:bg-card-bg transition-colors"
          >
            Connect your Reddit account →
          </a>
          <span className="text-[11px] text-ink-soft">
            Read-only. The column follows your subscriptions; tokens stay on the server.
          </span>
        </div>
      )}
      {message && <p className="text-[11px] text-ink-soft italic mt-2">{message}</p>}
    </div>
  );
}
