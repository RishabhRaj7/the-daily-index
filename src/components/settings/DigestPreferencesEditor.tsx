"use client";

// "Your news" — what the AI editor puts in the paper. A plain-language view
// over the digest preferences JSON (lib/preferences/types.ts). Internals the
// reader never needs to see — section ids, types, display slots, preferred
// sources, age window — are kept as they are but not shown; the raw JSON is
// still reachable under Advanced.
//
// Controlled: the settings page owns the draft and saves it with everything
// else in one action.

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { DEFAULT_DIGEST_PREFERENCES } from "@/lib/preferences/storage";
import type { DigestPreferences, DigestSection } from "@/lib/preferences/types";

export const inputCls =
  "w-full border hairline bg-surface rounded-lg px-3 py-2 text-sm font-body transition-colors focus:outline-none focus:border-accent";
export const labelCls = "font-label text-[11px] text-ink-soft block mb-1";

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
  { label: "Short", words: 50 },
  { label: "Standard", words: 90 },
  { label: "Detailed", words: 140 },
];

// ---- small controls -------------------------------------------------------------

export function TagInput({
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
    <div className="flex flex-wrap items-center gap-1.5 border hairline bg-surface rounded-xl px-2.5 py-2 focus-within:border-accent transition-colors">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 bg-card-bg border hairline rounded-full px-2.5 py-0.5 text-xs font-sans">
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-ink-soft hover:text-accent"
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

export function Stepper({
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
          className={`font-label text-[11px] px-3.5 py-1.5 border rounded-full transition-colors ${
            value === o.value ? "border-accent bg-accent text-accent-ink" : "hairline hover:bg-card-bg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- editor ----------------------------------------------------------------------

// One line per collapsed section card: "5 stories · 2 priorities".
export function sectionSummary(section: DigestSection): string {
  const count =
    section.type === "grouped"
      ? `${section.articleCountPerGroup} per ${section.groupBy} · ${section.groups.length} ${section.groupBy === "country" ? "countries" : "groups"}`
      : `${section.articleCount} ${section.articleCount === 1 ? "story" : "stories"}`;
  const watch = section.watchEntities?.length ?? 0;
  const note = section.type === "custom" ? (section.instruction ? " · custom brief" : "") : section.prompt ? " · note" : "";
  return `${count}${watch ? ` · ${watch} ${watch === 1 ? "priority" : "priorities"}` : ""}${note}`;
}

export default function DigestPreferencesEditor({
  value,
  onChange,
  view = "all",
}: {
  value: DigestPreferences;
  onChange: (next: DigestPreferences) => void;
  /** Settings shows the global rules on News, and the JSON under Sections (each section's own settings are in Page order). */
  view?: "all" | "general" | "sections";
}) {
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const g = value.global;
  const toneMatch = TONES.find((t) => t.value === g.tone)?.value ?? null;
  const [customTone, setCustomTone] = useState(toneMatch === null);

  const updateGlobal = (patch: Partial<DigestPreferences["global"]>) =>
    onChange({ ...value, global: { ...g, ...patch } });

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
      {view !== "sections" && (
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={g.avoidPolitics}
            onChange={(e) => updateGlobal({ avoidPolitics: e.target.checked })}
            className="accent-[var(--accent)] w-4 h-4 mt-0.5 shrink-0"
          />
          <span>
            <span className="font-label text-[11px] block">Skip party politics</span>
            <span className="font-body text-xs text-ink-soft">
              Elections, campaigns and party fights stay out. Geopolitics and policy that moves
              markets, tech or sport stay in.
            </span>
          </span>
        </label>
        {customTone && (
          <input
            className={inputCls}
            value={g.tone}
            onChange={(e) => updateGlobal({ tone: e.target.value })}
            placeholder="Describe how summaries should read"
          />
        )}
      </section>
      )}

      {view !== "general" && (
      <details className="border-t hairline pt-3">
        <summary className="font-label text-[11px] text-ink-soft cursor-pointer">Advanced — edit as JSON</summary>
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
          {jsonError && <p className="font-mono text-xs text-accent"><WarningCircleIcon size={13} className="inline align-[-2px]" aria-hidden="true" /> {jsonError}</p>}
          <div className="flex gap-4 items-center">
            <button
              type="button"
              onClick={applyJson}
              disabled={jsonText === null}
              className="font-label text-[11px] px-3 py-1.5 bg-ink text-paper disabled:opacity-40"
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
              className="font-label text-[11px] underline text-ink-soft"
            >
              Reset news preferences to defaults
            </button>
          </div>
        </div>
      </details>
      )}
    </div>
  );
}

/** What fills one news section: its story count, what it always puts first, and a note to the editor (Settings → Sections, under each row of Page order). */
export function SectionSettings({ section, onChange }: { section: DigestSection; onChange: (next: DigestSection) => void }) {
  const update = (patch: Partial<DigestSection>) => onChange({ ...section, ...patch } as DigestSection);
  return (
    <div className="space-y-3">
      {section.type === "custom" && (
        <div>
          <span className={labelCls}>What belongs here?</span>
          <textarea
            className={`${inputCls} min-h-14`}
            value={section.instruction}
            onChange={(e) => update({ instruction: e.target.value })}
            placeholder="e.g. The most surprising science story of the day"
          />
        </div>
      )}

      {section.type === "grouped" ? (
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-start">
          <div>
            <span className={labelCls}>Stories per {section.groupBy}</span>
            <Stepper
              value={section.articleCountPerGroup}
              max={5}
              onChange={(n) => update({ articleCountPerGroup: n })}
            />
          </div>
          <div>
            <span className={labelCls}>{section.groupBy === "country" ? "Countries" : "Groups"}</span>
            <TagInput
              values={section.groups}
              onChange={(groups) => groups.length > 0 && update({ groups })}
              placeholder="Add one"
            />
          </div>
        </div>
      ) : (
        <div>
          <span className={labelCls}>Stories</span>
          <Stepper
            value={section.articleCount}
            onChange={(n) => update({ articleCount: n })}
          />
        </div>
      )}

      <div>
        <span className={labelCls}>Always prioritise here</span>
        <TagInput
          values={section.watchEntities ?? []}
          onChange={(watchEntities) => update({ watchEntities })}
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
            onChange={(e) => update({ prompt: e.target.value })}
            placeholder="e.g. Prefer race results over transfer rumours"
          />
        </div>
      )}
    </div>
  );
}
