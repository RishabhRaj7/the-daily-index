"use client";

import { useState } from "react";

export default function ClipShareButton({
  targetId,
  filename,
}: {
  targetId: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);

  const handleClip = async () => {
    const node = document.getElementById(targetId);
    if (!node) return;
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        pixelRatio: 2,
        // The tools themselves shouldn't be in the picture.
        filter: (el) => !(el instanceof HTMLElement && el.dataset.clipIgnore === "true"),
      });
      const link = document.createElement("a");
      link.download = `${filename}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // clipping is a nice-to-have; fail silently if the browser blocks canvas export
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClip}
      disabled={busy}
      data-clip-ignore="true"
      className={`icon-btn shrink-0 ${busy ? "animate-pulse" : "reveal-on-hover"}`}
      title="Save this story as an image"
      aria-label="Save this story as an image"
    >
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 10V2.5M5 5.2 8 2.3l3 2.9" />
        <path d="M3 8.5v4.2c0 .5.4.8.8.8h8.4c.5 0 .8-.3.8-.8V8.5" />
      </svg>
    </button>
  );
}
