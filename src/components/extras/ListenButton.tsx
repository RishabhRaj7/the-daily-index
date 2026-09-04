"use client";

import { useEffect, useState } from "react";
import type { Edition } from "@/lib/types";
import { allStories } from "@/lib/format";

function editionToScript(edition: Edition): string {
  const stories = allStories(edition);
  const parts = [
    `The Daily Index. ${edition.date}. ${stories.length} stories, today's edition.`,
  ];
  for (const s of stories) {
    parts.push(`${s.headline}. ${s.deck}.`);
    parts.push(s.body.join(" "));
  }
  return parts.join(" ");
}

export default function ListenButton({ edition }: { edition: Edition }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!supported) return null;

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(editionToScript(edition));
    utterance.rate = 0.98;
    utterance.pitch = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  };

  return (
    <button
      onClick={toggle}
      className="font-label text-xs px-3 py-1.5 border hairline rounded-sm hover:bg-card-bg transition-colors flex items-center gap-2"
    >
      <span aria-hidden="true">{speaking ? "◼" : "▶"}</span>
      {speaking ? "Stop reading" : "Listen to today's edition"}
    </button>
  );
}
