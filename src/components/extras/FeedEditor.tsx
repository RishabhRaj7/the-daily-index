"use client";

import { useState } from "react";
import { cleanXHandle, loadPersonalization } from "@/lib/personalization";
import { defaultFeed, FEED_LIMITS, FEED_META, feedFor, saveFeed, type FeedConfig, type FeedSection } from "@/lib/feeds";
import Sheet from "./Sheet";
import { SourceLogo } from "./SocialFeed";

// Edit a section's feeds: the X accounts, X searches and subreddits its list
// reads (lib/feeds.ts). Starts from what the section reads now (the paper's
// defaults until edited); Save keeps it on this device and sync carries it to
// the others; "Use the defaults" goes back to the paper's list.

const cleanSearch = (raw: string) => {
  const s = raw.replace(/\s+/g, " ").trim();
  return s.length >= 2 && s.length <= 60 && !/[|,]/.test(s) ? s : null;
};
const cleanSub = (raw: string) => {
  const s = raw.trim().replace(/^\/?r\//i, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9_]{2,21}$/.test(s) ? s : null;
};

function ChipField({
  label,
  logo,
  values,
  max,
  prefix = "",
  placeholder,
  clean,
  invalid,
  suggest = [],
  onChange,
}: {
  label: string;
  logo?: "x" | "reddit";
  values: string[];
  max: number;
  prefix?: string;
  placeholder: string;
  clean: (raw: string) => string | null;
  invalid: string;
  suggest?: string[];
  onChange: (next: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());
  const add = (raw: string) => {
    const v = clean(raw);
    if (!v) return setBad(raw.trim() !== "");
    setBad(false);
    setText("");
    if (!has(v) && values.length < max) onChange([...values, v]);
  };
  const full = values.length >= max;
  return (
    <div className="py-4 border-t hairline first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="flex items-center gap-2 font-label text-[10px] text-ink-soft">
          {logo && <SourceLogo source={logo} size={14} />}
          {label}
        </span>
        <span className="font-mono text-[10px] text-ink-faint tabular-nums">
          {values.length}/{max}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border hairline px-2 py-1.5 min-h-[42px] focus-within:border-[color:var(--section-hue,var(--accent))]">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-[var(--card-bg)] border hairline pl-2.5 pr-1 h-7 font-sans text-[12.5px]">
            {prefix}
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="w-5 h-5 rounded-full grid place-items-center text-ink-faint hover:text-ink" aria-label={`Remove ${prefix}${v}`}>
              ×
            </button>
          </span>
        ))}
        <input
          value={text}
          disabled={full}
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || (e.key === "," && prefix)) {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
          placeholder={full ? "Full" : values.length ? "Add another" : placeholder}
          className="flex-1 min-w-[9rem] bg-transparent outline-none font-sans text-[13px] h-7 px-1"
          aria-label={label}
        />
      </div>
      <p className="font-sans text-[11px] mt-1.5 min-h-[1rem]" style={{ color: bad ? "var(--down)" : undefined }}>
        {bad ? invalid : <span className="text-ink-faint">Enter to add · Backspace removes the last</span>}
      </p>
      {suggest.filter((s) => !has(s)).length > 0 && !full && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {suggest
            .filter((s) => !has(s))
            .map((s) => (
              <button key={s} type="button" onClick={() => onChange([...values, s])} className="font-sans text-[11.5px] px-2 py-0.5 border hairline rounded-full text-ink-soft hover:text-ink hover:bg-[var(--card-bg)]">
                + {prefix}
                {s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function FeedEditor({ section, onDone }: { section: FeedSection; onDone: () => void }) {
  const meta = FEED_META[section];
  const [draft, setDraft] = useState<FeedConfig>(() => feedFor(section, loadPersonalization()).config);
  const defaults = defaultFeed(section, loadPersonalization());
  const same = (a: FeedConfig, b: FeedConfig) => JSON.stringify(a) === JSON.stringify(b);
  const custom = feedFor(section, loadPersonalization()).custom;
  return (
    <div>
      <p className="font-sans text-[13px] text-ink-soft mb-5">{meta.hint}</p>
      <ChipField
        label={section === "ipo" ? "Preferred X accounts" : "X accounts"}
        logo="x"
        values={draft.x}
        max={FEED_LIMITS.x}
        prefix="@"
        placeholder="A handle, or an x.com link"
        clean={cleanXHandle}
        invalid="An X handle: up to 15 letters, numbers or underscores."
        suggest={meta.suggest.x}
        onChange={(x) => setDraft({ ...draft, x })}
      />
      {meta.searches && (
        <ChipField
          label="X searches"
          logo="x"
          values={draft.searches}
          max={FEED_LIMITS.searches}
          placeholder="e.g. Nvidia earnings"
          clean={cleanSearch}
          invalid="2 to 60 characters, no commas."
          onChange={(searches) => setDraft({ ...draft, searches })}
        />
      )}
      <ChipField
        label="Subreddits"
        logo="reddit"
        values={draft.subs}
        max={FEED_LIMITS.subs}
        prefix="r/"
        placeholder="e.g. formula1"
        clean={cleanSub}
        invalid="A subreddit's name: 2 to 21 letters, numbers or underscores."
        suggest={meta.suggest.subs}
        onChange={(subs) => setDraft({ ...draft, subs })}
      />
      <div className="sticky bottom-0 mt-4 pt-4 pb-1 bg-surface border-t hairline flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={!custom && same(draft, defaults)}
          onClick={() => {
            saveFeed(section, null);
            onDone();
          }}
          className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink disabled:opacity-40"
        >
          Use the defaults
        </button>
        <span className="flex gap-2">
          <button type="button" className="chip" onClick={onDone}>
            Cancel
          </button>
          <button
            type="button"
            className="chip chip-signal"
            onClick={() => {
              saveFeed(section, draft);
              onDone();
            }}
          >
            Save
          </button>
        </span>
      </div>
    </div>
  );
}

/** "Edit feeds": opens the section's editor in the paper's sheet. */
export function EditFeedsButton({ section, className = "", iconOnly = false }: { section: FeedSection; className?: string; /** Just the sliders mark (a small card's header). */ iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = FEED_META[section];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={iconOnly ? `w-7 h-7 rounded-full grid place-items-center text-ink-soft hover:text-ink hover:bg-[var(--card-bg)] shrink-0 ${className}` : `chip h-7 px-2.5 text-[11.5px] gap-1.5 shrink-0 ${className}`}
        title="Choose the X accounts, searches and subreddits this list reads"
        aria-label={iconOnly ? "Edit feeds" : undefined}
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
          <circle cx="10" cy="4.5" r="1.5" />
          <circle cx="6" cy="11.5" r="1.5" />
        </svg>
        {!iconOnly && "Edit feeds"}
      </button>
      {open && (
        <Sheet title={meta.title} kicker={meta.kicker} onClose={() => setOpen(false)} width={640}>
          <FeedEditor section={section} onDone={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}
