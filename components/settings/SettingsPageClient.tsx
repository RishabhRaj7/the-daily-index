"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreditCard, F1RosterEntry, Personalization } from "@/lib/types";
import {
  DEFAULT_PERSONALIZATION,
  loadPersonalization,
  savePersonalization,
} from "@/lib/personalization";
import PersonalizationForm from "@/components/onboarding/PersonalizationForm";

export default function SettingsPageClient({
  creditCards,
  f1Roster,
}: {
  creditCards: CreditCard[];
  f1Roster: F1RosterEntry[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Personalization>(DEFAULT_PERSONALIZATION);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(loadPersonalization());
  }, []);

  const handleSave = () => {
    savePersonalization({ ...draft, onboarded: true });
    setSaved(true);
    // Full navigation so the server re-reads the freshly written cookies.
    // router.push("/") uses the RSC router cache and would return stale data.
    setTimeout(() => { window.location.href = "/"; }, 500);
  };

  return (
    <main className="flex-1 max-w-2xl mx-auto px-4 py-10">
      <div className="font-label text-xs text-masthead-red mb-1">Settings</div>
      <h1 className="font-headline text-4xl font-semibold mb-1">
        Make it yours
      </h1>
      <p className="text-ink-soft italic mb-6">
        Change anything, anytime — nothing here is permanent.
      </p>

      <PersonalizationForm
        value={draft}
        onChange={setDraft}
        creditCards={creditCards}
        f1Roster={f1Roster}
      />

      <div className="flex justify-between items-center mt-6 pt-4 border-t hairline">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-sm underline text-ink-soft"
        >
          ← Discard changes
        </button>
        <button
          onClick={handleSave}
          className="font-label text-xs px-4 py-2 bg-masthead-red text-paper rounded-sm"
        >
          {saved ? "Saved ✓" : "Save changes"}
        </button>
      </div>
    </main>
  );
}
