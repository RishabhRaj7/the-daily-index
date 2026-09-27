"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Story } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";

// Share a story as a picture. The button opens a sheet with the card we
// render for it (headline, summary, why it matters, source — set in the
// paper's own type), and the reader picks what to do with it: the phone's
// share sheet, copy the image, download it, or send the link to an app.

type Status = "idle" | "rendering" | "ready" | "failed";

function todayLabel(): string {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function ShareCard({ story, cardRef }: { story: Story; cardRef: React.RefObject<HTMLDivElement | null> }) {
  const meta = SECTION_META[story.section];
  const hue = meta?.hue ?? "var(--accent)";
  const summary = story.body[0] ?? "";
  return (
    <div
      ref={cardRef}
      className="w-[540px] bg-paper text-ink p-10 flex flex-col"
      style={{ minHeight: 675, ["--section-hue" as string]: hue }}
    >
      <div className="flex items-center justify-between font-mono text-[11px] text-ink-soft">
        <span className="font-display font-extrabold text-[22px] text-ink tracking-tight">The Daily Index</span>
        <span>{todayLabel().toUpperCase()}</span>
      </div>
      <div className="h-[3px] mt-4" style={{ background: hue }} />
      {meta && (
        <div className="font-label text-[11px] mt-6" style={{ color: hue }}>
          {meta.kicker}
        </div>
      )}
      <h2 className="font-headline text-[42px] leading-[1.04] tracking-[-0.02em] mt-3">{story.headline}</h2>
      {summary && <p className="font-body text-[17px] leading-[1.55] text-ink/85 mt-6 line-clamp-[9]">{summary}</p>}
      {story.why && (
        <div className="why-line mt-5 pl-4 border-l-2" style={{ borderColor: hue }}>
          <div className="font-label text-[9px] text-ink-soft">Why it matters</div>
          <p className="font-headline italic text-[16px] leading-snug mt-1">{story.why}</p>
        </div>
      )}
      <div className="mt-auto pt-8 flex items-center justify-between font-mono text-[11px] text-ink-soft border-t hairline">
        <span className="pt-4">{story.sourceName ? `SOURCE · ${story.sourceName.toUpperCase()}` : ""}</span>
        <span className="pt-4 flex gap-[3px]" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: i === 2 ? hue : "var(--ink)" }} />
          ))}
        </span>
      </div>
    </div>
  );
}

const APPS: Array<{ id: string; label: string; href: (text: string, url: string) => string }> = [
  { id: "whatsapp", label: "WhatsApp", href: (t, u) => `https://wa.me/?text=${encodeURIComponent(`${t}\n${u}`)}` },
  { id: "x", label: "X", href: (t, u) => `https://x.com/intent/post?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { id: "linkedin", label: "LinkedIn", href: (_t, u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  { id: "telegram", label: "Telegram", href: (t, u) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
];

export default function ShareButton({ story, className = "" }: { story: Story; className?: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const filename = `daily-index-${story.id}.png`;
  const link = story.sourceUrl ?? (typeof window !== "undefined" ? window.location.href : "");

  const render = useCallback(async () => {
    const node = cardRef.current;
    if (!node) return;
    setStatus("rendering");
    try {
      await document.fonts?.ready;
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
      });
      if (!blob) throw new Error("empty image");
      setImage({ url: URL.createObjectURL(blob), blob });
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  }, []);

  // Render once the sheet (and the hidden card inside it) is on the page.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => void render());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open, render]);

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const file = image ? new File([image.blob], filename, { type: "image/png" }) : null;
  const canNativeShare =
    typeof navigator !== "undefined" && !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  const nativeShare = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: story.headline, text: `${story.headline} ${link}` });
    } catch {
      /* dismissed */
    }
  };
  const copyImage = async () => {
    if (!image) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image.blob })]);
      flash("Image copied");
    } catch {
      flash("Your browser won't copy images — download it instead");
    }
  };
  const download = () => {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image.url;
    a.download = filename;
    a.click();
    flash("Saved");
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      flash("Link copied");
    } catch {
      flash("Couldn't copy the link");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-ink-soft hover:text-ink transition-colors ${className}`}
        data-clip-ignore="true"
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 10V2.5M5 5.2 8 2.3l3 2.9" />
          <path d="M3 8.5v4.2c0 .5.4.8.8.8h8.4c.5 0 .8-.3.8-.8V8.5" />
        </svg>
        Share
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm animate-[fade-in_0.25s_ease]"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Share this story"
          >
            <div
              className="relative w-full sm:max-w-[760px] max-h-[92vh] overflow-y-auto bg-surface text-ink rounded-t-3xl sm:rounded-3xl border hairline shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] p-5 sm:p-7 animate-[sheet-up_0.45s_var(--ease-out)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display font-extrabold text-[2rem] leading-none">Share</h2>
                <button type="button" onClick={() => setOpen(false)} className="icon-btn" aria-label="Close">
                  <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>

              <div className="grid sm:grid-cols-[minmax(0,1fr)_240px] gap-6 items-start">
                <div className="rounded-2xl overflow-hidden border hairline bg-paper aspect-[4/5] grid place-items-center">
                  {status === "ready" && image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt={`Share card: ${story.headline}`} className="w-full h-full object-contain animate-[fade-in_0.4s_ease]" />
                  ) : status === "failed" ? (
                    <div className="text-center p-6">
                      <p className="font-headline italic text-lg">The card didn&rsquo;t develop.</p>
                      <button type="button" onClick={() => void render()} className="chip mt-4">
                        Try again
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 font-mono text-[11px] text-ink-soft">
                      <span className="live-dot text-accent" /> SETTING THE CARD…
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {canNativeShare && (
                    <button type="button" onClick={nativeShare} className="chip chip-signal h-11 justify-center">
                      Share image…
                    </button>
                  )}
                  <button type="button" onClick={copyImage} disabled={status !== "ready"} className="chip h-11 justify-center">
                    Copy image
                  </button>
                  <button type="button" onClick={download} disabled={status !== "ready"} className="chip h-11 justify-center">
                    Download PNG
                  </button>
                  <div className="font-label text-[9px] text-ink-soft mt-3 mb-1">Send the link</div>
                  <div className="grid grid-cols-2 gap-2">
                    {APPS.map((app) => (
                      <a
                        key={app.id}
                        href={app.href(story.headline, link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="chip h-10 justify-center"
                      >
                        {app.label}
                      </a>
                    ))}
                  </div>
                  <button type="button" onClick={copyLink} className="chip h-10 justify-center">
                    Copy link
                  </button>
                  <p className="font-body text-[12px] text-ink-soft leading-snug mt-2">
                    Apps get the link to the original story. To send the card itself, copy or download the image.
                  </p>
                </div>
              </div>

              {toast && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-5 chip chip-signal pointer-events-none animate-[pop-in_0.3s_var(--ease-out)]">
                  {toast}
                </div>
              )}

              {/* The card being photographed: laid out off-screen at print size. */}
              <div aria-hidden="true" className="fixed -left-[10000px] top-0 pointer-events-none">
                <ShareCard story={story} cardRef={cardRef} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
