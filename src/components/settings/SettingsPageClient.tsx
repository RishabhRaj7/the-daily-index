"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreditCard, F1RosterEntry, Personalization } from "@/lib/types";
import {
  DEFAULT_PERSONALIZATION,
  loadPersonalization,
  savePersonalization,
} from "@/lib/personalization";
import PersonalizationForm from "@/components/onboarding/PersonalizationForm";
import RedditConnect from "@/components/settings/RedditConnect";
import Link from "next/link";
import { clearMemory, loadMemory } from "@/lib/reader-memory";
import { SETTINGS_RETURN_KEY } from "@/components/chrome/SettingsLink";

const MAX_SUBS = 8;

export default function SettingsPageClient({
  creditCards,
  f1Roster,
}: {
  creditCards: CreditCard[];
  f1Roster: F1RosterEntry[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Personalization>(DEFAULT_PERSONALIZATION);
  const [baseline, setBaseline] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    const loaded = loadPersonalization();
    setDraft(loaded);
    setBaseline(JSON.stringify(loaded));
    setMemoryCount(loadMemory().visits.length);
  }, []);

  const dirty = useMemo(
    () => baseline !== "" && JSON.stringify(draft) !== baseline,
    [draft, baseline],
  );

  // Discard the draft and close settings. Going *back* restores the paper
  // from the router's cache instantly; pushing "/" would re-run the whole
  // server render (fetching every feed again), which reads like a reload.
  const handleClose = () => {
    if (baseline) {
      try {
        setDraft(JSON.parse(baseline) as Personalization);
      } catch {}
    }
    let cameFromPaper = false;
    try {
      cameFromPaper = sessionStorage.getItem(SETTINGS_RETURN_KEY) === "back";
      sessionStorage.removeItem(SETTINGS_RETURN_KEY);
    } catch {}
    if (cameFromPaper && window.history.length > 1) router.back();
    else router.push("/");
  };

  const handleSave = () => {
    savePersonalization({ ...draft, onboarded: true });
    setSaved(true);
    // Full navigation so the server re-reads the freshly written cookies.
    // router.push("/") uses the RSC router cache and would return stale data.
    setTimeout(() => { window.location.href = "/"; }, 600);
  };

  const handleImportSubs = (subs: string[]) => {
    const clean = subs
      .map((s) => s.replace(/^r\//i, "").trim().toLowerCase())
      .filter((s) => /^[a-z0-9_]{3,21}$/.test(s) && !draft.subreddits.includes(s));
    if (clean.length === 0) return;
    setDraft((d) => ({
      ...d,
      subreddits: [...d.subreddits, ...clean].slice(0, MAX_SUBS),
    }));
  };

  return (
    <main className="flex-1 max-w-2xl mx-auto px-4 py-10 pb-28 w-full">
      <div className="font-label text-xs text-masthead-red mb-1">Settings</div>
      <h1 className="font-headline text-4xl font-semibold mb-1">
        Make it yours
      </h1>
      <p className="font-headline italic text-ink-soft mb-8 text-lg">
        Five decisions. Each one visibly changes tomorrow&rsquo;s front page.
      </p>

      <PersonalizationForm
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setSaved(false);
        }}
        creditCards={creditCards}
        f1Roster={f1Roster}
        redditPanel={<RedditConnect onImport={handleImportSubs} />}
      />

      <section className="mt-10 border-t-2 border-ink pt-4">
        <div className="font-label text-[10px] text-masthead-red mb-1">What the paper remembers</div>
        <p className="font-body text-sm text-ink-soft leading-relaxed">
          Your reading streak, which editions you opened, and which stories you unfolded are kept in
          this browser only — never uploaded. They power the Editor&rsquo;s Desk note, the gentle
          story re-ranking, and{" "}
          <Link href="/archive" className="text-masthead-red underline underline-offset-2">
            the Morgue
          </Link>
          .
        </p>
        <div className="flex items-center gap-4 mt-3">
          <span className="font-mono text-xs text-ink-soft">
            {forgot ? "Memory cleared." : `${memoryCount} issue${memoryCount === 1 ? "" : "s"} on record`}
          </span>
          {!forgot && memoryCount > 0 && (
            <button
              type="button"
              onClick={() => {
                clearMemory();
                setForgot(true);
                setMemoryCount(0);
              }}
              className="font-label text-[10px] text-masthead-red underline"
            >
              Forget me
            </button>
          )}
        </div>
      </section>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t hairline bg-paper/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="text-sm underline text-ink-soft"
          >
            ← {dirty ? "Discard changes" : "Back to the paper"}
          </button>
          <span className="font-mono text-[11px] text-ink-soft hidden sm:block">
            {saved ? "Saved — reprinting…" : dirty ? "Unsaved changes" : "Everything saved"}
          </span>
          <button
            onClick={handleSave}
            disabled={!dirty || saved}
            className="font-label text-xs px-5 py-2.5 bg-masthead-red text-paper rounded-sm disabled:opacity-40 transition-opacity"
          >
            {saved ? "Saved ✓" : "Save & reprint →"}
          </button>
        </div>
      </div>
    </main>
  );
}
