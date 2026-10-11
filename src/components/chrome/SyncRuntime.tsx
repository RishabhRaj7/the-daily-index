"use client";

import { useEffect } from "react";
import { hasChanges, loadSync, syncNow } from "@/lib/sync";

// Keeps a linked device in step (lib/sync.ts): an exchange when the page
// opens and whenever it comes back into view, one a few seconds after a
// change here, a quiet one every couple of minutes while it's open, and a
// last one as the page is put away. On a device that isn't linked it only
// looks, every few seconds, whether it has been.

const LOOK_MS = 4_000;
const QUIET_MS = 120_000;

export default function SyncRuntime() {
  useEffect(() => {
    // Checked each time: sync can be turned on or off while the page is open.
    let last = 0;
    const go = (keepalive = false) => {
      last = Date.now();
      void syncNow({ keepalive });
    };
    if (loadSync()) go();
    const timer = setInterval(() => {
      if (!loadSync()) return;
      // A change here goes up whether the page is in view or not; the quiet
      // check for changes elsewhere waits until it is.
      if (hasChanges()) go();
      else if (document.visibilityState === "visible" && Date.now() - last > QUIET_MS) go();
    }, LOOK_MS);
    const onVisible = () => {
      if (!loadSync()) return;
      if (document.visibilityState === "visible") go();
      else if (hasChanges()) go(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
