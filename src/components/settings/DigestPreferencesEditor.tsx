"use client";

// "Your news" — what the AI editor puts in the paper. A plain-language view
// over the digest preferences JSON (lib/preferences/types.ts). Internals the
// reader never needs to see — section ids, types, display slots, preferred
// sources, age window — are kept as they are but not shown; the raw JSON is
// still reachable under Advanced.
//
// Controlled: the settings page owns the draft and saves it with everything
// else in one action.

import { useState } from "react";
import { DEFAULT_DIGEST_PREFERENCES } from "@/lib/preferences/storage";
import type { DigestPreferences, DigestSection } from "@/lib/preferences/types";

const inputCls =
  "w-full border hairline bg-paper px-2.5 py-1.5 text-sm font-body focus:outline-none focus:border-masthead-red";
const labelCls = "font-label text-[10px] text-ink-soft block mb-1";

const TONES = [
  { label: "Straight news", value: DEFAULT_DIGEST_PREFERENCES.global.tone },
  {
    label: "Conversational",
    value: "Plain and conversational, like a well-read friend explaining it — still strictly factual, no hype.",
  },
  {
    label: "Analytical",
    value: "Lead with the fact, then what it means and what to watch next — only from what the article says.",
  },
];

const LENGTHS = [
  { label: "Short", words: 35 },
  { label: "Standard", words: 60 },
  { label: "Detailed", words: 100 },
];

