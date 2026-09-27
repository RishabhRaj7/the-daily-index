"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
  // Capability check: false on the server, the real answer in the browser.
  const supported = useSyncExternalStore(
    () => () => {},
    () => "speechSynthesis" in window,
    () => false,
  );

  useEffect(() => {
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
    <button onClick={toggle} className="chip" aria-pressed={speaking}>
      {speaking ? (
        <span className="flex items-end gap-[2px] h-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="w-[2px] bg-current rounded-full animate-[eq_0.9s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.15}s`, height: "100%" }}
            />
          ))}
        </span>
      ) : (
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" aria-hidden="true">
          <path d="M3 1.8v8.4c0 .4.4.6.7.4l6.6-4.2c.3-.2.3-.6 0-.8L3.7 1.4c-.3-.2-.7 0-.7.4Z" />
        </svg>
      )}
      {speaking ? "Stop" : "Listen"}
    </button>
  );
}
