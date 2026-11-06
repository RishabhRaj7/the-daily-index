"use client";

import { MapPinIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { locateAndLoad } from "@/lib/travel";

// "Use my location": the one place the page asks for the reader's position.
// On success the Postcard section appears at the top of the paper.

export default function TravelButton({
  label = "Travelling? Use my location",
  className = "",
  onDone,
}: {
  label?: string;
  className?: string;
  onDone?: () => void;
}) {
  const [state, setState] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setState("locating");
    setError(null);
    try {
      await locateAndLoad();
      setState("idle");
      onDone?.();
      // Bring the reader to the new section once it has rendered.
      requestAnimationFrame(() =>
        document.getElementById("postcard")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <span className={`inline-flex flex-col gap-1.5 ${className}`}>
      <button type="button" onClick={go} disabled={state === "locating"} className="chip chip-signal disabled:opacity-60">
        <MapPinIcon size={14} weight="bold" aria-hidden="true" />
        {state === "locating" ? "Finding you…" : label}
      </button>
      {error && <span className="font-sans text-[12px] text-down max-w-[36ch]">{error}</span>}
    </span>
  );
}
