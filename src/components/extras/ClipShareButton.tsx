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
      className="font-label text-[10px] px-2 py-1 border hairline rounded-sm hover:bg-card-bg transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap"
      title="Save this story as a shareable image"
    >
      {busy ? "Clipping…" : "Clip & Share"}
    </button>
  );
}
