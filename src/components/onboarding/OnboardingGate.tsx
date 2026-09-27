"use client";

import { useEffect, useState } from "react";
import type { F1RosterEntry, Personalization } from "@/lib/types";
import {
  DEFAULT_PERSONALIZATION,
  loadPersonalization,
  savePersonalization,
} from "@/lib/personalization";
import PersonalizationForm, { type FormPart } from "./PersonalizationForm";
import { loadDigestPreferences, saveDigestPreferences } from "@/lib/preferences/storage";
import { withSportsSettings } from "@/lib/preferences/paper";
import ParticleWordmark from "@/components/masthead/ParticleWordmark";
import { RisingWords } from "@/components/story/SectionHeader";

// First visit: a full-screen welcome in the paper's own voice, then three
// short steps — where you are, what you follow, how the page is ordered.
// Everything can be skipped; everything can be changed later in Settings.

const STEPS: Array<{ part: FormPart; title: string; blurb: string }> = [
  {
    part: "basics",
    title: "Where are you?",
    blurb: "Your city sets the weather, the sunrise and the local stories.",
  },
  {
    part: "sports",
    title: "What do you follow?",
    blurb: "Pick your sports, your team and your drivers. Their stories lead the sports pages.",
  },
  {
    part: "order",
    title: "How should it read?",
    blurb: "Put the sections in the order you want to meet them each morning.",
  },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5 || h >= 18) return "Good evening.";
  if (h < 12) return "Good morning.";
  return "Good afternoon.";
}

export default function OnboardingGate({ f1Roster }: { f1Roster: F1RosterEntry[] }) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Personalization>(DEFAULT_PERSONALIZATION);
  // 0 = welcome, 1..STEPS.length = the steps.
  const [step, setStep] = useState(0);
  const [hello, setHello] = useState("Hello.");

  useEffect(() => {
    const existing = loadPersonalization();
    if (!existing.onboarded) {
      // Browser-only saved state (and the local clock) is read after the
      // first render so it matches the server HTML.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(existing);
      setHello(greeting());
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [visible]);

  if (!visible) return null;

  const finish = (skip: boolean) => {
    const next: Personalization = skip
      ? { ...DEFAULT_PERSONALIZATION, onboarded: true }
      : { ...draft, onboarded: true };
    savePersonalization(next);
    if (!skip) saveDigestPreferences(withSportsSettings(loadDigestPreferences(), next));
    setVisible(false);
    window.location.reload();
  };

  const current = step > 0 ? STEPS[step - 1] : null;
  const last = step === STEPS.length;

  return (
    <div
      className="fixed inset-0 z-[70] bg-paper text-ink overflow-y-auto animate-[fade-in_0.4s_ease]"
      role="dialog"
      aria-modal="true"
      aria-label="Set up your paper"
    >
      <div className="min-h-full max-w-[1180px] mx-auto px-5 sm:px-8 flex flex-col">
        {/* Top line: the name, progress, a way out. */}
        <div className="flex items-center justify-between gap-4 h-16 border-b hairline">
          <span className="font-display font-extrabold text-[22px] leading-none">The Daily Index</span>
          <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: step === i + 1 ? 28 : 8,
                  background: step > i ? "var(--accent)" : "var(--rule)",
                }}
              />
            ))}
          </div>
          <button type="button" onClick={() => finish(true)} className="font-sans text-[13px] font-semibold text-ink-soft hover:text-ink">
            Skip
          </button>
        </div>

        {step === 0 ? (
          <div className="flex-1 flex flex-col justify-center py-10">
            <div className="h-[140px] sm:h-[220px]">
              <ParticleWordmark
                shapes={[[hello.replace(".", "").toUpperCase()], ["NAMASTE"], ["HELLO"]]}
                label={hello}
                className="h-full"
              />
            </div>
            <div className="grid md:grid-cols-[1.2fr_1fr] gap-10 mt-10 items-end">
              <div data-reveal="fade">
                <h2 className="font-display font-extrabold text-[clamp(2.8rem,8vw,5.5rem)] leading-[0.84]">
                  <RisingWords text="This paper is yours." />
                </h2>
                <p className="font-headline italic text-xl text-ink-soft mt-5 max-w-[46ch]">
                  Every morning it reads the wires, picks what matters to you, and prints one edition, for one
                  reader. Three questions and it knows where to start.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-3 md:items-end lg:justify-end">
                <button type="button" onClick={() => setStep(1)} className="chip chip-signal h-12 px-6 text-[14px]">
                  Set it up · 1 minute →
                </button>
                <button type="button" onClick={() => finish(true)} className="chip h-12 px-6 text-[14px]">
                  Show me today&rsquo;s paper
                </button>
              </div>
            </div>
            <p className="font-mono text-[10px] text-ink-faint mt-10">
              EVERYTHING YOU CHOOSE STAYS ON THIS DEVICE · CHANGE IT ANY TIME IN SETTINGS
            </p>
          </div>
        ) : (
          current && (
            <div className="flex-1 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-x-14 gap-y-8 py-10 md:py-14">
              <div key={step} data-reveal="fade" className="md:sticky md:top-10 h-fit">
                <div className="font-mono text-[11px] text-accent">
                  {String(step).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
                </div>
                <h2 className="font-display font-extrabold text-[clamp(2.8rem,7vw,5.2rem)] leading-[0.84] mt-3">
                  <RisingWords text={current.title} />
                </h2>
                <div className="h-[3px] bg-accent mt-5 rule-draw" />
                <p className="font-headline italic text-xl text-ink-soft mt-5 max-w-[40ch]">{current.blurb}</p>
              </div>
              <div key={`form-${step}`} className="animate-[sheet-up_0.5s_var(--ease-out)]">
                <PersonalizationForm
                  parts={[current.part]}
                  bare
                  value={draft}
                  onChange={setDraft}
                  f1Roster={f1Roster}
                />
              </div>
            </div>
          )
        )}

        {step > 0 && (
          <div className="sticky bottom-0 -mx-5 sm:-mx-8 px-5 sm:px-8 py-4 glass border-t hairline flex items-center justify-between gap-3">
            <button type="button" onClick={() => setStep((s) => s - 1)} className="chip h-11 px-5">
              ← Back
            </button>
            {last ? (
              <button type="button" onClick={() => finish(false)} className="chip chip-signal h-11 px-6">
                Print my first edition →
              </button>
            ) : (
              <button type="button" onClick={() => setStep((s) => s + 1)} className="chip chip-signal h-11 px-6">
                Next →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