// ---- small controls -------------------------------------------------------------

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
    const next = [...values];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setText("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 border hairline bg-paper px-2 py-1.5 focus-within:border-masthead-red">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 bg-card-bg border hairline px-2 py-0.5 text-xs">
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-ink-soft hover:text-masthead-red"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !text && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && add()}
        placeholder={values.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[8rem] bg-transparent text-sm font-body focus:outline-none py-0.5"
      />
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min = 1,
  max = 10,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const btn = "w-7 h-7 border hairline font-mono text-sm disabled:opacity-30 hover:bg-card-bg";
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Fewer">
        −
      </button>
      <span className="font-mono text-sm tabular-nums w-5 text-center">{value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="More">
        +
      </button>
    </div>
  );
}

function Choice<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`font-label text-[10px] px-3 py-1.5 border transition-colors ${
            value === o.value ? "border-masthead-red bg-masthead-red text-paper" : "hairline hover:bg-card-bg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- editor ----------------------------------------------------------------------

export default function DigestPreferencesEditor({
  value,
  onChange,
}: {
  value: DigestPreferences;
  onChange: (next: DigestPreferences) => void;
}) {
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const g = value.global;
  const sorted = [...value.sections].sort((a, b) => a.order - b.order);
  const toneMatch = TONES.find((t) => t.value === g.tone)?.value ?? null;
  const [customTone, setCustomTone] = useState(toneMatch === null);

  const updateGlobal = (patch: Partial<DigestPreferences["global"]>) =>
    onChange({ ...value, global: { ...g, ...patch } });

  const updateSection = (id: string, patch: Partial<DigestSection>) =>
    onChange({
      ...value,
      sections: value.sections.map((s) => (s.id === id ? ({ ...s, ...patch } as DigestSection) : s)),
    });

  const move = (id: string, dir: -1 | 1) => {
    const i = sorted.findIndex((s) => s.id === id);
    const self = sorted[i];
    const other = sorted[i + dir];
    if (!self || !other) return;
    onChange({
      ...value,
      sections: value.sections.map((s) =>
        s.id === self.id ? { ...s, order: other.order } : s.id === other.id ? { ...s, order: self.order } : s,
      ),
    });
  };

  const addSection = () => {
    let id = "my-section";
    for (let n = 2; value.sections.some((s) => s.id === id); n++) id = `my-section-${n}`;
    const order = Math.max(0, ...value.sections.map((s) => s.order)) + 10;
    onChange({
      ...value,
      sections: [
        ...value.sections,
        { id, type: "custom", label: "New section", order, instruction: "", articleCount: 3, watchEntities: [] },
      ],
    });
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText ?? "") as DigestPreferences;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) {
        throw new Error('Expected an object with a "sections" array.');
      }
      onChange(parsed);
      setJsonText(null);
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Across the whole paper */}
      <section className="space-y-5">
        <div>
          <span className={labelCls}>Always prioritise</span>
          <TagInput
            values={g.watchTopics}
            onChange={(watchTopics) => updateGlobal({ watchTopics })}
            placeholder="People, teams, companies, topics — e.g. Verstappen, RBI, ISRO"
          />
        </div>
        <div>
          <span className={labelCls}>Never show me</span>
          <TagInput
            values={g.excludeKeywords}
            onChange={(excludeKeywords) => updateGlobal({ excludeKeywords })}
            placeholder="e.g. horoscope, celebrity gossip"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <span className={labelCls}>Summary length</span>
            <Choice
              options={LENGTHS.map((l) => ({ label: l.label, value: l.words }))}
              value={LENGTHS.find((l) => l.words === g.summaryLengthWords)?.words ?? null}
              onChange={(summaryLengthWords) => updateGlobal({ summaryLengthWords })}
            />
          </div>
          <div>
            <span className={labelCls}>Voice</span>
            <Choice
              options={[...TONES.map((t) => ({ label: t.label, value: t.value })), { label: "Custom", value: "__custom__" }]}
              value={customTone ? "__custom__" : toneMatch}
              onChange={(v) => {
                if (v === "__custom__") {
                  setCustomTone(true);
                } else {
                  setCustomTone(false);
                  updateGlobal({ tone: v });
                }
              }}
            />
          </div>
        </div>
        {customTone && (
          <input
            className={inputCls}
            value={g.tone}
            onChange={(e) => updateGlobal({ tone: e.target.value })}
            placeholder="Describe how summaries should read"
          />
        )}
      </section>

      {/* Sections */}
      <section>
        <p className="font-body text-sm text-ink-soft mb-4">
          Each section is filled by the AI editor from today&rsquo;s feeds, in this order.
        </p>
        <div className="space-y-4">
          {sorted.map((section, idx) => (
            <div key={section.id} className="border hairline p-4 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  aria-label="Section name"
                  className="flex-1 min-w-0 bg-transparent font-headline text-lg font-semibold focus:outline-none border-b border-transparent focus:border-masthead-red"
                  value={section.label}
                  onChange={(e) => updateSection(section.id, { label: e.target.value })}
                />
                <div className="flex items-center gap-3 font-label text-[10px]">
                  <button
                    type="button"
                    onClick={() => move(section.id, -1)}
                    disabled={idx === 0}
                    className="underline disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(section.id, 1)}
                    disabled={idx === sorted.length - 1}
                    className="underline disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...value, sections: value.sections.filter((s) => s.id !== section.id) })
                    }
                    disabled={value.sections.length === 1}
                    className="text-masthead-red underline disabled:opacity-30"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {section.type === "custom" && (
                <div>
                  <span className={labelCls}>What belongs here?</span>
                  <textarea
                    className={`${inputCls} min-h-14`}
                    value={section.instruction}
                    onChange={(e) => updateSection(section.id, { instruction: e.target.value })}
                    placeholder="e.g. The most surprising science story of the day"
                  />
                </div>
              )}

              {section.type === "grouped" ? (
                <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
                  <div>
                    <span className={labelCls}>Stories per {section.groupBy}</span>
                    <Stepper
                      value={section.articleCountPerGroup}
                      max={5}
                      onChange={(n) => updateSection(section.id, { articleCountPerGroup: n })}
                    />
                  </div>
                  <div>
                    <span className={labelCls}>{section.groupBy === "country" ? "Countries" : "Groups"}</span>
                    <TagInput
                      values={section.groups}
                      onChange={(groups) => groups.length > 0 && updateSection(section.id, { groups })}
                      placeholder="Add one"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <span className={labelCls}>Stories</span>
                  <Stepper
                    value={section.articleCount}
                    onChange={(n) => updateSection(section.id, { articleCount: n })}
                  />
                </div>
              )}

              <div>
                <span className={labelCls}>Always prioritise here</span>
                <TagInput
                  values={section.watchEntities ?? []}
                  onChange={(watchEntities) => updateSection(section.id, { watchEntities })}
                  placeholder="e.g. a driver, a stock, a company"
                />
              </div>
              {section.type !== "custom" && (
                <div>
                  <span className={labelCls}>Note to the editor</span>
                  <textarea
                    rows={2}
                    className={`${inputCls} resize-y`}
                    value={section.prompt ?? ""}
                    onChange={(e) => updateSection(section.id, { prompt: e.target.value })}
                    placeholder="e.g. Prefer race results over transfer rumours"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addSection}
          className="mt-4 font-label text-[10px] px-3 py-2 border hairline hover:bg-card-bg"
        >
          + Add a section
        </button>
      </section>

      <details className="border-t hairline pt-3">
        <summary className="font-label text-[10px] text-ink-soft cursor-pointer">Advanced — edit as JSON</summary>
        <div className="space-y-2 mt-3">
          <textarea
            className={`${inputCls} font-mono text-xs min-h-72`}
            value={jsonText ?? JSON.stringify(value, null, 2)}
            onChange={(e) => {
              setJsonText(e.target.value);
              setJsonError(null);
            }}
            spellCheck={false}
          />
          {jsonError && <p className="font-mono text-xs text-masthead-red">✗ {jsonError}</p>}
          <div className="flex gap-4 items-center">
            <button
              type="button"
              onClick={applyJson}
              disabled={jsonText === null}
              className="font-label text-[10px] px-3 py-1.5 bg-ink text-paper disabled:opacity-40"
            >
              Apply JSON
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(structuredClone(DEFAULT_DIGEST_PREFERENCES));
                setJsonText(null);
                setCustomTone(false);
              }}
              className="font-label text-[10px] underline text-ink-soft"
            >
              Reset news preferences to defaults
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
