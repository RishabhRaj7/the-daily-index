"use client";

import { useEffect, useState } from "react";
import type { CreditCard, F1RosterEntry, Personalization } from "@/lib/types";
import {
  DEFAULT_PERSONALIZATION,
  loadPersonalization,
  savePersonalization,
} from "@/lib/personalization";
import PersonalizationForm from "./PersonalizationForm";

export default function OnboardingGate({
  creditCards,
  f1Roster,
}: {
  creditCards: CreditCard[];
  f1Roster: F1RosterEntry[];
}) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Personalization>(DEFAULT_PERSONALIZATION);

  useEffect(() => {
    const existing = loadPersonalization();
    if (!existing.onboarded) {
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
      <div className="bg-paper text-ink border hairline rounded-sm max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="font-label text-xs text-masthead-red mb-1">
          Before your first edition
        </div>
        <h2 className="font-headline text-2xl font-semibold mb-4">
          A few quiet details, so this reads like it&rsquo;s yours
        </h2>

        <PersonalizationForm
          value={draft}
          onChange={setDraft}
          creditCards={creditCards}
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
            className="font-label text-xs px-4 py-2 bg-masthead-red text-paper rounded-sm"
          >
            Start reading
          </button>
        </div>
      </div>
    </div>
  );
}
