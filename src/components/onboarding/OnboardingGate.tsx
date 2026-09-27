"use client";

import { useEffect, useState } from "react";
import type { F1RosterEntry, Personalization } from "@/lib/types";
import {
  DEFAULT_PERSONALIZATION,
  loadPersonalization,
  savePersonalization,
} from "@/lib/personalization";
import PersonalizationForm from "./PersonalizationForm";

export default function OnboardingGate({
  f1Roster,
}: {
  f1Roster: F1RosterEntry[];
}) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Personalization>(DEFAULT_PERSONALIZATION);

  useEffect(() => {
    const existing = loadPersonalization();
    if (!existing.onboarded) {
      // Browser-only saved state is read after the first render so it matches the server HTML.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(existing);
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const finish = (skip: boolean) => {
    const next: Personalization = skip
      ? { ...DEFAULT_PERSONALIZATION, onboarded: true }
      : { ...draft, onboarded: true };
    savePersonalization(next);
    setVisible(false);
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-paper text-ink border hairline rounded-2xl max-w-lg w-full p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto">
        <div className="font-label text-xs text-accent mb-1">
          Before your first edition
        </div>
        <h2 className="font-headline text-2xl font-semibold mb-4">
          A few quiet details, so this reads like it&rsquo;s yours
        </h2>

        <PersonalizationForm
          value={draft}
          onChange={setDraft}
          f1Roster={f1Roster}
        />

        <div className="flex justify-between items-center mt-4">
          <button
            onClick={() => finish(true)}
            className="text-xs underline text-ink-soft"
          >
            Skip for now
          </button>
          <button
            onClick={() => finish(false)}
            className="font-label text-xs px-4 py-2 bg-accent text-accent-ink rounded-full"
          >
            Start reading
          </button>
        </div>
      </div>
    </div>
  );
}
