"use client";

// The "Digest" tab of the settings page: a GUI over the same JSON that ships
// in src/lib/preferences/default-preferences.json. Edits persist to this
// device only (localStorage) and fire an event the front page listens for.

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_DIGEST_PREFERENCES,
  loadDigestPreferences,
  resetDigestPreferences,
  saveDigestPreferences,
  slugifyId,
} from "@/lib/preferences/storage";
import {
  NEWS_SLOTS,
  SLOT_LABELS,
  type DigestPreferences,
  type DigestSection,
} from "@/lib/preferences/types";
import type { CreditCard } from "@/lib/types";

const inputCls =
  "w-full border hairline bg-paper px-2.5 py-1.5 text-sm font-body focus:outline-none focus:border-masthead-red";
const labelCls = "font-label text-[10px] text-ink-soft block mb-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      {children}
    </div>
  );
}

function csv(value: string[] | undefined): string {
  return (value ?? []).join(", ");
}

function parseCsv(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function newId(existing: DigestSection[], base: string): string {
  let id = slugifyId(base);
  let n = 2;
  while (existing.some((s) => s.id === id)) id = `${slugifyId(base)}-${n++}`;
  return id;
}

export default function DigestPreferencesEditor({
  creditCards,
  cardsFollowing,
  sportsWatchedEntities,
  onClose,
  onSavePaperDraft,
}: {
  creditCards: CreditCard[];
  cardsFollowing: string[];
  sportsWatchedEntities: string[];
  onClose: () => void;
  onSavePaperDraft: () => void;
}) {
  const [draft, setDraft] = useState<DigestPreferences | null>(null);
  const [baseline, setBaseline] = useState("");
  const [saved, setSaved] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadDigestPreferences();
    // localStorage is the external source being hydrated into this client component.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(loaded);
    setBaseline(JSON.stringify(loaded));
  }, []);

  // Keep the digest view in step with card checkboxes on the Paper tab. Card
  // names are the user's labels; issuer text belongs in the card fact file,
  // not in the watched-entity prompt.
  const syncedDraft = useMemo(() => {
    if (!draft) return null;
    const followedNames = creditCards
      .filter((card) => cardsFollowing.includes(card.id))
      .map((card) => card.name);
    const managedNames = new Set(
      creditCards.flatMap((card) => [card.name, `${card.issuer} ${card.name}`]),
    );
    const managedSportsNames = new Set(sportsWatchedEntities);
    return {
      ...draft,
      sections: draft.sections.map((section) => {
        if (section.slot === "plastic-points") {
          return {
            ...section,
            watchEntities: [
              ...(section.watchEntities ?? []).filter((entity) => !managedNames.has(entity)),
              ...followedNames,
            ],
          };
        }
        if (section.slot === "sports") {
          return {
            ...section,
            watchEntities: [
              ...(section.watchEntities ?? []).filter((entity) => !managedSportsNames.has(entity)),
              ...sportsWatchedEntities,
            ],
          };
        }
        return section;
      }),
    };
  }, [draft, cardsFollowing, creditCards, sportsWatchedEntities]);

  const dirty = useMemo(
    () => {
      return syncedDraft !== null && baseline !== "" && JSON.stringify(syncedDraft) !== baseline;
    },
    [syncedDraft, baseline],
  );

  if (!draft) {
    return <p className="font-body text-sm text-ink-soft">Loading your digest preferences…</p>;
  }

  const update = (patch: Partial<DigestPreferences>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setSaved(false);
    setJsonError(null);
  };

  const updateGlobal = (patch: Partial<DigestPreferences["global"]>) =>
    update({ global: { ...draft.global, ...patch } });

  const updateSection = (id: string, patch: Partial<DigestSection>) =>
    update({
      sections: draft.sections.map((s) => (s.id === id ? ({ ...s, ...patch } as DigestSection) : s)),
    });

  const removeSection = (id: string) =>
    update({ sections: draft.sections.filter((s) => s.id !== id) });

  const sorted = [...(syncedDraft?.sections ?? [])].sort((a, b) => a.order - b.order);

  const move = (id: string, dir: -1 | 1) => {
    const idx = sorted.findIndex((s) => s.id === id);
    const swap = sorted[idx + dir];
    const self = sorted[idx];
    if (!swap || !self) return;
    update({
      sections: draft.sections.map((s) => {
        if (s.id === self.id) return { ...s, order: swap.order };
        if (s.id === swap.id) return { ...s, order: self.order };
        return s;
      }),
    });
  };

  const addSection = (type: DigestSection["type"]) => {
    const maxOrder = Math.max(0, ...draft.sections.map((s) => s.order));
    const id = newId(draft.sections, type === "grouped" ? "new-group" : type === "custom" ? "new-custom" : "new-topic");
    const base = {
      id,
      label: type === "grouped" ? "New group" : type === "custom" ? "New custom section" : "New topic",
      order: maxOrder + 10,
      prompt: "",
      watchEntities: [],
      excludeKeywords: [],
      preferredSources: [],
    };
    const section: DigestSection =
      type === "grouped"
        ? { ...base, type, groupBy: "country", groups: ["India", "United States"], articleCountPerGroup: 1 }
        : type === "custom"
          ? { ...base, type, instruction: "Pick the most surprising story in the corpus.", articleCount: 3 }
          : { ...base, type, articleCount: 5 };
    update({ sections: [...draft.sections, section] });
  };

  const changeType = (id: string, type: DigestSection["type"]) => {
    const current = draft.sections.find((s) => s.id === id);
    if (!current || current.type === type) return;
    const base = {
      id: current.id,
      label: current.label,
      order: current.order,
      slot: current.slot,
      preferredSources: current.preferredSources,
      excludeKeywords: current.excludeKeywords,
      watchEntities: current.watchEntities,
      prompt: current.prompt,
    };
    let next: DigestSection;
    if (type === "grouped") {
      next = { ...base, type, groupBy: "country", groups: ["India", "United States"], articleCountPerGroup: 1 };
    } else if (type === "custom") {
      next = { ...base, type, instruction: "", articleCount: 3 };
    } else {
      next = { ...base, type, articleCount: 5 };
    }
    update({ sections: draft.sections.map((s) => (s.id === id ? next : s)) });
  };

  const handleSave = () => {
    if (!syncedDraft) return;
    const followedNames = creditCards
      .filter((card) => cardsFollowing.includes(card.id))
      .map((card) => card.name);
    const cardNames = new Set(
      creditCards.flatMap((card) => [card.name, `${card.issuer} ${card.name}`]),
    );
    const next = {
      ...syncedDraft,
      sections: syncedDraft.sections.map((section) =>
        section.slot === "plastic-points"
          ? {
              ...section,
              watchEntities: [
                ...(section.watchEntities ?? []).filter((entity) => !cardNames.has(entity)),
                ...followedNames,
              ],
            }
          : section,
      ),
    };
    saveDigestPreferences(next);
    // Card selections live in the shared Paper draft. Persist that draft in
    // the same save action so the derived Plastic & Points entities survive a
    // full reload of Settings.
    onSavePaperDraft();
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setSaved(true);
    setTimeout(() => { window.location.href = "/"; }, 600);
  };

  const handleReset = () => {
    const defaults = resetDigestPreferences();
    setDraft(defaults);
    setBaseline(JSON.stringify(defaults));
    setSaved(false);
    setJsonError(null);
  };

  const openJson = () => {
    setJsonText(JSON.stringify(syncedDraft, null, 2));
    setJsonError(null);
    setShowJson((v) => !v);
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as DigestPreferences;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) {
        throw new Error('Expected an object with a "sections" array.');
      }
      // Round-trip through the editor's own save() so normalisation and the
      // change event behave exactly like a GUI edit.
      const normalised = JSON.parse(JSON.stringify(parsed)) as DigestPreferences;
      setDraft(normalised);
      setJsonError(null);
      setSaved(false);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON.");
    }
  };

  return (
    <div className="space-y-8">
      <section className="border-t-2 border-ink pt-4">
        <div className="font-label text-[10px] text-masthead-red mb-1">Global rules</div>
        <p className="font-body text-sm text-ink-soft mb-4">
          Applied to every section before its own rules. These live in the same JSON you can
          hand-edit at <span className="font-mono text-xs">src/lib/preferences/default-preferences.json</span>.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Tone for all summaries">
              <input
                className={inputCls}
                value={draft.global.tone}
                onChange={(e) => updateGlobal({ tone: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Topics to watch (comma-separated, prioritised everywhere)">
              <input
                className={inputCls}
                value={csv(draft.global.watchTopics)}
                onChange={(e) => updateGlobal({ watchTopics: parseCsv(e.target.value) })}
                placeholder="e.g. RBI, monsoon, ISRO"
              />
            </Field>
          </div>
          <Field label="Max article age (hours)">
            <input
              type="number"
              min={1}
              max={336}
              className={inputCls}
              value={draft.global.maxAgeHours}
              onChange={(e) => updateGlobal({ maxAgeHours: Number(e.target.value) || 24 })}
            />
          </Field>
          <Field label="Summary length (words, approx.)">
            <input
              type="number"
              min={10}
              max={300}
              className={inputCls}
              value={draft.global.summaryLengthWords}
              onChange={(e) => updateGlobal({ summaryLengthWords: Number(e.target.value) || 60 })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Exclude keywords (comma-separated, never selected)">
              <input
                className={inputCls}
                value={csv(draft.global.excludeKeywords)}
                onChange={(e) => updateGlobal({ excludeKeywords: parseCsv(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="border-t-2 border-ink pt-4">
        <div className="font-label text-[10px] text-masthead-red mb-1">Sections</div>
        <p className="font-body text-sm text-ink-soft mb-4">
          The AI fills each section from today&rsquo;s collated feed, in this order. Sections with a
          display slot pour into the paper&rsquo;s existing pages; the rest print as their own sections.
        </p>

        <div className="space-y-5">
          {sorted.map((section, idx) => (
            <div key={section.id} className="border hairline bg-card-bg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-ink-soft">
                  #{idx + 1} · id: {section.id} · {section.type}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => move(section.id, -1)} disabled={idx === 0}
                    className="font-label text-[10px] underline disabled:opacity-30">↑ up</button>
                  <button type="button" onClick={() => move(section.id, 1)} disabled={idx === sorted.length - 1}
                    className="font-label text-[10px] underline disabled:opacity-30">↓ down</button>
                  <button type="button" onClick={() => removeSection(section.id)}
                    className="font-label text-[10px] text-masthead-red underline">remove</button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Label">
                  <input className={inputCls} value={section.label}
                    onChange={(e) => updateSection(section.id, { label: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <select className={inputCls} value={section.type}
                      onChange={(e) => changeType(section.id, e.target.value as DigestSection["type"])}>
                      <option value="topic">topic</option>
                      <option value="grouped">grouped</option>
                      <option value="custom">custom</option>
                    </select>
                  </Field>
                  <Field label="Display slot">
                    <select className={inputCls} value={section.slot ?? ""}
                      onChange={(e) => updateSection(section.id, { slot: (e.target.value || undefined) as DigestSection["slot"] })}>
                      <option value="">own section</option>
                      {NEWS_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>{SLOT_LABELS[slot]}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                {section.type === "topic" && (
                  <Field label="Article count">
                    <input type="number" min={1} max={15} className={inputCls} value={section.articleCount}
                      onChange={(e) => updateSection(section.id, { articleCount: Number(e.target.value) || 5 })} />
                  </Field>
                )}
                {section.type === "custom" && (
                  <Field label="Article count">
                    <input type="number" min={1} max={15} className={inputCls} value={section.articleCount}
                      onChange={(e) => updateSection(section.id, { articleCount: Number(e.target.value) || 3 })} />
                  </Field>
                )}
                {section.type === "custom" && (
                  <div className="sm:col-span-2">
                    <Field label="Instruction (the AI follows it literally)">
                      <textarea className={`${inputCls} min-h-16`} value={section.instruction}
                        onChange={(e) => updateSection(section.id, { instruction: e.target.value })} />
                    </Field>
                  </div>
                )}
                {section.type === "grouped" && (
                  <>
                    <Field label="Group by">
                      <input className={inputCls} value={section.groupBy}
                        onChange={(e) => updateSection(section.id, { groupBy: e.target.value })} />
                    </Field>
                    <Field label="Articles per group">
                      <input type="number" min={1} max={10} className={inputCls} value={section.articleCountPerGroup}
                        onChange={(e) => updateSection(section.id, { articleCountPerGroup: Number(e.target.value) || 1 })} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Groups (comma-separated)">
                        <input className={inputCls} value={csv(section.groups)}
                          onChange={(e) => updateSection(section.id, { groups: parseCsv(e.target.value) })} />
                      </Field>
                    </div>
                  </>
                )}

                <div className="sm:col-span-2">
                  <Field label="Watch entities (comma-separated — prioritise articles mentioning these)">
                    <input className={inputCls} value={csv(section.watchEntities)}
                      onChange={(e) => updateSection(section.id, { watchEntities: parseCsv(e.target.value) })} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Extra prompt (selection + summarisation guidance for this section)">
                    <textarea className={`${inputCls} min-h-16`} value={section.prompt ?? ""}
                      onChange={(e) => updateSection(section.id, { prompt: e.target.value })} />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" onClick={() => addSection("topic")}
            className="font-label text-[10px] px-3 py-1.5 border hairline hover:bg-card-bg">+ topic section</button>
          <button type="button" onClick={() => addSection("grouped")}
            className="font-label text-[10px] px-3 py-1.5 border hairline hover:bg-card-bg">+ grouped section</button>
          <button type="button" onClick={() => addSection("custom")}
            className="font-label text-[10px] px-3 py-1.5 border hairline hover:bg-card-bg">+ custom section</button>
        </div>
      </section>

      <section className="border-t-2 border-ink pt-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="font-label text-[10px] text-masthead-red">Raw JSON</div>
          <button type="button" onClick={openJson} className="font-label text-[10px] underline">
            {showJson ? "hide" : "edit as JSON"}
          </button>
        </div>
        {showJson && (
          <div className="space-y-2">
            <textarea
              className={`${inputCls} font-mono text-xs min-h-72`}
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }}
              spellCheck={false}
            />
            {jsonError && (
              <p className="font-mono text-xs text-masthead-red">✗ {jsonError}</p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={applyJson}
                className="font-label text-[10px] px-3 py-1.5 bg-ink text-paper">Apply JSON to editor</button>
            </div>
          </div>
        )}
      </section>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t hairline bg-paper/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="text-sm underline text-ink-soft">
            ← {dirty ? "Discard changes" : "Back to the paper"}
          </button>
          <span className="font-mono text-[11px] text-ink-soft hidden sm:block">
            {saved ? "Saved — reprinting…" : dirty ? "Unsaved digest changes" : "Everything saved"}
          </span>
          <button type="button" onClick={handleReset} className="text-sm underline text-ink-soft hidden sm:block">
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saved}
            className="font-label text-xs px-5 py-2.5 bg-masthead-red text-paper rounded-sm disabled:opacity-40 transition-opacity"
          >
            {saved ? "Saved ✓" : "Save & reprint →"}
          </button>
        </div>
      </div>
    </div>
  );
}
